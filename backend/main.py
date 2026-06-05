import json
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(title="AI Speaking Coach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PracticeRequest(BaseModel):
    scenarioId: str
    transcript: str
    history: list[ConversationMessage] = Field(default_factory=list)


SCENARIO_PROMPTS = {
    "interview": {
        "name": "求职面试",
        "aiRole": "AI 面试官",
        "opening": "请用英语介绍一个你最有成就感的项目。",
        "goal": "帮助用户练习英文项目介绍、经历追问和职业表达。",
    },
    "restaurant": {
        "name": "餐厅点餐",
        "aiRole": "AI 服务员",
        "opening": "欢迎光临！请用英语告诉我你今天想点什么。",
        "goal": "帮助用户练习英文点餐、礼貌请求和确认需求。",
    },
    "meeting": {
        "name": "团队会议",
        "aiRole": "AI 同事",
        "opening": "请用英语汇报一下你本周的工作进展。",
        "goal": "帮助用户练习英文工作汇报、协作沟通和下一步计划表达。",
    },
}


def load_env_file() -> None:
    backend_dir = Path(__file__).resolve().parent
    env_paths = [
        backend_dir / ".env",
        Path.cwd() / ".env",
        Path.cwd().parent / ".env",
    ]

    for env_path in env_paths:
        if not env_path.exists():
            continue

        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue

            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env_file()


def normalize_sentence(transcript: str) -> str:
    compact = " ".join(transcript.replace(",", ", ").split())
    if not compact:
        return ""

    capitalized = compact[0].upper() + compact[1:]
    return capitalized if capitalized[-1] in ".!?" else f"{capitalized}."


def build_scores(
    fluency: int,
    pronunciation: int,
    grammar: int,
    naturalness: int,
) -> dict[str, int]:
    return {
        "fluency": fluency,
        "pronunciation": pronunciation,
        "grammar": grammar,
        "naturalness": naturalness,
    }


def get_history_turn_count(history: list[ConversationMessage]) -> int:
    return len([message for message in history if message.role == "user"])


def build_interview_result(transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    lower_text = transcript.lower()
    turn_count = get_history_turn_count(history)

    if "secret" in lower_text or "confidential" in lower_text:
        ai_reply = (
            "That's fine. Could you describe your personal role, the problem you solved, and the impact without sharing confidential details?"
        )
        scores = build_scores(70, 73, 72, 66)
    elif turn_count >= 1:
        ai_reply = "Good. Now please give one measurable result and explain what you personally contributed."
        scores = build_scores(84, 80, 78, 82)
    else:
        ai_reply = "Good start. Could you add one concrete result, such as user growth, performance improvement, or what you personally delivered?"
        scores = build_scores(82, 78, 76, 80)

    return {
        "aiReply": ai_reply,
        "correction": {
            "original": transcript,
            "improved": normalize_sentence(transcript),
            "reason": "面试回答建议补充具体职责、量化结果和个人贡献，让表达更有说服力。",
        },
        "scores": scores,
        "tips": ["回答时尽量使用完整句。", "补充数字、结果或个人贡献会更像真实面试。"],
    }


def build_restaurant_result(transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    lower_text = transcript.lower()
    ordered_coffee = "coffee" in lower_text
    turn_count = get_history_turn_count(history)

    if ordered_coffee and turn_count >= 1:
        ai_reply = "Great. Would you like anything else, or should I prepare your order now?"
    elif ordered_coffee:
        ai_reply = "Sure. Would you like your coffee hot or iced?"
    else:
        ai_reply = "Great choice. Would you like anything to drink with that?"

    improved = transcript.replace("want order", "would like to order") if "want order" in lower_text else normalize_sentence(transcript)
    return {
        "aiReply": ai_reply,
        "correction": {
            "original": transcript,
            "improved": improved,
            "reason": "点餐场景中使用 would like 更礼貌，表达也更自然。",
        },
        "scores": build_scores(84, 80, 74 if "want order" in lower_text else 82, 83),
        "tips": ["点餐时可以多使用 please 和 would like。", "回答服务员追问时尽量补充冷热、大小或数量。"],
    }


def build_meeting_result(transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    lower_text = transcript.lower()
    turn_count = get_history_turn_count(history)

    if "secret" in lower_text or "confidential" in lower_text:
        ai_reply = "No problem. Could you share a non-confidential update, such as progress, blockers, or next steps?"
        scores = build_scores(70, 74, 72, 64)
    elif turn_count >= 1:
        ai_reply = "Thanks. What is your biggest blocker, and what help do you need from the team?"
        scores = build_scores(82, 78, 78, 80)
    else:
        ai_reply = "Thanks for the update. What support do you need from the team before the next milestone?"
        scores = build_scores(80, 76, 72 if "have finish" in lower_text else 80, 77)

    improved = transcript.replace("have finish", "finished") if "have finish" in lower_text else normalize_sentence(transcript)
    reason = (
        "have finish 不符合完成时结构；如果有 yesterday 这类明确过去时间，通常使用一般过去时。"
        if "have finish" in lower_text
        else "会议汇报建议表达清楚已完成内容、当前阻塞和下一步计划。"
    )
    return {
        "aiReply": ai_reply,
        "correction": {
            "original": transcript,
            "improved": improved,
            "reason": reason,
        },
        "scores": scores,
        "tips": ["会议表达可以按 progress、blocker、next step 的顺序组织。", "尽量用一句话说明你需要团队提供什么支持。"],
    }


SCENARIO_HANDLERS = {
    "interview": build_interview_result,
    "restaurant": build_restaurant_result,
    "meeting": build_meeting_result,
}


def get_mock_practice_result(scenario_id: str, transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    return SCENARIO_HANDLERS[scenario_id](transcript, history)


def get_ai_provider_config() -> dict[str, str] | None:
    if os.getenv("DEEPSEEK_API_KEY"):
        return {
            "provider": "deepseek",
            "api_key": os.environ["DEEPSEEK_API_KEY"],
            "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        }

    if os.getenv("AI_PROVIDER") == "openai" and os.getenv("OPENAI_API_KEY"):
        return {
            "provider": "openai",
            "api_key": os.environ["OPENAI_API_KEY"],
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        }

    return None


def get_ai_provider_status() -> dict[str, Any]:
    config = get_ai_provider_config()
    return {
        "configured": bool(config),
        "provider": config["provider"] if config else "mock",
        "model": config["model"] if config else None,
        "hasDeepseekKey": bool(os.getenv("DEEPSEEK_API_KEY")),
        "hasOpenaiKey": bool(os.getenv("OPENAI_API_KEY")),
        "openaiFallbackEnabled": os.getenv("AI_PROVIDER") == "openai",
    }


def format_history_for_prompt(history: list[ConversationMessage]) -> str:
    if not history:
        return "暂无历史对话。这是本轮第一句。"

    recent_history = history[-8:]
    lines = []
    for index, message in enumerate(recent_history, start=1):
        speaker = "用户" if message.role == "user" else "AI"
        lines.append(f"{index}. {speaker}: {message.content}")
    return "\n".join(lines)


def get_coach_prompt(scenario_id: str, transcript: str, history: list[ConversationMessage]) -> str:
    scenario = SCENARIO_PROMPTS[scenario_id]
    return "\n".join(
        [
            "你是一名高质量 AI 英语口语陪练产品的核心引擎。",
            f"当前练习场景：{scenario['name']}",
            f"你的角色：{scenario['aiRole']}",
            f"练习目标：{scenario['goal']}",
            "历史对话：",
            format_history_for_prompt(history),
            f"用户刚才说的英文：{transcript}",
            "请参考历史上下文，生成自然的下一轮英文回复，并给出针对用户本句的中文纠错和评分。",
            "要求：",
            "1. aiReply 必须是英文，要像真实对话一样自然追问或回应。",
            "2. aiReply 必须延续历史对话，不要重复已经问过的问题。",
            "3. correction.original 必须使用用户本句原文，不要编造另一句。",
            "4. correction.improved 必须给出更自然的英文表达。",
            "5. correction.reason 必须用中文解释关键问题，简洁具体。",
            "6. scores 四项为 0 到 100 的整数，pronunciation 如果没有音素级数据，请基于文本完整度和口语自然度保守估计。",
            "7. tips 给出 2 到 3 条中文学习建议。",
            "8. 只输出 JSON，不要输出 Markdown。",
        ]
    )


def clamp_score(value: Any) -> int:
    try:
        number_value = round(float(value))
    except (TypeError, ValueError):
        return 70

    return max(0, min(100, number_value))


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


async def request_ai_coach_result(
    scenario_id: str,
    transcript: str,
    history: list[ConversationMessage],
) -> dict[str, Any] | None:
    config = get_ai_provider_config()
    if not config:
        return None

    payload = {
        "model": config["model"],
        "temperature": 0.4,
        "messages": [
            {
                "role": "system",
                "content": "你是严谨、鼓励型的英语口语陪练。你必须输出结构化 JSON，并且所有纠错都针对用户最新一句英文。",
            },
            {"role": "user", "content": get_coach_prompt(scenario_id, transcript, history)},
        ],
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{config['base_url']}/chat/completions",
            headers={
                "Authorization": f"Bearer {config['api_key']}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        raise RuntimeError(f"{config['provider']} API 请求失败：{response.status_code} {response.text}")

    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        raise RuntimeError(f"{config['provider']} API 没有返回可解析内容。")

    parsed_content = json.loads(content)
    return {
        **normalize_coach_result(parsed_content, transcript),
        "provider": config["provider"],
        "model": config["model"],
    }


def validate_practice_request(request: PracticeRequest) -> str:
    if request.scenarioId not in SCENARIO_HANDLERS:
        raise HTTPException(status_code=400, detail="不支持的练习场景。")

    transcript = request.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="请输入一句英文后再提交。")

    return transcript


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ai-speaking-coach-backend",
        "ai": get_ai_provider_status(),
    }


@app.post("/api/practice/mock")
def practice_mock(request: PracticeRequest) -> dict[str, Any]:
    transcript = validate_practice_request(request)
    return {
        "scenarioId": request.scenarioId,
        "transcript": transcript,
        **get_mock_practice_result(request.scenarioId, transcript, request.history),
        "source": "mock",
    }


@app.post("/api/practice/coach")
async def practice_coach(request: PracticeRequest) -> dict[str, Any]:
    transcript = validate_practice_request(request)

    try:
        ai_result = await request_ai_coach_result(request.scenarioId, transcript, request.history)
        if ai_result:
            return {
                "scenarioId": request.scenarioId,
                "transcript": transcript,
                **ai_result,
                "source": ai_result["provider"],
            }
    except Exception as error:
        print(error)
        return {
            "scenarioId": request.scenarioId,
            "transcript": transcript,
            **get_mock_practice_result(request.scenarioId, transcript, request.history),
            "tips": ["真实 AI 请求失败，当前使用本地兜底结果。", "请检查 API Key、网络或模型配置。"],
            "source": "mock",
            "warning": "真实 AI 请求失败，已使用 mock 结果兜底。",
        }

    return {
        "scenarioId": request.scenarioId,
        "transcript": transcript,
        **get_mock_practice_result(request.scenarioId, transcript, request.history),
        "tips": ["配置 DEEPSEEK_API_KEY 后可启用真实 AI 反馈。", "当前结果来自本地兜底规则。"],
        "source": "mock",
        "warning": "未配置 DEEPSEEK_API_KEY，已使用 mock 结果兜底。",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3001"))
    print(f"AI Speaking Coach backend is running on http://localhost:{port}")
    print("AI provider status:", get_ai_provider_status())
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
