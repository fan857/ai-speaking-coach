import os

import uvicorn

from app.config import get_ai_provider_status, load_env_file
from app.factory import create_app


load_env_file()
app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "3001"))
    print(f"AI Speaking Coach backend is running on http://localhost:{port}")
    print("AI provider status:", get_ai_provider_status())
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
