import React, { useEffect, useMemo, useRef, useState } from "react";

const scenarios = [
  {
    id: "interview",
    label: "面试",
    title: "求职面试",
    role: "AI 面试官",
    prompt: "请用英语介绍一个你最有成就感的项目。",
    placeholder: "示例：I built a small web app for practicing English..."
  },
  {
    id: "restaurant",
    label: "点餐",
    title: "餐厅点餐",
    role: "AI 服务员",
    prompt: "欢迎光临！请用英语告诉我你今天想点什么。",
    placeholder: "示例：I would like a chicken sandwich and a cup of tea."
  },
  {
    id: "meeting",
    label: "会议",
    title: "团队会议",
    role: "AI 同事",
    prompt: "请用英语汇报一下你本周的工作进展。",
    placeholder: "示例：This week I finished the login page and fixed two bugs."
  }
];

const scoreLabels = {
  fluency: "流利度",
  pronunciation: "发音清晰度",
  grammar: "语法",
  naturalness: "表达自然度"
};

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

async function requestCoachPractice(payload) {
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };

  try {
    return await fetch("/api/practice/coach", requestOptions);
  } catch {
    return fetch("http://localhost:3001/api/practice/coach", requestOptions);
  }
}

function getFeedbackSourceLabel(result) {
  if (!result) {
    return "提交后会显示反馈来源。";
  }

  if (result.source === "deepseek") {
    return `DeepSeek 真实 AI 反馈${result.model ? `：${result.model}` : ""}`;
  }

  if (result.source === "openai") {
    return `OpenAI 真实 AI 反馈${result.model ? `：${result.model}` : ""}`;
  }

  return "本地兜底反馈";
}

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
  const [conversationMessages, setConversationMessages] = useState([]);
  const [practiceResult, setPracticeResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioBlobSize, setAudioBlobSize] = useState(0);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionStatus, setRecognitionStatus] =
    useState("点击“开始识别”后，说出的英文会自动填入文本框。");
  const [isConversationEnded, setIsConversationEnded] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("AI 回复后会自动英文朗读。");
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioUrlRef = useRef("");
  const recognitionRef = useRef(null);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId),
    [selectedScenarioId]
  );

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      stopMediaStream();

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function updateAudioUrl(nextAudioUrl) {
    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function clearRecordingTimer() {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function resetConversation() {
    window.speechSynthesis?.cancel();
    setConversationMessages([]);
    setPracticeResult(null);
    setUserInput("");
    setErrorMessage("");
    setIsConversationEnded(false);
    setSpeechStatus("AI 回复后会自动英文朗读。");
    setRecognitionStatus("点击“开始识别”后，说出的英文会自动填入文本框。");
  }

  function handleScenarioChange(scenarioId) {
    setSelectedScenarioId(scenarioId);
    resetConversation();
  }

  function speakAiReply(text) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeechStatus("当前浏览器不支持英文朗读，AI 回复仍可正常显示。");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeechStatus("正在朗读 AI 英文回复。");
    utterance.onend = () => setSpeechStatus("AI 英文回复朗读完成。");
    utterance.onerror = () => setSpeechStatus("朗读失败，可以直接阅读页面上的 AI 回复。");
    window.speechSynthesis.speak(utterance);
  }

  function handleReplayAiReply(text) {
    speakAiReply(text);
  }

  async function handleRecordClick() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMessage("当前浏览器不支持录音，请换用最新版 Chrome 或 Edge。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      updateAudioUrl("");
      setAudioBlobSize(0);
      setRecordingSeconds(0);
      setErrorMessage("");

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });

        updateAudioUrl(URL.createObjectURL(audioBlob));
        setAudioBlobSize(audioBlob.size);
        setIsRecording(false);
        clearRecordingTimer();
        stopMediaStream();
      });

      recorder.start();
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
    } catch (error) {
      setErrorMessage(
        error.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请允许浏览器使用麦克风。"
          : "无法启动录音，请检查麦克风是否可用。"
      );
    }
  }

  function handleSpeechRecognitionClick() {
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
      setErrorMessage("当前浏览器不支持语音识别，请换用最新版 Chrome 或 Edge。");
      return;
    }

    if (isConversationEnded) {
      setErrorMessage("当前对话已结束，请先重新开始对话。");
      return;
    }

    if (isRecognizing) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecognizing(true);
      setErrorMessage("");
      setRecognitionStatus("正在识别，请用英语说一句话。");
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();

      setUserInput(transcript);
      setRecognitionStatus(event.results[event.results.length - 1].isFinal ? "识别完成。" : "正在生成识别文本...");
    };

    recognition.onerror = (event) => {
      setIsRecognizing(false);
      setRecognitionStatus("识别已停止。");
      setErrorMessage(
        event.error === "not-allowed"
          ? "语音识别权限被拒绝，请允许浏览器使用麦克风。"
          : "语音识别失败，请重试或手动输入文本。"
      );
    };

    recognition.onend = () => {
      setIsRecognizing(false);
      setRecognitionStatus((currentStatus) =>
        currentStatus === "正在识别，请用英语说一句话。" ? "未识别到内容，请重试。" : currentStatus
      );
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function buildHistoryPayload(messages) {
    return messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedInput = userInput.trim();

    if (isConversationEnded) {
      setErrorMessage("当前对话已结束，请点击“重新开始对话”后继续。");
      return;
    }

    if (!trimmedInput) {
      setErrorMessage("请输入或识别一句英文后再提交。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput
    };
    const nextMessages = [...conversationMessages, userMessage];
    setConversationMessages(nextMessages);
    setUserInput("");

    try {
      const response = await requestCoachPractice({
        scenarioId: selectedScenarioId,
        transcript: trimmedInput,
        history: buildHistoryPayload(conversationMessages)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "提交失败，请稍后重试。");
      }

      const aiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.aiReply
      };
      setPracticeResult(data);
      setConversationMessages([...nextMessages, aiMessage]);
      speakAiReply(data.aiReply);
    } catch (error) {
      setConversationMessages(conversationMessages);
      setErrorMessage(
        error.message === "Failed to fetch"
          ? "请求后端失败，请确认后端服务已启动：http://localhost:3001"
          : error.message
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEndConversation() {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setIsConversationEnded(true);
    setSpeechStatus("对话已结束。本 PR 不生成课后总结，总结将在下一 PR 完成。");
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">七牛云 x XEngineer MVP</p>
            <h1>AI 英语口语陪练</h1>
          </div>
          <div className="status-pill">AI 陪练模式</div>
        </header>

        <section className="scenario-panel" aria-labelledby="scenario-title">
          <div>
            <p className="section-label" id="scenario-title">
              练习场景
            </p>
            <h2>{selectedScenario.title}</h2>
            <p className="muted">
              与{selectedScenario.role}进行多轮英语口语对话。AI 会参考历史上下文继续追问，并在回复后自动英文朗读。
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
              <div className="message-header">
                <span>AI</span>
                <button className="replay-button" onClick={() => handleReplayAiReply(selectedScenario.prompt)} type="button">
                  重读
                </button>
              </div>
              <p>{selectedScenario.prompt}</p>
            </div>

            {conversationMessages.length ? (
              conversationMessages.map((message) => (
                <div
                  className={message.role === "user" ? "message user-message" : "message ai-message"}
                  key={message.id}
                >
                  <div className="message-header">
                    <span>{message.role === "user" ? "You" : "AI"}</span>
                    {message.role === "assistant" && (
                      <button
                        className="replay-button"
                        onClick={() => handleReplayAiReply(message.content)}
                        type="button"
                      >
                        重读
                      </button>
                    )}
                  </div>
                  <p>{message.content}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">在下方输入一句英文，或使用语音识别自动生成文本。</div>
            )}

            {isConversationEnded && (
              <div className="end-state">本轮对话已结束。课后总结将在下一 PR 中生成。</div>
            )}

            <form className="input-panel" onSubmit={handleSubmit}>
              <button
                className={isRecording ? "record-button recording" : "record-button"}
                onClick={handleRecordClick}
                type="button"
                aria-label={isRecording ? "停止录音" : "开始录音"}
              >
                <span className="record-dot" />
                {isRecording ? "停止录音" : "开始录音"}
              </button>
              <textarea
                disabled={isConversationEnded}
                onChange={(event) => setUserInput(event.target.value)}
                placeholder={selectedScenario.placeholder}
                rows={4}
                value={userInput}
              />
              <button className="submit-button" disabled={isSubmitting || isConversationEnded} type="submit">
                {isSubmitting ? "提交中..." : "发送并获取 AI 回复"}
              </button>
            </form>

            <div className="speech-panel">
              <button
                className={isRecognizing ? "speech-button active" : "speech-button"}
                disabled={isConversationEnded}
                onClick={handleSpeechRecognitionClick}
                type="button"
              >
                {isRecognizing ? "停止识别" : "开始识别"}
              </button>
              <div>
                <p className="section-label">语音识别</p>
                <p>{recognitionStatus}</p>
              </div>
            </div>

            <div className="recording-panel">
              <div>
                <p className="section-label">录音状态</p>
                <p>
                  {isRecording
                    ? `正在录音：${recordingSeconds} 秒`
                    : audioUrl
                      ? `已生成录音：${recordingSeconds} 秒，约 ${Math.max(1, Math.round(audioBlobSize / 1024))} KB`
                      : "点击“开始录音”采集一段真实语音，也可以使用“开始识别”自动生成文本。"}
                </p>
              </div>
              {audioUrl && <audio controls src={audioUrl} />}
            </div>

            <div className="conversation-actions">
              <button disabled={isConversationEnded || !conversationMessages.length} onClick={handleEndConversation} type="button">
                结束对话
              </button>
              <button onClick={resetConversation} type="button">
                重新开始对话
              </button>
            </div>

            {errorMessage && <p className="error-text">{errorMessage}</p>}
          </div>

          <aside className="feedback-stack">
            <section className="feedback-card">
              <p className="section-label">反馈来源</p>
              <p>{getFeedbackSourceLabel(practiceResult)}</p>
              {practiceResult?.warning && <p className="warning-text">{practiceResult.warning}</p>}
            </section>

            <section className="feedback-card">
              <p className="section-label">AI 英文朗读</p>
              <p>{speechStatus}</p>
            </section>

            <section className="feedback-card">
              <div className="feedback-title-row">
                <p className="section-label">AI 回复</p>
                {practiceResult?.aiReply && (
                  <button
                    className="replay-button"
                    onClick={() => handleReplayAiReply(practiceResult.aiReply)}
                    type="button"
                  >
                    重读
                  </button>
                )}
              </div>
              <p>{practiceResult ? practiceResult.aiReply : "提交文本后，这里会展示 AI 回复。"}</p>
            </section>

            <section className="feedback-card">
              <p className="section-label">纠错反馈</p>
              {practiceResult ? (
                <div className="correction">
                  <div>
                    <span>原句</span>
                    <p>{practiceResult.correction.original}</p>
                  </div>
                  <div>
                    <span>更自然表达</span>
                    <p>{practiceResult.correction.improved}</p>
                  </div>
                  <div>
                    <span>原因</span>
                    <p>{practiceResult.correction.reason}</p>
                  </div>
                </div>
              ) : (
                <p>语法和表达建议会展示在这里。</p>
              )}
            </section>

            <section className="feedback-card">
              <p className="section-label">学习建议</p>
              {practiceResult?.tips?.length ? (
                <ul className="tips-list">
                  {practiceResult.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              ) : (
                <p>提交后会生成针对本轮表达的学习建议。</p>
              )}
            </section>

            <section className="feedback-card">
              <p className="section-label">评分面板</p>
              {practiceResult ? (
                <div className="score-list">
                  {Object.entries(practiceResult.scores).map(([key, value]) => (
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
