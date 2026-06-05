import json
import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(title="AI Speaking Coach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PracticeRequest(BaseModel):
    scenarioId: str
    transcript: str


SCENARIO_PROMPTS = {
    "interview": {
        "name": "求职面试",
        "aiRole": "AI 面试官",
        "goal": "帮助用户练习英文项目介绍、经历追问和职业表达。",
    },
    "restaurant": {
        "name": "餐厅点餐",
        "aiRole": "AI 服务员",
        "goal": "帮助用户练习英文点餐、礼貌请求和确认需求。",
    },
    "meeting": {
        "name": "团队会议",
        "aiRole": "AI 同事",
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


def build_interview_result(transcript: str) -> dict[str, Any]:
    lower_text = transcript.lower()

    if "secret" in lower_text or "sorry" in lower_text:
        return {
            "aiReply": "That's okay. In an interview, you can briefly explain what you can share and then describe your own contribution.",
            "correction": {
                "original": transcript,
                "improved": normalize_sentence(transcript),
                "reason": "面试中可以礼貌说明保密限制，但最好补充你能公开分享的职责和成果。",
            },
            "scores": build_scores(68, 72, 70, 62),
        }

    return {
        "aiReply": "Good start. Could you add one concrete result, such as user growth, performance improvement, or what you personally delivered?",
        "correction": {
            "original": transcript,
            "improved": normalize_sentence(transcript),
            "reason": "面试回答建议加入可量化结果，让项目介绍更有说服力。",
        },
        "scores": build_scores(82, 78, 76, 80),
    }


def build_restaurant_result(transcript: str) -> dict[str, Any]:
    lower_text = transcript.lower()
    ordered_coffee = "coffee" in lower_text

    return {
        "aiReply": "Sure. Would you like your coffee hot or iced?"
        if ordered_coffee
        else "Great choice. Would you like anything to drink with that?",
        "correction": {
            "original": transcript,
            "improved": transcript.replace("want order", "would like to order")
            if "want order" in lower_text
            else normalize_sentence(transcript),
            "reason": "点餐场景中 would like to order 更礼貌，表达也更自然。",
        },
        "scores": build_scores(84, 80, 74 if "want order" in lower_text else 82, 83),
    }


def build_meeting_result(transcript: str) -> dict[str, Any]:
    lower_text = transcript.lower()

    if "secret" in lower_text:
        return {
            "aiReply": "No problem. Could you share a non-confidential update, such as your progress, blockers, or next steps?",
            "correction": {
                "original": transcript,
                "improved": normalize_sentence(transcript),
                "reason": "会议中如果内容保密，可以说明无法透露细节，并补充可公开的进展或下一步计划。",
            },
            "scores": build_scores(70, 74, 72, 64),
        }

    return {
        "aiReply": "Thanks for the update. What support do you need from the team before the next milestone?",
        "correction": {
            "original": transcript,
            "improved": transcript.replace("have finish", "finished")
            if "have finish" in lower_text
            else normalize_sentence(transcript),
            "reason": "have finish 不符合完成时结构；如果有 yesterday 这类明确过去时间，通常使用一般过去时。"
            if "have finish" in lower_text
            else "会议汇报中建议表达清楚已完成内容、当前阻塞和下一步计划。",
        },
        "scores": build_scores(80, 76, 72 if "have finish" in lower_text else 80, 77),
    }


SCENARIO_HANDLERS = {
    "interview": build_interview_result,
    "restaurant": build_restaurant_result,
    "meeting": build_meeting_result,
}


def get_mock_practice_result(scenario_id: str, transcript: str) -> dict[str, Any]:
    return SCENARIO_HANDLERS[scenario_id](transcript)


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


def get_coach_prompt(scenario_id: str, transcript: str) -> str:
    scenario = SCENARIO_PROMPTS[scenario_id]
    return "\n".join(
        [
            "你是一名高质量 AI 英语口语陪练产品的核心引擎。",
            f"当前练习场景：{scenario['name']}",
            f"你的角色：{scenario['aiRole']}",
            f"练习目标：{scenario['goal']}",
            f"用户刚才说的英文：{transcript}",
            "请根据用户这句话生成自然的下一轮英文回复，并给出针对用户原句的中文纠错和评分。",
            "要求：",
            "1. aiReply 必须是英文，像真实对话一样自然追问或回应。",
            "2. correction.original 必须使用用户原句，不要编造另一句。",
            "3. correction.improved 必须给出更自然的英文表达。",
            "4. correction.reason 必须用中文解释关键问题，简洁具体。",
            "5. scores 四项为 0 到 100 的整数，pronunciation 如果没有音素级数据，请基于文本完整度和口语自然度保守估计。",
            "6. tips 给出 2 到 3 条中文学习建议。",
            "7. 只输出 JSON，不要输出 Markdown。",
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


async def request_ai_coach_result(scenario_id: str, transcript: str) -> dict[str, Any] | None:
    config = get_ai_provider_config()
    if not config:
        return None

    payload = {
        "model": config["model"],
        "temperature": 0.4,
        "messages": [
            {
                "role": "system",
                "content": "你是严谨、鼓励型的英语口语陪练。你必须输出结构化 JSON，并且所有纠错都针对用户原句。",
            },
            {"role": "user", "content": get_coach_prompt(scenario_id, transcript)},
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
        **get_mock_practice_result(request.scenarioId, transcript),
        "source": "mock",
    }


@app.post("/api/practice/coach")
async def practice_coach(request: PracticeRequest) -> dict[str, Any]:
    transcript = validate_practice_request(request)

    try:
        ai_result = await request_ai_coach_result(request.scenarioId, transcript)
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
            **get_mock_practice_result(request.scenarioId, transcript),
            "tips": ["真实 AI 请求失败，当前使用本地兜底结果。", "请检查 API Key、网络或模型配置。"],
            "source": "mock",
            "warning": "真实 AI 请求失败，已使用 mock 结果兜底。",
        }

    return {
        "scenarioId": request.scenarioId,
        "transcript": transcript,
        **get_mock_practice_result(request.scenarioId, transcript),
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
