import json
from typing import Any

from app.config import get_ai_provider_config
from app.prompts import get_coach_prompt
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
        },
        "tips": [str(tip) for tip in tips[:3]]
        if tips
        else ["尽量使用完整句回答。", "补充具体细节会让表达更自然。"],
    }


def parse_json_content(content: str) -> dict[str, Any]:
    cleaned_content = content.strip()
    if cleaned_content.startswith("```"):
        cleaned_content = cleaned_content.strip("`")
        cleaned_content = cleaned_content.removeprefix("json").strip()

    return json.loads(cleaned_content)


async def request_ai_coach_result(
    scenario_id: str,
    transcript: str,
    history: list[ConversationMessage],
    mode: str,
) -> dict[str, Any] | None:
    config = get_ai_provider_config()
    if not config:
        return None

    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_deepseek import ChatDeepSeek
    except ImportError as error:
        raise RuntimeError("LangChain DeepSeek 依赖未安装，请执行 npm run install:all。") from error

    model = ChatDeepSeek(
        model=config["model"],
        api_key=config["api_key"],
        temperature=0.4,
    ).bind(response_format={"type": "json_object"})
    response = await model.ainvoke(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=get_coach_prompt(scenario_id, transcript, history, mode)),
        ]
    )

    content = response.content
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("DeepSeek 没有返回可解析内容。")

    parsed_content = parse_json_content(content)
    return {
        **normalize_coach_result(parsed_content, transcript, mode),
        "provider": config["provider"],
        "model": config["model"],
    }
