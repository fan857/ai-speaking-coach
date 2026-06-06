from typing import Any


def normalize_sentence(transcript: str) -> str:
    compact = " ".join(transcript.replace(",", ", ").split())
    if not compact:
        return ""

    capitalized = compact[0].upper() + compact[1:]
    return capitalized if capitalized[-1] in ".!?" else f"{capitalized}."


def clamp_score(value: Any) -> int:
    try:
        number_value = round(float(value))
    except (TypeError, ValueError):
        return 70

    return max(0, min(100, number_value))


def build_scores(
    fluency: int,
    pronunciation: int,
    grammar: int,
    naturalness: int,
    task_completion: int | None = None,
) -> dict[str, int]:
    if task_completion is None:
        task_completion = round((fluency + pronunciation + grammar + naturalness) / 4)

    return {
        "fluency": fluency,
        "pronunciation": pronunciation,
        "grammar": grammar,
        "naturalness": naturalness,
        "taskCompletion": task_completion,
    }
