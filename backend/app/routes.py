from typing import Any

from fastapi import APIRouter, HTTPException

from app.ai_client import request_ai_coach_result
from app.config import get_ai_provider_status
from app.mock_feedback import get_mock_practice_result
from app.scenarios import SCENARIOS
from app.schemas import PracticeRequest


router = APIRouter(prefix="/api")


def validate_practice_request(request: PracticeRequest) -> str:
    if request.scenarioId not in SCENARIOS:
        raise HTTPException(status_code=400, detail="不支持的练习场景。")

    transcript = request.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="请输入一句英文后再提交。")

    return transcript


@router.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ai-speaking-coach-backend",
        "ai": get_ai_provider_status(),
    }


@router.post("/practice/mock")
def practice_mock(request: PracticeRequest) -> dict[str, Any]:
    transcript = validate_practice_request(request)
    return {
        "scenarioId": request.scenarioId,
        "transcript": transcript,
        **get_mock_practice_result(request.scenarioId, transcript, request.history),
        "source": "mock",
    }


@router.post("/practice/coach")
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
        error_message = str(error)
        warning = "真实 AI 请求失败，已使用 mock 结果兜底。"
        tips = ["真实 AI 请求失败，当前使用本地兜底结果。", "请检查 API Key、网络、模型配置或 LangChain 依赖。"]

        if "LangChain DeepSeek 依赖未安装" in error_message:
            warning = "LangChain DeepSeek 依赖未安装，已使用 mock 结果兜底。"
            tips = ["请先执行 npm run install:all 安装后端依赖。", "安装完成后重启后端服务再测试真实 AI。"]

        return {
            "scenarioId": request.scenarioId,
            "transcript": transcript,
            **get_mock_practice_result(request.scenarioId, transcript, request.history),
            "tips": tips,
            "source": "mock",
            "warning": warning,
        }

    return {
        "scenarioId": request.scenarioId,
        "transcript": transcript,
        **get_mock_practice_result(request.scenarioId, transcript, request.history),
        "tips": ["配置 DEEPSEEK_API_KEY 后可启用真实 AI 反馈。", "当前结果来自本地兜底规则。"],
        "source": "mock",
        "warning": "未配置 DEEPSEEK_API_KEY，已使用 mock 结果兜底。",
    }
