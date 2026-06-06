import asyncio
import json
import os
from urllib.parse import urlencode

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.scenarios import SCENARIOS


router = APIRouter(prefix="/api/realtime")


def build_realtime_instructions(scenario_id: str, mode: str) -> str:
    scenario = SCENARIOS[scenario_id]
    if mode == "immersive":
        feedback_rule = "Keep the conversation flowing. Do not correct grammar during the live conversation."
    elif mode == "feedback":
        feedback_rule = (
            "Reply briefly and naturally as the practice partner. Do not give grammar corrections, "
            "scores, or study advice; detailed feedback is generated only after the user clicks the feedback button."
        )
    else:
        feedback_rule = "Only transcribe the user's speech."

    return "\n".join(
        [
            "You are an AI English speaking coach.",
            f"Practice scenario: {scenario['name']}",
            f"Your role: {scenario['aiRole']}",
            f"Practice goal: {scenario['goal']}",
            "Speak natural, concise English.",
            "Use one short answer and one follow-up question.",
            feedback_rule,
            "Do not mention scores during live practice.",
        ]
    )


def should_create_realtime_response(mode: str) -> bool:
    return mode != "asr"


def get_turn_detection_config(mode: str, create_response: bool) -> dict[str, object]:
    if mode == "feedback":
        return {
            "type": "server_vad",
            "threshold": 0.45,
            "prefix_padding_ms": 500,
            "silence_duration_ms": 1200,
            "create_response": create_response,
            "interrupt_response": True,
        }

    return {
        "type": "server_vad",
        "threshold": 0.5,
        "prefix_padding_ms": 300,
        "silence_duration_ms": 650,
        "create_response": create_response,
        "interrupt_response": True,
    }


async def connect_dashscope_realtime(model: str, api_key: str):
    import websockets

    query = urlencode({"model": model})
    url = f"wss://dashscope.aliyuncs.com/api-ws/v1/realtime?{query}"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        return await websockets.connect(url, additional_headers=headers)
    except TypeError:
        return await websockets.connect(url, extra_headers=headers)


@router.get("/qwen/status")
def qwen_realtime_status() -> dict[str, object]:
    return {
        "configured": bool(os.getenv("DASHSCOPE_API_KEY")),
        "model": os.getenv("DASHSCOPE_REALTIME_MODEL", "qwen3.5-omni-plus-realtime"),
        "voice": os.getenv("DASHSCOPE_REALTIME_VOICE", "Tina"),
    }


@router.websocket("/qwen")
async def qwen_realtime_proxy(websocket: WebSocket) -> None:
    await websocket.accept()

    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        await websocket.send_json({"type": "error", "message": "DASHSCOPE_API_KEY is not configured."})
        await websocket.close()
        return

    scenario_id = websocket.query_params.get("scenarioId", "interview")
    if scenario_id not in SCENARIOS:
        scenario_id = "interview"
    mode = websocket.query_params.get("mode", "immersive")
    create_response = should_create_realtime_response(mode)
    model = os.getenv("DASHSCOPE_REALTIME_MODEL", "qwen3.5-omni-plus-realtime")
    voice = os.getenv("DASHSCOPE_REALTIME_VOICE", "Tina")

    try:
        dashscope = await connect_dashscope_realtime(model, api_key)
    except Exception as error:
        await websocket.send_json({"type": "error", "message": f"Failed to connect DashScope: {error}"})
        await websocket.close()
        return

    try:
        session_update = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"] if create_response else ["text"],
                "voice": voice,
                "instructions": build_realtime_instructions(scenario_id, mode),
                "input_audio_format": "pcm",
                "output_audio_format": "pcm",
                "input_audio_transcription": {
                    "model": "qwen3-asr-flash-realtime",
                },
                "turn_detection": get_turn_detection_config(mode, create_response),
            },
        }
        await dashscope.send(json.dumps(session_update, ensure_ascii=False))

        async def browser_to_dashscope() -> None:
            try:
                while True:
                    message = await websocket.receive_text()
                    await dashscope.send(message)
            except WebSocketDisconnect:
                await dashscope.close()
            except Exception:
                await dashscope.close()

        async def dashscope_to_browser() -> None:
            try:
                async for message in dashscope:
                    await websocket.send_text(message)
            except Exception as error:
                await websocket.send_json({"type": "error", "message": str(error)})

        tasks = [
            asyncio.create_task(browser_to_dashscope()),
            asyncio.create_task(dashscope_to_browser()),
        ]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*done, return_exceptions=True)
    finally:
        await dashscope.close()
