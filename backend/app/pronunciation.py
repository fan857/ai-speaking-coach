import re
from typing import Any

from app.ai_client import request_ai_pronunciation_result
from app.scenarios import SCENARIOS

# Default reference sentences per scenario when no specific sentence is provided
DEFAULT_REFERENCE_SENTENCES = {
    "interview": [
        "I led a team of five engineers to deliver the project on time.",
        "My greatest strength is my ability to solve complex problems quickly.",
        "I have three years of experience in full-stack development.",
        "I am passionate about building products that people love to use.",
        "In my previous role, I improved system performance by forty percent.",
    ],
    "restaurant": [
        "I would like to order a grilled chicken sandwich, please.",
        "Could I have the check, please?",
        "I would like my steak medium rare, thank you.",
        "Do you have any vegetarian options?",
        "I would like a glass of water, please.",
    ],
    "meeting": [
        "This week I completed the API integration and started testing.",
        "I think we should prioritize the user feedback from last sprint.",
        "My main blocker is waiting for the design team to finalize the mockups.",
        "I would like to propose a new approach for the data pipeline.",
        "The next step is to deploy the beta version to staging.",
    ],
}


def get_reference_sentences(scenario_id: str) -> list[str]:
    """Return the default reference sentences for a scenario."""
    return DEFAULT_REFERENCE_SENTENCES.get(scenario_id, DEFAULT_REFERENCE_SENTENCES["interview"])


def align_words(reference: str, transcript: str) -> list[dict[str, Any]]:
    """Align words between reference text and user transcript.
    
    Returns a list of per-word comparison results with match status.
    """
    ref_words = reference.strip().lower().split()
    user_words = transcript.strip().lower().split()
    aligned = []

    ref_idx = 0
    user_idx = 0
    max_len = max(len(ref_words), len(user_words))

    while ref_idx < len(ref_words) or user_idx < len(user_words):
        if ref_idx < len(ref_words) and user_idx < len(user_words):
            ref_word = ref_words[ref_idx]
            user_word = user_words[user_idx]

            if ref_word == user_word:
                aligned.append({
                    "reference": ref_words[ref_idx],
                    "user": user_words[user_idx],
                    "status": "match",
                })
                ref_idx += 1
                user_idx += 1
            elif ref_idx + 1 < len(ref_words) and ref_words[ref_idx + 1] == user_word:
                # User skipped a reference word
                aligned.append({
                    "reference": ref_words[ref_idx],
                    "user": "(missing)",
                    "status": "missing",
                })
                ref_idx += 1
            elif user_idx + 1 < len(user_words) and user_words[user_idx + 1] == ref_word:
                # User inserted an extra word
                aligned.append({
                    "reference": "(extra)",
                    "user": user_words[user_idx],
                    "status": "extra",
                })
                user_idx += 1
            else:
                # Words are different
                similarity = _word_similarity(ref_word, user_word)
                status = "close" if similarity >= 0.6 else "mismatch"
                aligned.append({
                    "reference": ref_words[ref_idx],
                    "user": user_words[user_idx],
                    "status": status,
                })
                ref_idx += 1
                user_idx += 1
        elif ref_idx < len(ref_words):
            aligned.append({
                "reference": ref_words[ref_idx],
                "user": "(missing)",
                "status": "missing",
            })
            ref_idx += 1
        else:
            aligned.append({
                "reference": "(extra)",
                "user": user_words[user_idx],
                "status": "extra",
            })
            user_idx += 1

    return aligned


def _word_similarity(a: str, b: str) -> float:
    """Compute approximate similarity between two lowercase words."""
    a = a.lower().strip()
    b = b.lower().strip()
    if a == b:
        return 1.0
    # Check edit distance for short words
    len_diff = abs(len(a) - len(b))
    if len_diff > 3:
        return 0.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    matches = sum(1 for ca, cb in zip(a, b) if ca == cb)
    return matches / max_len


def compute_accuracy_score(aligned: list[dict[str, Any]]) -> int:
    """Compute an overall accuracy score from aligned words."""
    total = len(aligned)
    if total == 0:
        return 100
    matched = sum(1 for w in aligned if w["status"] == "match" or w["status"] == "close")
    return round(matched / total * 100)


def get_difficult_words(aligned: list[dict[str, Any]]) -> list[str]:
    """Return words that were mismatched or missing for practice focus."""
    return [w["reference"] for w in aligned if w["status"] in ("mismatch", "missing")]


async def assess_imitation(
    scenario_id: str,
    reference_text: str,
    transcript: str,
) -> dict[str, Any]:
    """Core pronunciation assessment: align words + optionally call AI for qualitative feedback."""
    scenario_name = SCENARIOS.get(scenario_id, {}).get("name", scenario_id)
    aligned = align_words(reference_text, transcript)
    accuracy = compute_accuracy_score(aligned)
    difficult = get_difficult_words(aligned)

    # Try AI for qualitative feedback
    ai_feedback = await request_ai_pronunciation_result(
        scenario_name,
        reference_text,
        transcript,
        accuracy,
        difficult,
    )

    return {
        "reference": reference_text,
        "transcript": transcript,
        "accuracyScore": accuracy,
        "aligned": aligned,
        "difficultWords": difficult[:6],
        "tips": ai_feedback.get("tips", []),
        "phonemeNotes": ai_feedback.get("phonemeNotes", []),
        "encouragement": ai_feedback.get("encouragement", ""),
    }
