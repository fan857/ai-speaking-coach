import cors from "cors";
import express from "express";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const scenarioHandlers = {
  interview: buildInterviewResult,
  restaurant: buildRestaurantResult,
  meeting: buildMeetingResult
};

function normalizeSentence(transcript) {
  const compact = transcript.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  const capitalized = compact.charAt(0).toUpperCase() + compact.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function buildScores({ fluency, pronunciation, grammar, naturalness }) {
  return { fluency, pronunciation, grammar, naturalness };
}

function buildInterviewResult(transcript) {
  const lowerText = transcript.toLowerCase();

  if (lowerText.includes("secret") || lowerText.includes("sorry")) {
    return {
      aiReply:
        "That's okay. In an interview, you can briefly explain what you can share and then describe your own contribution.",
      correction: {
        original: transcript,
        improved: normalizeSentence(transcript),
        reason: "面试中可以礼貌说明保密限制，但最好补充你能公开分享的职责和成果。"
      },
      scores: buildScores({
        fluency: 68,
        pronunciation: 72,
        grammar: 70,
        naturalness: 62
      })
    };
  }

  return {
    aiReply:
      "Good start. Could you add one concrete result, such as user growth, performance improvement, or what you personally delivered?",
    correction: {
      original: transcript,
      improved: normalizeSentence(transcript),
      reason: "面试回答建议加入可量化结果，让项目介绍更有说服力。"
    },
    scores: buildScores({
      fluency: 82,
      pronunciation: 78,
      grammar: 76,
      naturalness: 80
    })
  };
}

function buildRestaurantResult(transcript) {
  const lowerText = transcript.toLowerCase();
  const orderedCoffee = lowerText.includes("coffee");

  return {
    aiReply: orderedCoffee
      ? "Sure. Would you like your coffee hot or iced?"
      : "Great choice. Would you like anything to drink with that?",
    correction: {
      original: transcript,
      improved: lowerText.includes("want order")
        ? transcript.replace(/want order/i, "would like to order")
        : normalizeSentence(transcript),
      reason: "点餐场景中 would like to order 更礼貌，表达也更自然。"
    },
    scores: buildScores({
      fluency: 84,
      pronunciation: 80,
      grammar: lowerText.includes("want order") ? 74 : 82,
      naturalness: 83
    })
  };
}

function buildMeetingResult(transcript) {
  const lowerText = transcript.toLowerCase();

  if (lowerText.includes("secret")) {
    return {
      aiReply:
        "No problem. Could you share a non-confidential update, such as your progress, blockers, or next steps?",
      correction: {
        original: transcript,
        improved: normalizeSentence(transcript),
        reason: "会议中如果内容保密，可以说明无法透露细节，并补充可公开的进展或下一步计划。"
      },
      scores: buildScores({
        fluency: 70,
        pronunciation: 74,
        grammar: 72,
        naturalness: 64
      })
    };
  }

  return {
    aiReply:
      "Thanks for the update. What support do you need from the team before the next milestone?",
    correction: {
      original: transcript,
      improved: lowerText.includes("have finish")
        ? transcript.replace(/have finish/i, "finished")
        : normalizeSentence(transcript),
      reason: lowerText.includes("have finish")
        ? "have finish 不符合完成时结构；如果有 yesterday 这类明确过去时间，通常使用一般过去时。"
        : "会议汇报中建议表达清楚已完成内容、当前阻塞和下一步计划。"
    },
    scores: buildScores({
      fluency: 80,
      pronunciation: 76,
      grammar: lowerText.includes("have finish") ? 72 : 80,
      naturalness: 77
    })
  };
}

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

  const buildPracticeResult = scenarioHandlers[scenarioId];

  if (!buildPracticeResult) {
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
    ...buildPracticeResult(normalizedTranscript)
  });
});

app.listen(port, () => {
  console.log(`AI Speaking Coach backend is running on http://localhost:${port}`);
});
