from typing import Any

from app.schemas import ConversationMessage
from app.text_utils import build_scores, normalize_sentence


def get_history_turn_count(history: list[ConversationMessage]) -> int:
    return len([message for message in history if message.role == "user"])


def build_interview_result(transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    lower_text = transcript.lower()
    turn_count = get_history_turn_count(history)

    if "secret" in lower_text or "confidential" in lower_text:
        ai_reply = (
            "That's fine. Could you describe your personal role, the problem you solved, "
            "and the impact without sharing confidential details?"
        )
        scores = build_scores(70, 73, 72, 66)
    elif turn_count >= 1:
        ai_reply = "Good. Now please give one measurable result and explain what you personally contributed."
        scores = build_scores(84, 80, 78, 82)
    else:
        ai_reply = (
            "Good start. Could you add one concrete result, such as user growth, "
            "performance improvement, or what you personally delivered?"
        )
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

    improved = (
        transcript.replace("want order", "would like to order")
        if "want order" in lower_text
        else normalize_sentence(transcript)
    )

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
