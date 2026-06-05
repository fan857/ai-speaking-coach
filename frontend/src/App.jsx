import React, { useMemo, useState } from "react";

const scenarios = [
  {
    id: "interview",
    label: "面试",
    title: "求职面试",
    role: "AI 面试官",
    prompt: "请用英语介绍一个你最有成就感的项目。",
    placeholder: "示例：I built a small web app for practicing English...",
    mock: {
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
    }
  },
  {
    id: "restaurant",
    label: "点餐",
    title: "餐厅点餐",
    role: "AI 服务员",
    prompt: "欢迎光临！请用英语告诉我你今天想点什么。",
    placeholder: "示例：I would like a chicken sandwich and a cup of tea.",
    mock: {
      aiReply:
        "Great choice. Would you like anything else with your sandwich, such as soup or salad?",
      correction: {
        original: "I want order one coffee.",
        improved: "I would like to order a coffee.",
        reason:
          "点餐场景中 would like to order 更礼貌；a coffee 是更自然的数量表达。"
      },
      scores: {
        fluency: 86,
        pronunciation: 81,
        grammar: 79,
        naturalness: 84
      }
    }
  },
  {
    id: "meeting",
    label: "会议",
    title: "团队会议",
    role: "AI 同事",
    prompt: "请用英语汇报一下你本周的工作进展。",
    placeholder: "示例：This week I finished the login page and fixed two bugs.",
    mock: {
      aiReply:
        "Thanks for the update. What support do you need from the team before the next milestone?",
      correction: {
        original: "I have finish the task yesterday.",
        improved: "I finished the task yesterday.",
        reason:
          "yesterday 表示明确过去时间，应使用一般过去时 finished。"
      },
      scores: {
        fluency: 80,
        pronunciation: 76,
        grammar: 72,
        naturalness: 77
      }
    }
  }
];

const scoreLabels = {
  fluency: "流利度",
  pronunciation: "发音清晰度",
  grammar: "语法",
  naturalness: "表达自然度"
};

function ScoreBar({ label, value }) {
  return (
    <div className="score-row">
      <div className="score-meta">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="score-track" aria-label={`${label}评分 ${value}`}>
        <div className="score-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function App() {
  const [selectedScenarioId, setSelectedScenarioId] = useState("interview");
  const [userInput, setUserInput] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [hasResult, setHasResult] = useState(false);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId),
    [selectedScenarioId]
  );

  function handleScenarioChange(scenarioId) {
    setSelectedScenarioId(scenarioId);
    setSubmittedText("");
    setHasResult(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedInput = userInput.trim();

    if (!trimmedInput) {
      return;
    }

    setSubmittedText(trimmedInput);
    setHasResult(true);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">七牛云 x XEngineer MVP</p>
            <h1>AI 英语口语陪练</h1>
          </div>
          <div className="status-pill">Mock 模式</div>
        </header>

        <section className="scenario-panel" aria-labelledby="scenario-title">
          <div>
            <p className="section-label" id="scenario-title">
              练习场景
            </p>
            <h2>{selectedScenario.title}</h2>
            <p className="muted">
              与{selectedScenario.role}进行场景对话练习。当前 PR 仅使用 mock
              数据，不接入真实 AI API。
            </p>
          </div>
          <div className="scenario-tabs" role="tablist" aria-label="练习场景">
            {scenarios.map((scenario) => (
              <button
                className={scenario.id === selectedScenarioId ? "active" : ""}
                key={scenario.id}
                onClick={() => handleScenarioChange(scenario.id)}
                type="button"
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </section>

        <section className="conversation-grid">
          <div className="conversation-panel">
            <div className="panel-header">
              <p className="section-label">对话展示</p>
              <span>{selectedScenario.role}</span>
            </div>

            <div className="message ai-message">
              <span>AI</span>
              <p>{selectedScenario.prompt}</p>
            </div>

            {submittedText ? (
              <div className="message user-message">
                <span>You</span>
                <p>{submittedText}</p>
              </div>
            ) : (
              <div className="empty-state">在下方输入一句英文，模拟语音识别结果。</div>
            )}

            {hasResult && (
              <div className="message ai-message">
                <span>AI</span>
                <p>{selectedScenario.mock.aiReply}</p>
              </div>
            )}

            <form className="input-panel" onSubmit={handleSubmit}>
              <button className="record-button" type="button" aria-label="录音按钮占位">
                <span className="record-dot" />
                录音占位
              </button>
              <textarea
                onChange={(event) => setUserInput(event.target.value)}
                placeholder={selectedScenario.placeholder}
                rows={4}
                value={userInput}
              />
              <button className="submit-button" type="submit">
                提交模拟语音
              </button>
            </form>
          </div>

          <aside className="feedback-stack">
            <section className="feedback-card">
              <p className="section-label">AI 回复</p>
              <p>
                {hasResult
                  ? selectedScenario.mock.aiReply
                  : "提交一句模拟语音后，这里会展示 AI 回复。"}
              </p>
            </section>

            <section className="feedback-card">
              <p className="section-label">纠错反馈</p>
              {hasResult ? (
                <div className="correction">
                  <div>
                    <span>原句</span>
                    <p>{selectedScenario.mock.correction.original}</p>
                  </div>
                  <div>
                    <span>更自然表达</span>
                    <p>{selectedScenario.mock.correction.improved}</p>
                  </div>
                  <div>
                    <span>原因</span>
                    <p>{selectedScenario.mock.correction.reason}</p>
                  </div>
                </div>
              ) : (
                <p>语法和表达建议会展示在这里。</p>
              )}
            </section>

            <section className="feedback-card">
              <p className="section-label">评分面板</p>
              {hasResult ? (
                <div className="score-list">
                  {Object.entries(selectedScenario.mock.scores).map(([key, value]) => (
                    <ScoreBar key={key} label={scoreLabels[key]} value={value} />
                  ))}
                </div>
              ) : (
                <p>流利度、发音清晰度、语法、表达自然度评分会展示在这里。</p>
              )}
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

export default App;
