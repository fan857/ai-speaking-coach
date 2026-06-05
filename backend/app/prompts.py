from app.scenarios import SCENARIOS
from app.schemas import ConversationMessage


def format_history_for_prompt(history: list[ConversationMessage]) -> str:
    if not history:
        return "No previous conversation. This is the first user turn."

    recent_history = history[-8:]
    lines = []
    for index, message in enumerate(recent_history, start=1):
        speaker = "User" if message.role == "user" else "AI"
        lines.append(f"{index}. {speaker}: {message.content}")
    return "\n".join(lines)


def get_feedback_prompt(scenario_id: str, transcript: str, history: list[ConversationMessage]) -> str:
    scenario = SCENARIOS[scenario_id]
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


def get_immersive_prompt(scenario_id: str, transcript: str, history: list[ConversationMessage]) -> str:
    scenario = SCENARIOS[scenario_id]
    return "\n".join(
        [
            "You are an immersive English speaking partner.",
            f"Practice scenario: {scenario['name']}",
            f"Your role: {scenario['aiRole']}",
            f"Practice goal: {scenario['goal']}",
            "Conversation history:",
            format_history_for_prompt(history),
            f"Latest user utterance: {transcript}",
            "Respond only in natural spoken English.",
            "Do not correct grammar during the conversation.",
            "Do not mention scores, feedback, or learning suggestions.",
            "Keep the reply concise, warm, and conversational.",
            "Ask one natural follow-up question so the user can keep speaking.",
            "Output JSON only with this shape:",
            '{"aiReply": "your English reply"}',
        ]
    )


def get_coach_prompt(
    scenario_id: str,
    transcript: str,
    history: list[ConversationMessage],
    mode: str = "feedback",
) -> str:
    if mode == "immersive":
        return get_immersive_prompt(scenario_id, transcript, history)

    return get_feedback_prompt(scenario_id, transcript, history)
