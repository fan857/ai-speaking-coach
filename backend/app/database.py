import json
import os
from datetime import datetime, timezone, timedelta

import pymysql

def get_conn():
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "qiniu_speaking"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )

def init_db():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS practice_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                scenario_id VARCHAR(50) NOT NULL,
                mode VARCHAR(20) NOT NULL,
                average_score FLOAT,
                scores JSON,
                accuracy_score FLOAT,
                summary TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS user_utterances (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
    finally:
        conn.close()

def save_session(data: dict) -> int:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO practice_sessions
                   (scenario_id, mode, average_score, scores, accuracy_score, summary)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    data.get("scenarioId", ""),
                    data.get("mode", ""),
                    data.get("averageScore"),
                    json.dumps(data.get("scores")) if data.get("scores") else None,
                    data.get("accuracyScore"),
                    data.get("summary"),
                ),
            )
            session_id = cur.lastrowid
            for utterance in data.get("utterances", []):
                cur.execute(
                    "INSERT INTO user_utterances (session_id, content) VALUES (%s, %s)",
                    (session_id, utterance),
                )
        conn.commit()
        return session_id
    finally:
        conn.close()

def get_recent_sessions(mode: str = "", limit: int = 10) -> list[dict]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if mode:
                cur.execute(
                    "SELECT * FROM practice_sessions WHERE mode=%s ORDER BY id DESC LIMIT %s",
                    (mode, limit),
                )
            else:
                cur.execute(
                    "SELECT * FROM practice_sessions ORDER BY id DESC LIMIT %s",
                    (limit,),
                )
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()

def get_recent_utterances(limit: int = 10) -> list[str]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT content FROM user_utterances ORDER BY id DESC LIMIT %s",
                (limit,),
            )
            return [r["content"] for r in cur.fetchall()]
    finally:
        conn.close()

def _row_to_dict(r: dict) -> dict:
    return {
        "id": r["id"],
        "scenarioId": r["scenario_id"],
        "mode": r["mode"],
        "averageScore": r["average_score"],
        "scores": json.loads(r["scores"]) if isinstance(r["scores"], str) else r["scores"],
        "accuracyScore": r["accuracy_score"],
        "summary": r["summary"],
        "timestamp": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
    }

# Initialize on import (best-effort)
try:
    init_db()
except Exception:
    pass
