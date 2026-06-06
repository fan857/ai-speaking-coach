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


def get_mock_immersive_result(scenario_id: str, transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    turn_count = get_history_turn_count(history)
    lower_text = transcript.lower()

    if scenario_id == "restaurant":
        if any(phrase in lower_text for phrase in ["no thanks", "no thank", "don't need", "do not need", "don't ask"]):
            ai_reply = "No problem. I have your order. Would you like to pay now?"
        elif "egg" in lower_text:
            ai_reply = "Sure. Would you like your eggs fried, scrambled, or boiled?"
        elif "hawk" in lower_text:
            ai_reply = "Sorry, did you mean another item on the menu?"
        elif any(word in lower_text for word in ["tea", "coffee", "drink", "juice"]):
            ai_reply = "Sure. Would you like that hot or iced?"
        elif turn_count >= 2:
            ai_reply = "Got it. Would you like to confirm the order now?"
        elif turn_count >= 1:
            ai_reply = "Great. Would you like to add a drink or a side?"
        else:
            ai_reply = "Sure. What would you like with that?"
    elif scenario_id == "meeting":
        ai_reply = (
            "Thanks for sharing that. What is the next step for your work?"
            if turn_count >= 1
            else "Thanks for the update. Is there anything blocking your progress?"
        )
    elif "secret" in lower_text or "confidential" in lower_text:
        ai_reply = "No problem. Could you share what you can discuss at a high level?"
    else:
        ai_reply = (
            "That sounds interesting. What was the most difficult part for you?"
            if turn_count >= 1
            else "Nice start. Could you tell me more about your role in that project?"
        )

    return {
        "aiReply": ai_reply,
        "correction": {
            "original": transcript,
            "improved": transcript,
            "reason": "沉浸对话模式下不进行即时纠错，结束对话后再统一点评。",
        },
        "scores": build_scores(0, 0, 0, 0),
        "tips": ["沉浸对话模式下先保持对话流畅，结束后再统一总结。"],
    }


def get_mock_practice_result(scenario_id: str, transcript: str, history: list[ConversationMessage]) -> dict[str, Any]:
    return SCENARIO_HANDLERS[scenario_id](transcript, history)


def get_mock_summary_result(scenario_id: str, history: list[ConversationMessage]) -> dict[str, Any]:
    user_turns = [message.content for message in history if message.role == "user"]
    turn_count = len(user_turns)
    latest_user_text = user_turns[-1] if user_turns else ""

    if scenario_id == "restaurant":
        summary = "本次点餐对话能完成基本需求表达，后续可以继续练习规格、数量和礼貌补充。"
        next_steps = ["练习用 would like 表达点餐需求。", "补充 size、temperature、quantity 等细节。"]
    elif scenario_id == "meeting":
        summary = "本次会议对话能给出工作进展，下一步需要把 blocker 和 next step 说得更清楚。"
        next_steps = ["用 progress, blocker, next step 三段式复述。", "准备一句清楚的团队协作请求。"]
    else:
        summary = "本次面试对话已经能围绕项目展开，建议继续补充个人贡献和可量化结果。"
        next_steps = ["准备 1 个可量化项目结果。", "用 STAR 结构组织 30 秒英文回答。"]

    base_score = 72 + min(turn_count, 4) * 4
    if latest_user_text and len(latest_user_text.split()) >= 8:
        base_score += 4

    return {
        "summary": summary,
        "highlights": ["能够跟随 AI 追问继续表达。", "对话主题保持一致，没有明显跑题。"],
        "weaknesses": ["回答还可以加入更多具体细节。", "部分句子建议使用更完整、更自然的英文结构。"],
        "nextSteps": next_steps,
        "scores": build_scores(base_score, base_score - 2, base_score - 4, base_score - 1),
        "scoreReasons": {
            "fluency": f"本轮共有 {turn_count} 次用户发言，能持续跟随话题，因此按对话连贯度给出估算分。",
            "pronunciation": "当前 mock 无音频特征，只能按 ASR 转写是否形成完整英文句子保守估算。",
            "grammar": "根据用户转写文本的句子完整度和常见语法问题估算。",
            "naturalness": "根据回答是否贴合场景、是否自然承接 AI 追问估算。",
        },
        "scoreBasis": "本 MVP 的课后评分基于对话转写、ASR 可识别程度和语言质量；暂不包含音素级发音评测。",
    }
