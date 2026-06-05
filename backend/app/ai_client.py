import json
from typing import Any

from app.config import get_ai_provider_config
from app.prompts import get_coach_prompt
from app.schemas import ConversationMessage
from app.text_utils import clamp_score, normalize_sentence


SYSTEM_PROMPT = (
    "你是严谨、鼓励型的英语口语陪练。"
    "你必须输出结构化 JSON，并且所有纠错都针对用户最新一句英文。"
)


def normalize_coach_result(result: dict[str, Any], transcript: str) -> dict[str, Any]:
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
) -> dict[str, Any] | None:
    config = get_ai_provider_config()
    if not config:
        return None

    # 延迟导入，避免未安装 LangChain 时后端启动失败；接口会自动走 mock 兜底。
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
            HumanMessage(content=get_coach_prompt(scenario_id, transcript, history)),
        ]
    )

    content = response.content
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("DeepSeek 没有返回可解析内容。")

    parsed_content = parse_json_content(content)
    return {
        **normalize_coach_result(parsed_content, transcript),
        "provider": config["provider"],
        "model": config["model"],
    }
