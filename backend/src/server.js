import cors from "cors";
import express from "express";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const mockPracticeResults = {
  interview: {
    aiReply:
      "That sounds interesting. What was the biggest challenge you faced, and how did you solve it?",
    correction: {
      original: "I am very interest in frontend develop.",
      improved: "I am very interested in frontend development.",
      reason:
        "am 后面应使用形容词 interested；表达前端开发领域时，development 更自然。"
    },
    scores: {
      fluency: 82,
      pronunciation: 78,
      grammar: 74,
      naturalness: 80
    }
  },
  restaurant: {
    aiReply:
      "Great choice. Would you like anything else with your sandwich, such as soup or salad?",
    correction: {
      original: "I want order one coffee.",
      improved: "I would like to order a coffee.",
      reason: "点餐场景中 would like to order 更礼貌；a coffee 是更自然的数量表达。"
    },
    scores: {
      fluency: 86,
      pronunciation: 81,
      grammar: 79,
      naturalness: 84
    }
  },
  meeting: {
    aiReply:
      "Thanks for the update. What support do you need from the team before the next milestone?",
    correction: {
      original: "I have finish the task yesterday.",
      improved: "I finished the task yesterday.",
      reason: "yesterday 表示明确过去时间，应使用一般过去时 finished。"
    },
    scores: {
      fluency: 80,
      pronunciation: 76,
      grammar: 72,
      naturalness: 77
    }
  }
};

app.get("/api/health", (request, response) => {
  response.json({
    status: "ok",
    service: "ai-speaking-coach-backend",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/practice/mock", (request, response) => {
  const { scenarioId, transcript } = request.body;
  const normalizedTranscript = typeof transcript === "string" ? transcript.trim() : "";

  if (!mockPracticeResults[scenarioId]) {
    return response.status(400).json({
      message: "不支持的练习场景。"
    });
  }

  if (!normalizedTranscript) {
    return response.status(400).json({
      message: "请输入一句英文后再提交。"
    });
  }

  response.json({
    scenarioId,
    transcript: normalizedTranscript,
    ...mockPracticeResults[scenarioId]
  });
});

app.listen(port, () => {
  console.log(`AI Speaking Coach backend is running on http://localhost:${port}`);
});
