import asyncio
import json
import urllib.error
import urllib.request
from typing import Any

from app.config import get_ai_provider_config
from app.prompts import get_coach_prompt, get_summary_prompt
from app.schemas import ConversationMessage
from app.text_utils import clamp_score, normalize_sentence


SYSTEM_PROMPT = (
    "You are a strict but encouraging English speaking coach. "
    "You must always return valid JSON."
)


def build_empty_feedback(transcript: str) -> dict[str, Any]:
    return {
        "correction": {
            "original": transcript,
            "improved": transcript,
            "reason": "沉浸对话模式下不进行即时纠错，结束对话后再统一点评。",
        },
        "scores": {
            "fluency": 0,
            "pronunciation": 0,
            "grammar": 0,
            "naturalness": 0,
            "taskCompletion": 0,
        },
        "tips": ["沉浸对话模式下先保持对话流畅，结束后再生成全程总结。"],
    }


def normalize_coach_result(result: dict[str, Any], transcript: str, mode: str) -> dict[str, Any]:
    if mode == "immersive":
        return {
            "aiReply": str(result.get("aiReply") or "Could you tell me a little more?"),
            **build_empty_feedback(transcript),
        }

    correction = result.get("correction") if isinstance(result.get("correction"), dict) else {}
    scores = result.get("scores") if isinstance(result.get("scores"), dict) else {}
    tips = result.get("tips") if isinstance(result.get("tips"), list) else []

    return {
        "aiReply": str(result.get("aiReply") or "Could you say a little more about that?"),
        "correction": {
            "original": transcript,
            "improved": str(correction.get("improved") or normalize_sentence(transcript)),
            "reason": str(correction.get("reason") or "建议使用更完整、自然的英文表达。"),
        },
        "scores": {
            "fluency": clamp_score(scores.get("fluency")),
            "pronunciation": clamp_score(scores.get("pronunciation")),
            "grammar": clamp_score(scores.get("grammar")),
            "naturalness": clamp_score(scores.get("naturalness")),
            "taskCompletion": clamp_score(scores.get("taskCompletion")),
        },
        "tips": [str(tip) for tip in tips[:3]]
        if tips
        else ["尽量使用完整句回答。", "补充具体细节会让表达更自然。"],
    }


def normalize_summary_result(result: dict[str, Any]) -> dict[str, Any]:
    scores = result.get("scores") if isinstance(result.get("scores"), dict) else {}
    score_reasons = result.get("scoreReasons") if isinstance(result.get("scoreReasons"), dict) else {}

    def normalize_list(key: str, fallback: list[str]) -> list[str]:
        values = result.get(key)
        if not isinstance(values, list):
            return fallback
        normalized = [str(item) for item in values if str(item).strip()]
        return normalized[:3] or fallback

    return {
        "summary": str(result.get("summary") or "本次对话已完成，建议继续补充更具体的信息并保持英文表达连贯。"),
        "highlights": normalize_list("highlights", ["能够完成基本英文对话。", "能根据 AI 追问继续表达。"]),
        "weaknesses": normalize_list("weaknesses", ["部分回答可以更具体。", "注意使用完整句和更自然的连接词。"]),
        "nextSteps": normalize_list("nextSteps", ["用 3 句话复述本轮主题。", "准备 2 个可量化细节用于下一轮练习。"]),
        "scores": {
            "fluency": clamp_score(scores.get("fluency")),
            "pronunciation": clamp_score(scores.get("pronunciation")),
            "grammar": clamp_score(scores.get("grammar")),
            "naturalness": clamp_score(scores.get("naturalness")),
            "taskCompletion": clamp_score(scores.get("taskCompletion")),
        },
        "scoreReasons": {
            "fluency": str(score_reasons.get("fluency") or "根据回答长度、轮次衔接和表达连贯度估算。"),
            "pronunciation": str(score_reasons.get("pronunciation") or "根据 Qwen ASR 是否能稳定转写你的英文内容估算，不代表音素级发音评分。"),
            "grammar": str(score_reasons.get("grammar") or "根据对话转写文本中的时态、句子结构和常见语法问题估算。"),
            "naturalness": str(score_reasons.get("naturalness") or "根据表达是否像真实口语、是否自然承接上下文估算。"),
            "taskCompletion": str(score_reasons.get("taskCompletion") or "根据用户是否完成当前场景目标、是否回应追问和是否推进对话任务估算。"),
        },
        "scoreBasis": str(
            result.get("scoreBasis")
            or "本 MVP 使用对话转写、ASR 可识别程度和语言质量生成评分；暂不包含音素级发音评测。"
        ),
    }


def parse_json_content(content: str) -> dict[str, Any]:
    cleaned_content = content.strip()
    if cleaned_content.startswith("```"):
        cleaned_content = cleaned_content.strip("`")
        cleaned_content = cleaned_content.removeprefix("json").strip()

    return json.loads(cleaned_content)


async def invoke_deepseek_json(prompt: str, temperature: float) -> dict[str, Any] | None:
    config = get_ai_provider_config()
    if not config:
        return None

    payload = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    def send_request() -> dict[str, Any]:
        request = urllib.request.Request(
            config["base_url"].rstrip("/") + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {config['api_key']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"DeepSeek HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"DeepSeek 网络请求失败: {error.reason}") from error

    response_data = await asyncio.to_thread(send_request)
    choices = response_data.get("choices") if isinstance(response_data, dict) else None
    first_choice = choices[0] if choices else {}
    message = first_choice.get("message") if isinstance(first_choice, dict) else {}
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("DeepSeek 没有返回可解析内容。")

    parsed_content = parse_json_content(content)
    return {
        **parsed_content,
        "provider": config["provider"],
        "model": config["model"],
    }


async def request_ai_coach_result(
    scenario_id: str,
    transcript: str,
    history: list[ConversationMessage],
    mode: str,
) -> dict[str, Any] | None:
    result = await invoke_deepseek_json(get_coach_prompt(scenario_id, transcript, history, mode), 0.4)
    if not result:
        return None

    return {
        **normalize_coach_result(result, transcript, mode),
        "provider": result["provider"],
        "model": result["model"],
    }


async def request_ai_summary_result(
    scenario_id: str,
    history: list[ConversationMessage],
    mode: str,
) -> dict[str, Any] | None:
    result = await invoke_deepseek_json(get_summary_prompt(scenario_id, history, mode), 0.25)
    if not result:
        return None

    return {
        **normalize_summary_result(result),
        "provider": result["provider"],
        "model": result["model"],
    }
