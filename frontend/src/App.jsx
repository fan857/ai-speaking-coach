import React, { useEffect, useMemo, useRef, useState } from "react";

const scenarios = [
  {
    id: "interview",
    label: "面试",
    title: "求职面试",
    role: "AI 面试官",
    prompt: "Please introduce a project you are proud of.",
    placeholder: "示例：I built a small web app for practicing English..."
  },
  {
    id: "restaurant",
    label: "点餐",
    title: "餐厅点餐",
    role: "AI 服务员",
    prompt: "Welcome! What would you like to order today?",
    placeholder: "示例：I would like a chicken sandwich and a cup of tea."
  },
  {
    id: "meeting",
    label: "会议",
    title: "团队会议",
    role: "AI 同事",
    prompt: "Please give a quick update on your work this week.",
    placeholder: "示例：This week I finished the login page and fixed two bugs."
  }
];

const practiceModes = [
  {
    id: "feedback",
    label: "逐句反馈",
    description: "每轮回复后立即展示纠错、评分和学习建议。"
  },
  {
    id: "immersive",
    label: "沉浸对话",
    description: "AI 全程只用英文对话，结束后再统一总结。"
  }
];

const scoreLabels = {
  fluency: "表达流畅度",
  pronunciation: "识别清晰度",
  grammar: "语法",
  naturalness: "表达自然度",
  taskCompletion: "互动完成度"
};

const SUMMARY_HISTORY_KEY = "qiniu-speaking-summary-history-v1";

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function getQwenRealtimeWebSocketUrl(scenarioId, mode) {
  const query = new URLSearchParams({ scenarioId, mode });
  return `ws://localhost:3001/api/realtime/qwen?${query.toString()}`;
}

function encodePcm16Base64(float32Samples) {
  const pcm = new Int16Array(float32Samples.length);
  for (let index = 0; index < float32Samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Samples[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  let binary = "";
  const bytes = new Uint8Array(pcm.buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function downsampleAudioBuffer(samples, sourceSampleRate, targetSampleRate = 16000) {
  if (sourceSampleRate === targetSampleRate) {
    return samples;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const nextLength = Math.round(samples.length / ratio);
  const result = new Float32Array(nextLength);

  for (let index = 0; index < nextLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.floor((index + 1) * ratio);
    let sum = 0;
    let count = 0;

    for (let sampleIndex = start; sampleIndex < end && sampleIndex < samples.length; sampleIndex += 1) {
      sum += samples[sampleIndex];
      count += 1;
    }

    result[index] = count ? sum / count : 0;
  }

  return result;
}

function decodePcm16Base64(base64Audio) {
  const binary = window.atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const pcm = new Int16Array(bytes.buffer);
  const samples = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    samples[index] = pcm[index] / 0x8000;
  }
  return samples;
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

async function requestPracticeSummary(payload) {
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };

  try {
    return await fetch("/api/practice/summary", requestOptions);
  } catch {
    return fetch("http://localhost:3001/api/practice/summary", requestOptions);
  }
}

async function requestStreamFallback(payload) {
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };

  try {
    // 强制直连后端的 3001 端口，坚决绕过 Vite 代理层可能存在的数据缓冲
    const response = await fetch("http://localhost:3001/api/practice/stream", requestOptions);
    if (response.ok) {
      return response;
    }
  } catch {
    // Fall through to the existing REST endpoint when the stream route is not available.
  }

  return requestCoachPractice(payload);
}

function splitReplyIntoSentences(reply) {
  const matches = reply.match(/[^。？！.!?]+[。？！.!?]?/g) || [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

function buildInstantAck(transcript) {
  const lowerText = transcript.toLowerCase();

  if (["forgot", "forget", "don't remember", "not sure", "no idea"].some((word) => lowerText.includes(word))) {
    return "Okay, no problem.";
  }

  if (["sorry", "nervous", "difficult", "hard"].some((word) => lowerText.includes(word))) {
    return "Okay, that's fine.";
  }

  if (transcript.split(/\s+/).filter(Boolean).length <= 5) {
    return "Okay, I understand.";
  }

  return "Okay, that sounds interesting.";
}

function mergeInstantAck(localAck, reply) {
  const cleanedReply = (reply || "").trim();
  if (!cleanedReply) {
    return localAck;
  }

  if (cleanedReply.toLowerCase().startsWith(localAck.toLowerCase())) {
    return cleanedReply;
  }

  return `${localAck} ${cleanedReply}`.trim();
}

function getFeedbackSourceLabel(result) {
  if (!result) {
    return "提交后会显示反馈来源。";
  }

  if (result.source === "deepseek") {
    return `DeepSeek 真实 AI 反馈${result.model ? `：${result.model}` : ""}`;
  }

  return "本地兜底反馈";
}

function getReplySourceLabel(source) {
  if (!source) {
    return "等待回复来源";
  }

  if (source === "deepseek") {
    return "DeepSeek 真实快速回复";
  }

  if (source === "qwen-realtime") {
    return "Qwen Realtime 语音模型回复";
  }

  if (source === "mock" || source === "fast-local") {
    return "本地 mock 兜底快速回复";
  }

  if (source === "local-instant" || source === "browser-instant") {
    return "浏览器本地承接句";
  }

  return source;
}

function isFallbackReplySource(source) {
  return ["mock", "fast-local", "local-instant", "browser-instant"].includes(source);
}

function ScoreBar({ label, reason, value }) {
  return (
    <div className="score-row">
      <div className="score-meta">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="score-track" aria-label={`${label}评分 ${value}`}>
        <div className="score-fill" style={{ width: `${value}%` }} />
      </div>
      {reason && <p className="score-reason">{reason}</p>}
    </div>
  );
}

function calculateAverageScore(scores) {
  const values = Object.values(scores || {}).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function loadSummaryHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SUMMARY_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function getTrendText(history) {
  if (!history.length) {
    return "这是本机记录的第一份训练报告。";
  }

  if (history.length === 1) {
    return `本次综合均分 ${history[0].averageScore}，继续完成下一轮后会显示趋势。`;
  }

  const current = history[0].averageScore;
  const previous = history[1].averageScore;
  const delta = current - previous;
  if (delta > 0) {
    return `本次综合均分 ${current}，比上次提高 ${delta} 分。`;
  }
  if (delta < 0) {
    return `本次综合均分 ${current}，比上次低 ${Math.abs(delta)} 分，建议复练薄弱项。`;
  }
  return `本次综合均分 ${current}，与上次持平。`;
}

function App() {
  const [selectedScenarioId, setSelectedScenarioId] = useState("interview");
  const [practiceMode, setPracticeMode] = useState("feedback");
  const [userInput, setUserInput] = useState("");
  const [conversationMessages, setConversationMessages] = useState([]);
  const [practiceResult, setPracticeResult] = useState(null);
  const [summaryResult, setSummaryResult] = useState(null);
  const [summaryHistory, setSummaryHistory] = useState(loadSummaryHistory);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackCandidate, setFeedbackCandidate] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioBlobSize, setAudioBlobSize] = useState(0);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionStatus, setRecognitionStatus] =
    useState("点击“录一句并对话”后，Qwen Realtime 会识别并先回复；需要评分时再点击纠错评分按钮。");
  const [isConversationEnded, setIsConversationEnded] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("AI 回复后会自动英文朗读。");
  const [isStreamingReply, setIsStreamingReply] = useState(false);
  const [streamStatus, setStreamStatus] = useState("低延迟模式会按句播放 AI 回复。");
  const [streamedReply, setStreamedReply] = useState("");
  const [quickReplySource, setQuickReplySource] = useState("");
  const [firstSentenceLatency, setFirstSentenceLatency] = useState(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [isQwenAsrActive, setIsQwenAsrActive] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("Qwen 实时语音模型未连接。");
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const [realtimeReply, setRealtimeReply] = useState("");
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioUrlRef = useRef("");
  const recognitionRef = useRef(null);
  const streamSocketRef = useRef(null);
  const speechQueueRef = useRef([]);
  const isSpeechQueuePlayingRef = useRef(false);
  const realtimeSocketRef = useRef(null);
  const realtimeAudioContextRef = useRef(null);
  const realtimeSourceRef = useRef(null);
  const realtimeProcessorRef = useRef(null);
  const realtimeStreamRef = useRef(null);
  const realtimePlaybackTimeRef = useRef(0);
  const qwenAsrTranscriptRef = useRef("");
  const qwenSentenceReplyRef = useRef("");
  const realtimeUserTranscriptRef = useRef("");
  const realtimeAssistantReplyRef = useRef("");

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId),
    [selectedScenarioId]
  );
  const selectedMode = useMemo(
    () => practiceModes.find((mode) => mode.id === practiceMode),
    [practiceMode]
  );
  const isImmersiveMode = practiceMode === "immersive";
  const displayAiReply = useMemo(() => {
    const latestAssistantMessage = [...conversationMessages].reverse().find((message) => message.role === "assistant");
    return latestAssistantMessage?.content || realtimeReply || practiceResult?.aiReply || "";
  }, [conversationMessages, practiceResult, realtimeReply]);

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      stopMediaStream();

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      recognitionRef.current?.abort();
      streamSocketRef.current?.close();
      stopRealtimeConversation();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function updateAudioUrl(nextAudioUrl) {
    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
  }

  function saveSummaryHistory(result) {
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      scenarioId: selectedScenarioId,
      mode: practiceMode,
      averageScore: calculateAverageScore(result.scores),
      scores: result.scores
    };
    const nextHistory = [entry, ...summaryHistory].slice(0, 5);
    setSummaryHistory(nextHistory);
    window.localStorage.setItem(SUMMARY_HISTORY_KEY, JSON.stringify(nextHistory));
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function clearRecordingTimer() {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function stopRealtimeConversation() {
    realtimeProcessorRef.current?.disconnect();
    realtimeSourceRef.current?.disconnect();
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeSocketRef.current?.close();
    realtimeAudioContextRef.current?.close();
    realtimeProcessorRef.current = null;
    realtimeSourceRef.current = null;
    realtimeStreamRef.current = null;
    realtimeSocketRef.current = null;
    realtimeAudioContextRef.current = null;
    realtimePlaybackTimeRef.current = 0;
    setIsRealtimeActive(false);
    setIsQwenAsrActive(false);
  }

  function stopRealtimeInputOnly() {
    realtimeProcessorRef.current?.disconnect();
    realtimeSourceRef.current?.disconnect();
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeSocketRef.current?.close();
    realtimeProcessorRef.current = null;
    realtimeSourceRef.current = null;
    realtimeStreamRef.current = null;
    realtimeSocketRef.current = null;
    setIsRealtimeActive(false);
    setIsQwenAsrActive(false);
  }

  function closeRealtimeAudioAfterPlayback() {
    const audioContext = realtimeAudioContextRef.current;
    if (!audioContext) {
      return;
    }

    const remainingMs = Math.max(0, realtimePlaybackTimeRef.current - audioContext.currentTime) * 1000;
    window.setTimeout(() => {
      if (realtimeAudioContextRef.current !== audioContext) {
        if (audioContext.state !== "closed") {
          audioContext.close();
        }
        return;
      }

      if (audioContext.state !== "closed") {
        audioContext.close();
      }
      realtimeAudioContextRef.current = null;
      realtimePlaybackTimeRef.current = 0;
    }, remainingMs + 350);
  }

  function resetConversation() {
    window.speechSynthesis?.cancel();
    setConversationMessages([]);
    setPracticeResult(null);
    setFeedbackCandidate(null);
    setSummaryResult(null);
    setIsSummarizing(false);
    setUserInput("");
    setErrorMessage("");
    setIsConversationEnded(false);
    setIsStreamingReply(false);
    setStreamedReply("");
    setQuickReplySource("");
    setFirstSentenceLatency(null);
    setRealtimeTranscript("");
    setRealtimeReply("");
    realtimeUserTranscriptRef.current = "";
    realtimeAssistantReplyRef.current = "";
    setRealtimeStatus("Qwen 实时语音模型未连接。");
    setStreamStatus("低延迟模式会按句播放 AI 回复。");
    speechQueueRef.current = [];
    isSpeechQueuePlayingRef.current = false;
    streamSocketRef.current?.close();
    stopRealtimeConversation();
    setSpeechStatus("AI 回复后会自动英文朗读。");
    setRecognitionStatus("点击“录一句并对话”后，Qwen Realtime 会识别并先回复；需要评分时再点击纠错评分按钮。");
  }

  function handleScenarioChange(scenarioId) {
    setSelectedScenarioId(scenarioId);
    resetConversation();
  }

  function handleModeChange(modeId) {
    setPracticeMode(modeId);
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

    // 强制寻找浏览器的本地(离线)英文语音，避免云端 TTS 的网络延迟
    const applyLocalVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // 优先寻找带有 en 标识且是本地服务 (localService) 的声音
      const localVoice = voices.find(v => v.lang.includes('en') && v.localService);
      if (localVoice) utterance.voice = localVoice;
    };
    
    if (window.speechSynthesis.getVoices().length > 0) {
      applyLocalVoice();
    } else {
      window.speechSynthesis.onvoiceschanged = applyLocalVoice;
    }

    utterance.onstart = () => setSpeechStatus("正在朗读 AI 英文回复。");
    utterance.onend = () => setSpeechStatus("AI 英文回复朗读完成。");
    utterance.onerror = () => setSpeechStatus("朗读失败，可以直接阅读页面上的 AI 回复。");
    window.speechSynthesis.speak(utterance);
  }

  function playNextQueuedSpeech() {
    if (isSpeechQueuePlayingRef.current) {
      return;
    }

    const nextItem = speechQueueRef.current.shift();
    if (!nextItem) {
      setSpeechStatus("低延迟语音队列播放完成。");
      return;
    }

    const nextText = typeof nextItem === "string" ? nextItem : nextItem.text;
    const isInstantAck = typeof nextItem === "object" && nextItem.isInstantAck;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeechStatus("当前浏览器不支持句级朗读，文本仍会流式展示。");
      return;
    }

    isSpeechQueuePlayingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.lang = "en-US";
    utterance.rate = isInstantAck ? 0.82 : 0.94;
    utterance.pitch = 1;

    // 同样强制绑定本地离线语音
    const applyLocalVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const localVoice = voices.find(v => v.lang.includes('en') && v.localService);
      if (localVoice) utterance.voice = localVoice;
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      applyLocalVoice();
    } else {
      window.speechSynthesis.onvoiceschanged = applyLocalVoice;
    }

    utterance.onstart = () => setSpeechStatus("正在播放低延迟句级回复。");
    utterance.onend = () => {
      isSpeechQueuePlayingRef.current = false;
      playNextQueuedSpeech();
    };
    utterance.onerror = () => {
      isSpeechQueuePlayingRef.current = false;
      setSpeechStatus("句级朗读失败，文本仍会流式展示。");
      playNextQueuedSpeech();
    };
    window.setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, isInstantAck ? 180 : 0);
  }

  function enqueueStreamingSpeech(text, options = {}) {
    speechQueueRef.current.push({ text, ...options });
    playNextQueuedSpeech();
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

  async function submitPracticeText(transcript) {
    const trimmedInput = transcript.trim();
    if (isConversationEnded) {
      setErrorMessage("当前对话已结束，请点击“重新开始对话”后继续。");
      return;
    }

    if (!trimmedInput) {
      setErrorMessage("请输入或识别一句英文后再提交。");
      return;
    }

    setErrorMessage("");
    setStreamedReply("");
    setQuickReplySource("");
    setPracticeResult(null);
    setStreamStatus("正在生成快速 AI 回复；需要纠错评分时，请稍后点击下方按钮。");

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput
    };
    const nextMessages = [...conversationMessages, userMessage];
    const historyPayload = buildHistoryPayload(conversationMessages);
    setConversationMessages(nextMessages);
    setFeedbackCandidate({ transcript: trimmedInput, history: historyPayload });
    setUserInput("");

    let quickReplyText = "";
    let replySource = "";
    setIsStreamingReply(true);

    try {
      const response = await requestStreamFallback({
        scenarioId: selectedScenarioId,
        mode: "immersive",
        transcript: trimmedInput,
        history: historyPayload,
        skipInstantAck: false,
          preferFastLocal: false
      });

      if (!response.ok) {
        throw new Error("快速回复请求失败。");
      }

      if (response.body && response.headers.get("content-type")?.includes("application/x-ndjson")) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bufferedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          bufferedText += decoder.decode(value, { stream: true });
          const lines = bufferedText.split("\n");
          bufferedText = lines.pop() || "";

          lines.forEach((line) => {
            if (!line.trim()) {
              return;
            }

            const data = JSON.parse(line);
            if (data.type === "accepted") {
              replySource = data.source || "";
              setQuickReplySource(replySource);
              setStreamStatus(`已收到你的句子，正在先生成口语回复。来源：${getReplySourceLabel(replySource)}`);
              return;
            }

            if (data.type === "sentence") {
              if (data.source) {
                replySource = data.source;
                setQuickReplySource(replySource);
              }
              quickReplyText = `${quickReplyText}${quickReplyText ? " " : ""}${data.text}`.trim();
              setStreamedReply(quickReplyText);
              setStreamStatus(
                `${isFallbackReplySource(data.source || replySource) ? "兜底回复已先返回。" : "AI 已先回复。"}你可以点击按钮获取这句话的完整纠错评分。`
              );
              return;
            }

            if (data.type === "done") {
              if (data.source) {
                replySource = data.source;
                setQuickReplySource(replySource);
              }
              quickReplyText = (data.reply || quickReplyText).trim();
            }
          });
        }
      } else {
        const data = await response.json();
        replySource = data.source || "";
        setQuickReplySource(replySource);
        quickReplyText = (data.aiReply || "").trim();
      }

      if (quickReplyText) {
        const aiMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: quickReplyText
        };
        setConversationMessages([...nextMessages, aiMessage]);
        speakAiReply(quickReplyText);
      }
    } catch (error) {
      setErrorMessage(error.message || "快速回复失败，请确认后端服务已启动。");
      setConversationMessages(nextMessages);
    } finally {
      setIsStreamingReply(false);
    }
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();

    if (!feedbackCandidate) {
      setErrorMessage("请先说一句英文，再获取纠错评分。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setStreamStatus("正在生成完整纠错评分。");

    try {
      const response = await requestCoachPractice({
        scenarioId: selectedScenarioId,
        mode: practiceMode,
        transcript: feedbackCandidate.transcript,
        history: feedbackCandidate.history
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "提交失败，请稍后重试。");
      }

      setPracticeResult(data);
      setFeedbackCandidate(null);
      setStreamStatus("完整纠错评分已生成。");
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

  async function handleSubmit(event) {
    event.preventDefault();
    await submitPracticeText(userInput);
  }
  function handleStreamingSubmit() {
    const trimmedInput = userInput.trim();

    if (isConversationEnded) {
      setErrorMessage("当前对话已结束，请重新开始后再使用低延迟模式。");
      return;
    }

    if (!trimmedInput) {
      setErrorMessage("请先输入或识别一句英文。");
      return;
    }

    streamSocketRef.current?.close();
    window.speechSynthesis?.cancel();
    speechQueueRef.current = [];
    isSpeechQueuePlayingRef.current = false;
    setIsStreamingReply(true);
    setErrorMessage("");
    setStreamedReply("");
    setFirstSentenceLatency(null);
    setStreamStatus("正在连接低延迟 WebSocket...");

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput
    };
    const nextMessages = [...conversationMessages, userMessage];
    const localAck = buildInstantAck(trimmedInput);
    const localAckStartedAt = performance.now();
    setConversationMessages(nextMessages);
    setUserInput("");

    const streamPayload = {
      scenarioId: selectedScenarioId,
      mode: "immersive",
      transcript: trimmedInput,
      history: buildHistoryPayload(conversationMessages),
      skipInstantAck: true,
      preferFastLocal: true
    };
    let skippedDuplicateAck = false;
    let hasReceivedRealSentence = false;
    let hasPlayedLocalAck = false;

    function appendStreamSentence(data) {
      const lowerSentence = data.text.trim().toLowerCase();
      const lowerAck = localAck.toLowerCase();

      if (
        data.source !== "browser-instant" &&
        !skippedDuplicateAck &&
        lowerSentence === lowerAck
      ) {
        skippedDuplicateAck = true;
        return;
      }

      const displayText =
        data.source !== "browser-instant" &&
        !skippedDuplicateAck &&
        lowerSentence.startsWith(lowerAck)
          ? data.text.trim().slice(localAck.length).trim()
          : data.text;

      skippedDuplicateAck = skippedDuplicateAck || displayText !== data.text;
      hasReceivedRealSentence = hasReceivedRealSentence || data.source !== "browser-instant";

      setFirstSentenceLatency((currentLatency) => currentLatency ?? data.latencyMs);
      setStreamedReply((currentReply) => `${currentReply}${currentReply ? " " : ""}${displayText}`);
      setStreamStatus(`第 ${data.seq + 1} 句已返回，当前延迟 ${data.latencyMs} ms。`);
      enqueueStreamingSpeech(data.audioText === data.text ? displayText : data.audioText || displayText, {
        isInstantAck: data.source === "browser-instant"
      });
    }

    function finishStreamReply(data) {
      const fullReply = mergeInstantAck(localAck, data.reply);
      const aiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullReply
      };
      setPracticeResult((currentResult) => ({
        ...(currentResult || {}),
        aiReply: fullReply,
        correction: currentResult?.correction || {
          original: trimmedInput,
          improved: trimmedInput,
          reason: "低延迟流式模式优先返回 AI 口语回应，本轮详细纠错可继续使用完整反馈按钮。"
        },
        scores: currentResult?.scores || {
          fluency: 0,
          pronunciation: 0,
          grammar: 0,
          naturalness: 0
        },
        tips: currentResult?.tips || ["低延迟模式用于降低首句等待时间，完整评分请使用原反馈流程。"],
        source: data.source
      }));
      setConversationMessages([...nextMessages, aiMessage]);
      setStreamStatus(`AI 完整回复耗时 ${data.latencyMs} ms；首响已由本地承接句提前播放。`);
      setIsStreamingReply(false);
    }

    window.setTimeout(() => {
      if (hasReceivedRealSentence || hasPlayedLocalAck) {
        return;
      }

      hasPlayedLocalAck = true;
      appendStreamSentence({
        type: "sentence",
        seq: 0,
        text: localAck,
        audioText: localAck,
        latencyMs: Math.round(performance.now() - localAckStartedAt),
        source: "browser-instant"
      });
      setStreamStatus("本地承接句已播放，快速回复正在生成...");
    }, 520);

    async function runStreamFallback() {
      const streamStartedAt = performance.now();

      try {
        const response = await requestStreamFallback(streamPayload);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "低延迟流式请求失败。");
        }

        if (response.body && response.headers.get("content-type")?.includes("application/x-ndjson")) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let bufferedText = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            bufferedText += decoder.decode(value, { stream: true });
            const lines = bufferedText.split("\n");
            bufferedText = lines.pop() || "";

            lines.forEach((line) => {
              if (!line.trim()) {
                return;
              }

              const data = JSON.parse(line);
              const clientLatencyMs = Math.round(performance.now() - streamStartedAt);

              if (data.type === "accepted") {
                setStreamStatus(`后端已接收，来源：${data.source}`);
                return;
              }

              if (data.type === "sentence") {
                appendStreamSentence({ ...data, latencyMs: clientLatencyMs });
                return;
              }

              if (data.type === "done") {
                finishStreamReply({ ...data, latencyMs: clientLatencyMs });
              }
            });
          }
          return;
        }

        const data = await response.json();
        const totalLatencyMs = Math.round(performance.now() - streamStartedAt);
        const sentences = splitReplyIntoSentences(data.aiReply || "");
        sentences.forEach((sentence, index) => {
          appendStreamSentence({
            type: "sentence",
            seq: index,
            text: sentence,
            audioText: sentence,
            latencyMs: totalLatencyMs
          });
        });
        finishStreamReply({
          reply: data.aiReply || "",
          source: data.source || "fallback",
          latencyMs: totalLatencyMs
        });
      } catch (error) {
        setIsStreamingReply(false);
        setConversationMessages(conversationMessages);
        setErrorMessage(error.message || "低延迟流式请求失败，请确认后端服务已启动。");
        setStreamStatus("低延迟流式请求失败。");
      }
    }

    runStreamFallback();
  }

  function playRealtimePcmAudio(base64Audio) {
    const audioContext = realtimeAudioContextRef.current;
    if (!audioContext) {
      return;
    }

    const samples = decodePcm16Base64(base64Audio);
    const buffer = audioContext.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startTime = Math.max(audioContext.currentTime, realtimePlaybackTimeRef.current);
    source.start(startTime);
    realtimePlaybackTimeRef.current = startTime + buffer.duration;
  }

  function handleRealtimeServerEvent(event) {
    if (event.type === "session.created" || event.type === "session.updated") {
      setRealtimeStatus("Qwen 实时语音模型已连接，可以直接说英文。");
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      realtimeUserTranscriptRef.current = "";
      setRealtimeStatus("检测到你正在说话...");
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      setRealtimeStatus("已检测到停顿，正在生成回复...");
      return;
    }

    if (event.type?.includes("input_audio_transcription") && event.delta) {
      realtimeUserTranscriptRef.current += event.delta;
      setRealtimeTranscript((text) => `${text}${event.delta}`);
      return;
    }

    if (event.type?.includes("input_audio_transcription") && event.transcript) {
      realtimeUserTranscriptRef.current = event.transcript;
      setRealtimeTranscript(event.transcript);
      if (event.type.endsWith(".completed") && event.transcript.trim()) {
        const userMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: event.transcript.trim()
        };
        setConversationMessages((messages) => [...messages, userMessage]);
      }
      return;
    }

    if (event.type === "response.audio.delta" && event.delta) {
      playRealtimePcmAudio(event.delta);
      setRealtimeStatus("正在播放 Qwen 实时语音回复。");
      return;
    }

    if ((event.type === "response.audio_transcript.delta" || event.type === "response.text.delta") && event.delta) {
      realtimeAssistantReplyRef.current += event.delta;
      setRealtimeReply((text) => `${text}${event.delta}`);
      return;
    }

    if (event.type === "response.done") {
      const reply = realtimeAssistantReplyRef.current.trim();
      if (reply) {
        const assistantMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply
        };
        setConversationMessages((messages) => [...messages, assistantMessage]);
        realtimeAssistantReplyRef.current = "";
      }
      setRealtimeStatus("本轮实时回复完成，可以继续说下一句。");
    }
  }

  function handleQwenSentenceEvent(event) {
    if (event.type === "session.created" || event.type === "session.updated") {
      setQuickReplySource("qwen-realtime");
      setRecognitionStatus("Qwen 实时语音已连接，请说一句英文。");
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      setRecognitionStatus("正在听你说话...");
      qwenAsrTranscriptRef.current = "";
      qwenSentenceReplyRef.current = "";
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      setRecognitionStatus("已检测到停顿，Qwen 正在识别并回复...");
      return;
    }

    if (event.type?.includes("input_audio_transcription") && event.delta) {
      qwenAsrTranscriptRef.current += event.delta;
      setUserInput(qwenAsrTranscriptRef.current);
      return;
    }

    if (event.type?.includes("input_audio_transcription") && event.transcript) {
      qwenAsrTranscriptRef.current = event.transcript;
      setUserInput(event.transcript);

      if (event.type.endsWith(".completed") && event.transcript.trim()) {
        const transcript = event.transcript.trim();
        const userMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: transcript
        };
        const historyPayload = buildHistoryPayload(conversationMessages);
        setConversationMessages((messages) => [...messages, userMessage]);
        setFeedbackCandidate({ transcript, history: historyPayload });
        setPracticeResult(null);
        setRecognitionStatus("Qwen 已识别，正在生成语音回复。需要评分时稍后点击纠错评分按钮。");
      }
      return;
    }

    if (event.type === "response.audio.delta" && event.delta) {
      playRealtimePcmAudio(event.delta);
      setRecognitionStatus("Qwen 正在播放实时回复。");
      return;
    }

    if ((event.type === "response.audio_transcript.delta" || event.type === "response.text.delta") && event.delta) {
      qwenSentenceReplyRef.current += event.delta;
      setStreamedReply(qwenSentenceReplyRef.current);
      setStreamStatus("Qwen Realtime 已先回复。你可以点击按钮获取这句话的完整纠错评分。");
      return;
    }

    if (event.type === "response.done") {
      const reply = qwenSentenceReplyRef.current.trim();
      if (reply) {
        const assistantMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply
        };
        setConversationMessages((messages) => [...messages, assistantMessage]);
        setRecognitionStatus("Qwen 单句回复完成，可以点击纠错评分按钮。以前端显示来源为 Qwen Realtime。");
      }
      stopRealtimeInputOnly();
      closeRealtimeAudioAfterPlayback();
      return;
    }

    if (event.type === "error") {
      setErrorMessage(event.message || "Qwen 实时语音连接失败。");
      stopRealtimeConversation();
    }
  }
  async function handleQwenSentencePracticeClick() {
    if (isQwenAsrActive) {
      stopRealtimeConversation();
      setRecognitionStatus("Qwen ASR 已停止。");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("当前浏览器不支持麦克风采集。");
      return;
    }

    try {
      const audioContext = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const socket = new WebSocket(getQwenRealtimeWebSocketUrl(selectedScenarioId, "feedback"));
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      realtimeAudioContextRef.current = audioContext;
      realtimeStreamRef.current = stream;
      realtimeSocketRef.current = socket;
      realtimeSourceRef.current = source;
      realtimeProcessorRef.current = processor;
      qwenAsrTranscriptRef.current = "";
      qwenSentenceReplyRef.current = "";

      setErrorMessage("");
      setUserInput("");
      setStreamedReply("");
      setQuickReplySource("qwen-realtime");
      setIsQwenAsrActive(true);
      setRecognitionStatus("正在连接 Qwen 单句实时语音对话...");

      socket.addEventListener("message", (message) => {
        try {
          handleQwenSentenceEvent(JSON.parse(message.data));
        } catch {
          setRecognitionStatus("收到 Qwen 单句语音事件，但解析失败。");
        }
      });

      socket.addEventListener("error", () => {
        stopRealtimeConversation();
        setErrorMessage("Qwen 单句实时语音连接失败，请确认 DASHSCOPE_API_KEY 和后端服务。");
      });

      socket.addEventListener("close", () => {
        setIsQwenAsrActive(false);
      });

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleAudioBuffer(input, audioContext.sampleRate, 16000);
        socket.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: encodePcm16Base64(downsampled)
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      stopRealtimeConversation();
      setErrorMessage(
        error.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请允许浏览器使用麦克风。"
          : "无法启动 Qwen 实时识别，请检查麦克风和后端配置。"
      );
    }
  }

  async function handleRealtimeConversationClick() {
    if (isRealtimeActive) {
      stopRealtimeConversation();
      setRealtimeStatus("Qwen 实时语音对话已停止。");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("当前浏览器不支持麦克风采集。");
      return;
    }

    try {
      const audioContext = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const socket = new WebSocket(getQwenRealtimeWebSocketUrl(selectedScenarioId, practiceMode));
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      realtimeAudioContextRef.current = audioContext;
      realtimeStreamRef.current = stream;
      realtimeSocketRef.current = socket;
      realtimeSourceRef.current = source;
      realtimeProcessorRef.current = processor;
      realtimePlaybackTimeRef.current = audioContext.currentTime;
      realtimeUserTranscriptRef.current = "";
      realtimeAssistantReplyRef.current = "";

      setRealtimeTranscript("");
      setRealtimeReply("");
      setRealtimeStatus("正在连接 Qwen 实时语音模型...");

      socket.addEventListener("open", () => {
        setIsRealtimeActive(true);
        setRealtimeStatus("已连接 Qwen Realtime，请直接说英文。");
      });

      socket.addEventListener("message", (message) => {
        try {
          handleRealtimeServerEvent(JSON.parse(message.data));
        } catch {
          setRealtimeStatus("收到实时事件，但解析失败。");
        }
      });

      socket.addEventListener("error", () => {
        setErrorMessage("Qwen 实时语音连接失败，请确认 DASHSCOPE_API_KEY 和后端服务。");
        setRealtimeStatus("Qwen 实时语音连接失败。");
      });

      socket.addEventListener("close", () => {
        setIsRealtimeActive(false);
      });

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleAudioBuffer(input, audioContext.sampleRate, 16000);
        socket.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: encodePcm16Base64(downsampled)
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      stopRealtimeConversation();
      setErrorMessage(
        error.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请允许浏览器使用麦克风。"
          : "无法启动 Qwen 实时语音对话，请检查麦克风和后端配置。"
      );
    }
  }

  async function handleEndConversation() {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    stopRealtimeConversation();
    setIsConversationEnded(true);
    setIsSummarizing(true);
    setSummaryResult(null);
    setSpeechStatus("对话已结束，正在生成课后总结。");
    setErrorMessage("");

    try {
      const response = await requestPracticeSummary({
        scenarioId: selectedScenarioId,
        mode: practiceMode,
        history: buildHistoryPayload(conversationMessages)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || "生成课后总结失败，请稍后重试。");
      }

      setSummaryResult(data);
      saveSummaryHistory(data);
      setSpeechStatus("课后总结已生成。");
    } catch (error) {
      setErrorMessage(error.message || "生成课后总结失败，请确认后端服务已启动。");
      setSpeechStatus("课后总结生成失败，可以重新开始对话后再试。");
    } finally {
      setIsSummarizing(false);
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
          <div className="status-pill">{selectedMode.label}</div>
        </header>

        <section className="scenario-panel" aria-labelledby="scenario-title">
          <div>
            <p className="section-label" id="scenario-title">
              练习场景
            </p>
            <h2>{selectedScenario.title}</h2>
            <p className="muted">
              {isImmersiveMode
                ? `与${selectedScenario.role}进行全英文沉浸对话。AI 不会打断纠错，先保证对话节奏。`
                : `与${selectedScenario.role}进行多轮英语口语对话。AI 会回复、朗读并给出即时反馈。`}
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

        <section className="mode-panel" aria-labelledby="mode-title">
          <div>
            <p className="section-label" id="mode-title">
              练习模式
            </p>
            <p>{selectedMode.description}</p>
          </div>
          <div className="mode-tabs" role="tablist" aria-label="练习模式">
            {practiceModes.map((mode) => (
              <button
                className={mode.id === practiceMode ? "active" : ""}
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                type="button"
              >
                {mode.label}
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
              <div className="end-state">
                {summaryResult ? "对话已结束，课后总结已生成。" : "对话已结束，正在准备课后总结。"}
              </div>
            )}

            {!isImmersiveMode ? (
              <>
                <div className="input-panel">
                <button
                  className={isQwenAsrActive ? "record-button recording" : "record-button"}
                  onClick={handleQwenSentencePracticeClick}
                  type="button"
                  aria-label={isQwenAsrActive ? "停止单句对话" : "录一句并对话"}
                >
                  <span className="record-dot" />
                  {isQwenAsrActive ? "停止对话" : "录一句并对话"}
                </button>
                <textarea
                  disabled={isConversationEnded}
                  onChange={(event) => setUserInput(event.target.value)}
                  placeholder={selectedScenario.placeholder}
                  rows={4}
                  value={userInput}
                />
              </div>
              <button
                className="feedback-submit-button"
                disabled={isSubmitting || isConversationEnded || !feedbackCandidate}
                onClick={handleFeedbackSubmit}
                type="button"
              >
                {isSubmitting ? "生成纠错评分中..." : "获取完整纠错评分"}
              </button>
              </>
            ) : (
              <div className="mode-guide">
                沉浸式对话中不做逐句纠错；点击下方 Qwen 实时语音对话开始练习，结束后统一生成总结。
              </div>
            )}

            {isImmersiveMode && (
              <div className="realtime-panel">
                <button
                  className={isRealtimeActive ? "realtime-button active" : "realtime-button"}
                  disabled={isConversationEnded}
                  onClick={handleRealtimeConversationClick}
                  type="button"
                >
                  {isRealtimeActive ? "停止 Qwen 实时对话" : "开始 Qwen 实时语音对话"}
                </button>
                <div>
                  <p className="section-label">Qwen3.5-Omni-Realtime</p>
                  <p>{realtimeStatus}</p>
                </div>
                <div className="realtime-copy">
                  <span>你说的话</span>
                  <p>{realtimeTranscript || "开始后直接对麦克风说英文，这里会显示实时识别文本。"}</p>
                </div>
                <div className="realtime-copy">
                  <span>实时回复</span>
                  <p>{realtimeReply || "模型的实时语音回复文本会显示在这里，音频会直接播放。"}</p>
                </div>
              </div>
            )}

            {!isImmersiveMode && (
              <div className="recording-panel">
                <div>
                  <p className="section-label">单句识别状态</p>
                  <p>{recognitionStatus}</p>
                  {(isStreamingReply || isSubmitting || streamedReply) && <p className="muted-card">{streamStatus}</p>}
                </div>
              </div>
            )}

            <div className="conversation-actions">
              <button
                disabled={isConversationEnded || isSummarizing || !conversationMessages.length}
                onClick={handleEndConversation}
                type="button"
              >
                {isSummarizing ? "生成总结中..." : "结束并总结"}
              </button>
              <button onClick={resetConversation} type="button">
                重新开始对话
              </button>
            </div>

            {errorMessage && <p className="error-text">{errorMessage}</p>}
          </div>

          <aside className="feedback-stack">
            <section className="feedback-card">
              <p className="section-label">当前模式</p>
              <p>{selectedMode.label}</p>
              <p className="muted-card">{selectedMode.description}</p>
            </section>

            <section className="feedback-card">
              <p className="section-label">反馈来源</p>
              <p>
                {practiceResult
                  ? getFeedbackSourceLabel(practiceResult)
                  : isImmersiveMode
                    ? "沉浸式对话由 Qwen3.5-Omni-Realtime 负责；结束后生成课后总结。"
                    : `逐句反馈由 Qwen Realtime 识别并先回复；当前回复来源：${getReplySourceLabel(quickReplySource)}。纠错评分点击后由 DeepSeek 生成。`}
              </p>
              {!isImmersiveMode && isFallbackReplySource(quickReplySource) && (
                <p className="warning-text">当前快速回复使用本地兜底，不是模型真实回复。请检查 DeepSeek Key、网络或后端日志。</p>
              )}
              {practiceResult?.warning && <p className="warning-text">{practiceResult.warning}</p>}
            </section>

            <section className="feedback-card">
              <p className="section-label">AI 英文朗读</p>
              <p>{speechStatus}</p>
            </section>

            <section className="feedback-card summary-card">
              <div className="feedback-title-row">
                <p className="section-label">课后总结</p>
                {summaryResult?.source && <span className="source-tag">{summaryResult.source}</span>}
              </div>
              {isSummarizing ? (
                <p>正在根据全程对话生成总结...</p>
              ) : summaryResult ? (
                <>
                  <p>{summaryResult.summary}</p>
                  {summaryResult.warning && <p className="warning-text">{summaryResult.warning}</p>}
                  <div className="summary-grid">
                    <div>
                      <span>亮点</span>
                      <ul>
                        {summaryResult.highlights.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span>待加强</span>
                      <ul>
                        {summaryResult.weaknesses.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span>下一步</span>
                      <ul>
                        {summaryResult.nextSteps.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="score-list compact-score-list">
                    {Object.entries(summaryResult.scores).map(([key, value]) => (
                      <ScoreBar
                        key={key}
                        label={scoreLabels[key] || key}
                        reason={summaryResult.scoreReasons?.[key]}
                        value={value}
                      />
                    ))}
                  </div>
                  <div className="trend-panel">
                    <div>
                      <span>综合均分</span>
                      <strong>{calculateAverageScore(summaryResult.scores)}</strong>
                    </div>
                    <p>{getTrendText(summaryHistory)}</p>
                  </div>
                  {summaryResult.scoreBasis && <p className="score-basis">{summaryResult.scoreBasis}</p>}
                </>
              ) : (
                <p>结束对话后，这里会生成全程表现总结、评分依据、薄弱点和下一步训练建议。</p>
              )}
            </section>

            <section className="feedback-card">
              <div className="feedback-title-row">
                <p className="section-label">AI 回复</p>
                {displayAiReply && (
                  <button
                    className="replay-button"
                    onClick={() => handleReplayAiReply(displayAiReply)}
                    type="button"
                  >
                    重读
                  </button>
                )}
              </div>
              <p>{displayAiReply || "开始对话后，这里会同步展示最近一条 AI 回复。"}</p>
            </section>

            {isImmersiveMode ? (
              <section className="feedback-card">
                <p className="section-label">沉浸对话说明</p>
                <p>当前模式不进行即时纠错和评分，先保证英语对话流畅。点击“结束并总结”后，会基于全程对话生成课后总结、薄弱点和训练重点。</p>
              </section>
            ) : (
              <>
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
                        <ScoreBar
                          key={key}
                          label={scoreLabels[key] || key}
                          reason={practiceResult.scoreReasons?.[key]}
                          value={value}
                        />
                      ))}
                    </div>
                  ) : (
                    <p>表达流畅度、识别清晰度、语法、表达自然度评分会展示在这里。</p>
                  )}
                </section>
              </>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

export default App;
