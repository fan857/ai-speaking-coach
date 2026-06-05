import json
import asyncio
import re
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import get_ai_provider_config
from app.mock_feedback import get_mock_immersive_result, get_mock_practice_result
from app.prompts import format_history_for_prompt
from app.scenarios import SCENARIOS
from app.schemas import ConversationMessage


router = APIRouter(prefix="/api")

PUNCTUATION_PATTERN = re.compile(r"([。？！.!?])")


class StreamPracticeRequest(BaseModel):
    scenarioId: str
    transcript: str
    mode: str = "immersive"
    history: list[ConversationMessage] = Field(default_factory=list)
    skipInstantAck: bool = False
    preferFastLocal: bool = False


def build_instant_ack(transcript: str) -> str:
    lower_text = transcript.lower()

    if any(word in lower_text for word in ["forgot", "forget", "don't remember", "not sure", "no idea"]):
        return "No problem."

    if any(word in lower_text for word in ["sorry", "nervous", "difficult", "hard"]):
        return "That's okay."

    if len(transcript.split()) <= 5:
        return "Got it."

    return "That sounds interesting."


def build_stream_prompt(scenario_id: str, transcript: str, history: list[ConversationMessage], mode: str) -> str:
    scenario = SCENARIOS[scenario_id]
    feedback_rule = (
        "Do not correct grammar during this turn. Keep the rhythm of conversation first."
        if mode == "immersive"
        else "Reply naturally first, then include one short coaching hint if it fits."
    )

    return "\n".join(
        [
            "You are an AI English speaking coach in a low-latency voice conversation.",
            f"Practice scenario: {scenario['name']}",
            f"Your role: {scenario['aiRole']}",
            f"Practice goal: {scenario['goal']}",
            "Conversation history:",
            format_history_for_prompt(history),
            f"Latest user utterance: {transcript}",
            feedback_rule,
            "Respond only in spoken English.",
            "Use 1 to 3 concise sentences.",
            "Ask one natural follow-up question when appropriate.",
        ]
    )


async def iter_mock_reply_chunks(reply: str) -> AsyncIterator[str]:
    words = reply.split(" ")
    for index, word in enumerate(words):
        separator = "" if index == len(words) - 1 else " "
        await asyncio.sleep(0.018)
        yield f"{word}{separator}"


async def iter_ai_reply_chunks(
    scenario_id: str,
    transcript: str,
    history: list[ConversationMessage],
    mode: str,
) -> tuple[str, AsyncIterator[str]]:
    config = get_ai_provider_config()
    if not config:
        mock_result = (
            get_mock_immersive_result(scenario_id, transcript, history)
            if mode == "immersive"
            else get_mock_practice_result(scenario_id, transcript, history)
        )
        return "mock", iter_mock_reply_chunks(mock_result["aiReply"])

    try:
        from langchain_deepseek import ChatDeepSeek
    except ImportError:
        mock_result = (
            get_mock_immersive_result(scenario_id, transcript, history)
            if mode == "immersive"
            else get_mock_practice_result(scenario_id, transcript, history)
        )
        return "mock", iter_mock_reply_chunks(mock_result["aiReply"])

    model = ChatDeepSeek(
        model=config["model"],
        api_key=config["api_key"],
        temperature=0.45,
    )

    async def stream_model_chunks() -> AsyncIterator[str]:
        async for chunk in model.astream(build_stream_prompt(scenario_id, transcript, history, mode)):
            content = getattr(chunk, "content", "")
            if isinstance(content, str) and content:
                yield content

    return config["provider"], stream_model_chunks()


async def generate_sentence_chunks(text_stream: AsyncIterator[str]) -> AsyncIterator[str]:
    buffer = ""

    async for token in text_stream:
        buffer += token

        while True:
            match = PUNCTUATION_PATTERN.search(buffer)
            if not match:
                break

            sentence = buffer[: match.end()].strip()
            buffer = buffer[match.end() :]
            if sentence:
                yield sentence

    if buffer.strip():
        yield buffer.strip()


async def synthesize_sentence_for_browser(sentence: str, seq: int, queue: asyncio.Queue[dict[str, Any]]) -> None:
    # Browser SpeechSynthesis performs the actual playback. This tiny async task
    # models a future cloud TTS request so sentence synthesis can run in parallel.
    await asyncio.sleep(min(0.32, 0.035 + len(sentence) * 0.004))
    await queue.put({"seq": seq, "text": sentence})


async def send_ordered_sentence_events(
    websocket: WebSocket,
    sentence_stream: AsyncIterator[str],
    started_at: float,
    start_seq: int = 0,
) -> str:
    tts_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    pending: dict[int, dict[str, Any]] = {}
    tasks: set[asyncio.Task[None]] = set()
    next_seq = start_seq
    created_count = start_seq
    full_reply: list[str] = []

    async def flush_ready_events() -> None:
        nonlocal next_seq
        while next_seq in pending:
            item = pending.pop(next_seq)
            full_reply.append(item["text"])
            await websocket.send_json(
                {
                    "type": "sentence",
                    "seq": item["seq"],
                    "text": item["text"],
                    "audioText": item["text"],
                    "latencyMs": round((time.perf_counter() - started_at) * 1000),
                }
            )
            next_seq += 1

    async for sentence in sentence_stream:
        task = asyncio.create_task(synthesize_sentence_for_browser(sentence, created_count, tts_queue))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
        created_count += 1

        while not tts_queue.empty():
            item = tts_queue.get_nowait()
            pending[item["seq"]] = item
        await flush_ready_events()

    while next_seq < created_count:
        item = await tts_queue.get()
        pending[item["seq"]] = item
        await flush_ready_events()

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

    return " ".join(full_reply).strip()


def parse_stream_payload(payload: dict[str, Any]) -> tuple[str, str, str, list[ConversationMessage]]:
    scenario_id = str(payload.get("scenarioId") or "")
    if scenario_id not in SCENARIOS:
        raise ValueError("Unsupported scenario.")

    transcript = str(payload.get("transcript") or "").strip()
    if not transcript:
        raise ValueError("Transcript is required.")

    mode = str(payload.get("mode") or "immersive")
    if mode not in {"feedback", "immersive"}:
        mode = "immersive"

    history = []
    for item in payload.get("history") or []:
        try:
            history.append(ConversationMessage(role=item["role"], content=item["content"]))
        except (KeyError, TypeError, ValueError):
            continue

    return scenario_id, transcript, mode, history


async def build_stream_response_events(payload: dict[str, Any]) -> dict[str, Any]:
    started_at = time.perf_counter()
    scenario_id, transcript, mode, history = parse_stream_payload(payload)
    source, text_stream = await iter_ai_reply_chunks(scenario_id, transcript, history, mode)
    sentences = []
    reply_parts = []

    async for sentence in generate_sentence_chunks(text_stream):
        latency_ms = round((time.perf_counter() - started_at) * 1000)
        sentences.append(
            {
                "type": "sentence",
                "seq": len(sentences),
                "text": sentence,
                "audioText": sentence,
                "latencyMs": latency_ms,
            }
        )
        reply_parts.append(sentence)

    return {
        "type": "done",
        "source": source,
        "transcript": transcript,
        "sentences": sentences,
        "reply": " ".join(reply_parts).strip(),
        "latencyMs": round((time.perf_counter() - started_at) * 1000),
    }


@router.post("/practice/stream")
async def practice_stream_fallback(request: StreamPracticeRequest) -> StreamingResponse:
    async def stream_events() -> AsyncIterator[str]:
        started_at = time.perf_counter()
        scenario_id, transcript, mode, history = parse_stream_payload(request.model_dump())
        if request.preferFastLocal:
            mock_result = (
                get_mock_immersive_result(scenario_id, transcript, history)
                if mode == "immersive"
                else get_mock_practice_result(scenario_id, transcript, history)
            )
            source = "fast-local"
            text_stream = iter_mock_reply_chunks(mock_result["aiReply"])
        else:
            source, text_stream = await iter_ai_reply_chunks(scenario_id, transcript, history, mode)
        reply_parts = []
        seq = 0

        yield json.dumps(
            {
                "type": "accepted",
                "source": source,
                "transcript": transcript,
                "latencyMs": round((time.perf_counter() - started_at) * 1000),
            },
            ensure_ascii=False,
        ) + "\n"

        if not request.skipInstantAck:
            instant_ack = build_instant_ack(transcript)
            reply_parts.append(instant_ack)
            yield json.dumps(
                {
                    "type": "sentence",
                    "seq": seq,
                    "text": instant_ack,
                    "audioText": instant_ack,
                    "latencyMs": round((time.perf_counter() - started_at) * 1000),
                    "source": "local-instant",
                },
                ensure_ascii=False,
            ) + "\n"
            seq += 1

        async for sentence in generate_sentence_chunks(text_stream):
            reply_parts.append(sentence)
            yield json.dumps(
                {
                    "type": "sentence",
                    "seq": seq,
                    "text": sentence,
                    "audioText": sentence,
                    "latencyMs": round((time.perf_counter() - started_at) * 1000),
                },
                ensure_ascii=False,
            ) + "\n"
            seq += 1

        yield json.dumps(
            {
                "type": "done",
                "reply": " ".join(reply_parts).strip(),
                "source": source,
                "latencyMs": round((time.perf_counter() - started_at) * 1000),
            },
            ensure_ascii=False,
        ) + "\n"

    return StreamingResponse(stream_events(), media_type="application/x-ndjson")


@router.websocket("/practice/stream")
async def practice_stream(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        while True:
            started_at = time.perf_counter()
            payload = await websocket.receive_json()
            scenario_id, transcript, mode, history = parse_stream_payload(payload)
            source, text_stream = await iter_ai_reply_chunks(scenario_id, transcript, history, mode)

            await websocket.send_json(
                {
                    "type": "accepted",
                    "source": source,
                    "transcript": transcript,
                    "latencyMs": round((time.perf_counter() - started_at) * 1000),
                }
            )
            instant_ack = build_instant_ack(transcript)
            await websocket.send_json(
                {
                    "type": "sentence",
                    "seq": 0,
                    "text": instant_ack,
                    "audioText": instant_ack,
                    "latencyMs": round((time.perf_counter() - started_at) * 1000),
                    "source": "local-instant",
                }
            )
            reply = await send_ordered_sentence_events(
                websocket,
                generate_sentence_chunks(text_stream),
                started_at,
                start_seq=1,
            )
            reply = f"{instant_ack} {reply}".strip()
            await websocket.send_json(
                {
                    "type": "done",
                    "reply": reply,
                    "source": source,
                    "latencyMs": round((time.perf_counter() - started_at) * 1000),
                }
            )
    except WebSocketDisconnect:
        return
    except Exception as error:
        await websocket.send_json({"type": "error", "message": str(error)})
