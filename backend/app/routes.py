from typing import Any

from fastapi import APIRouter, HTTPException

from app.ai_client import request_ai_coach_result
from app.config import get_ai_provider_status
from app.mock_feedback import get_mock_immersive_result, get_mock_practice_result
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


def get_mock_result(request: PracticeRequest, transcript: str) -> dict[str, Any]:
    if request.mode == "immersive":
        return get_mock_immersive_result(request.scenarioId, transcript, request.history)

    return get_mock_practice_result(request.scenarioId, transcript, request.history)


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
        "mode": request.mode,
        **get_mock_result(request, transcript),
        "source": "mock",
    }


@router.post("/practice/coach")
async def practice_coach(request: PracticeRequest) -> dict[str, Any]:
    transcript = validate_practice_request(request)

    try:
        ai_result = await request_ai_coach_result(
            request.scenarioId,
            transcript,
            request.history,
            request.mode,
        )
        if ai_result:
            return {
                "scenarioId": request.scenarioId,
                "transcript": transcript,
                "mode": request.mode,
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

        mock_result = get_mock_result(request, transcript)
        if request.mode == "immersive":
            tips = mock_result["tips"]

        return {
            "scenarioId": request.scenarioId,
            "transcript": transcript,
            "mode": request.mode,
            **mock_result,
            "tips": tips,
            "source": "mock",
            "warning": warning,
        }

    return {
        "scenarioId": request.scenarioId,
        "transcript": transcript,
        "mode": request.mode,
        **get_mock_result(request, transcript),
        "source": "mock",
        "warning": "未配置 DEEPSEEK_API_KEY，已使用 mock 结果兜底。",
    }
