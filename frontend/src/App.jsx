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

async function requestMockPractice(payload) {
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };

  try {
    return await fetch("/api/practice/mock", requestOptions);
  } catch {
    return fetch("http://localhost:3001/api/practice/mock", requestOptions);
  }
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
  const [submittedText, setSubmittedText] = useState("");
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

  function handleScenarioChange(scenarioId) {
    setSelectedScenarioId(scenarioId);
    setSubmittedText("");
    setPracticeResult(null);
    setErrorMessage("");
    setRecognitionStatus("点击“开始识别”后，说出的英文会自动填入文本框。");
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

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedInput = userInput.trim();

    if (!trimmedInput) {
      setErrorMessage("请输入一句英文后再提交。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await requestMockPractice({
        scenarioId: selectedScenarioId,
        transcript: trimmedInput
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "提交失败，请稍后重试。");
      }

      setSubmittedText(data.transcript);
      setPracticeResult(data);
    } catch (error) {
      setErrorMessage(
        error.message === "Failed to fetch"
          ? "请求后端失败，请确认后端服务已启动：http://localhost:3001"
          : error.message
      );
    } finally {
      setIsSubmitting(false);
    }
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
              与{selectedScenario.role}进行场景对话练习。当前 PR 通过后端 mock
              API 返回 AI 回复、纠错和评分。
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

            {practiceResult && (
              <div className="message ai-message">
                <span>AI</span>
                <p>{practiceResult.aiReply}</p>
              </div>
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
                onChange={(event) => setUserInput(event.target.value)}
                placeholder={selectedScenario.placeholder}
                rows={4}
                value={userInput}
              />
              <button className="submit-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "提交中..." : "提交模拟语音"}
              </button>
            </form>

            <div className="speech-panel">
              <button
                className={isRecognizing ? "speech-button active" : "speech-button"}
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
                      : "点击“开始录音”采集一段真实语音，文本框仍用于模拟语音识别结果。"}
                </p>
              </div>
              {audioUrl && <audio controls src={audioUrl} />}
            </div>

            {errorMessage && <p className="error-text">{errorMessage}</p>}
          </div>

          <aside className="feedback-stack">
            <section className="feedback-card">
              <p className="section-label">AI 回复</p>
              <p>
                {practiceResult ? practiceResult.aiReply : "提交一句模拟语音后，这里会展示 AI 回复。"}
              </p>
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
