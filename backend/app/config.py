import os
from pathlib import Path
from typing import Any


def load_env_file() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
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


def get_ai_provider_config() -> dict[str, str] | None:
    if os.getenv("DEEPSEEK_API_KEY"):
        return {
            "provider": "deepseek",
            "api_key": os.environ["DEEPSEEK_API_KEY"],
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        }

    return None


def get_ai_provider_status() -> dict[str, Any]:
    config = get_ai_provider_config()
    return {
        "configured": bool(config),
        "provider": config["provider"] if config else "mock",
        "model": config["model"] if config else None,
        "hasDeepseekKey": bool(os.getenv("DEEPSEEK_API_KEY")),
    }
