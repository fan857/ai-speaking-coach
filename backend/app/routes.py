from typing import Any

from fastapi import APIRouter, HTTPException

from app.ai_client import request_ai_coach_result, request_ai_summary_result, request_ai_translation_result
from app.config import get_ai_provider_status
from app.mock_feedback import get_mock_immersive_result, get_mock_practice_result, get_mock_summary_result
from app.scenarios import SCENARIOS
from app.schemas import PracticeRequest, SummaryRequest, TranslationRequest


router = APIRouter(prefix="/api")


def validate_practice_request(request: PracticeRequest) -> str:
    if request.scenarioId not in SCENARIOS:
        raise HTTPException(status_code=400, detail="不支持的练习场景。")

    transcript = request.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="请输入或识别一句英文后再提交。")

    return transcript


def validate_summary_request(request: SummaryRequest) -> None:
    if request.scenarioId not in SCENARIOS:
        raise HTTPException(status_code=400, detail="不支持的练习场景。")

    if not request.history:
        raise HTTPException(status_code=400, detail="对话内容为空，无法生成课后总结。")


def get_mock_result(request: PracticeRequest, transcript: str) -> dict[str, Any]:
    if request.mode == "immersive":
        return get_mock_immersive_result(request.scenarioId, transcript, request.history)

    return get_mock_practice_result(request.scenarioId, transcript, request.history)


def validate_translation_request(request: TranslationRequest) -> str:
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="翻译内容不能为空。")
    return text[:1200]


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
        warning = f"真实 AI 请求失败：{error_message[:180]}，已使用 mock 结果兜底。"
        tips = [
            "真实 AI 请求失败，当前使用本地兜底结果。",
            "请检查 DEEPSEEK_API_KEY、DEEPSEEK_MODEL、网络或 DeepSeek 账号额度。",
        ]

        if "401" in error_message or "Unauthorized" in error_message:
            warning = "DeepSeek API Key 无效或未授权，已使用 mock 结果兜底。"
            tips = [
                "请检查 backend/.env 中的 DEEPSEEK_API_KEY。",
                "修改 .env 后需要重启后端服务。",
            ]

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


@router.post("/practice/translate")
async def practice_translate(request: TranslationRequest) -> dict[str, Any]:
    text = validate_translation_request(request)

    try:
        ai_result = await request_ai_translation_result(text)
        if ai_result and ai_result.get("translation"):
            return {
                "text": text,
                "translation": ai_result["translation"],
                "source": ai_result["provider"],
            }
    except Exception as error:
        print(error)

    return {
        "text": text,
        "translation": "翻译服务暂不可用，请检查 DeepSeek API Key 或网络后重试。",
        "source": "fallback",
        "warning": "真实 AI 翻译请求失败，已返回兜底提示。",
    }


@router.post("/practice/summary")
async def practice_summary(request: SummaryRequest) -> dict[str, Any]:
    validate_summary_request(request)

    try:
        ai_result = await request_ai_summary_result(
            request.scenarioId,
            request.history,
            request.mode,
        )
        if ai_result:
            return {
                "scenarioId": request.scenarioId,
                "mode": request.mode,
                **ai_result,
                "source": ai_result["provider"],
            }
    except Exception as error:
        print(error)
        mock_result = get_mock_summary_result(request.scenarioId, request.history)
        return {
            "scenarioId": request.scenarioId,
            "mode": request.mode,
            **mock_result,
            "source": "mock",
            "warning": "真实 AI 总结请求失败，已使用 mock 总结兜底。",
        }

    return {
        "scenarioId": request.scenarioId,
        "mode": request.mode,
        **get_mock_summary_result(request.scenarioId, request.history),
        "source": "mock",
        "warning": "未配置 DEEPSEEK_API_KEY，已使用 mock 总结兜底。",
    }
