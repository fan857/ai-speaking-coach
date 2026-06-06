# AI English Speaking Coach

七牛云 x XEngineer 暑期实训营第三批次题目一：AI 英语口语陪练。

> Demo 视频链接：MVP 完成后补充。

## 当前能力

- 支持三个练习场景：面试、点餐、会议。
- 支持两种练习模式：
  - 逐句反馈：每轮 AI 回复后立即展示纠错、评分和学习建议。
  - 沉浸对话：AI 全程只用英文对话，不即时纠错，结束后再统一总结。
- 支持浏览器录音采集，并可回放本地录音。
- 支持浏览器 Web Speech API，将英文语音识别成文本。
- 支持多轮英语口语对话，AI 回复会参考历史对话上下文。
- 支持浏览器 SpeechSynthesis 自动朗读和重新朗读 AI 英文回复。
- 支持 DeepSeek 真实 AI 反馈。
- 支持可选接入阿里云百炼 Qwen3.5-Omni-Realtime 实时语音对话。
- 沉浸对话由 Qwen3.5-Omni-Realtime 负责；逐句反馈使用 Qwen Realtime 先完成语音识别和自然接话，再由 DeepSeek 生成完整纠错评分。
- 课后总结报告提供流畅度、识别清晰度、语法准确度、表达自然度、互动完成度五维评分，并保存最近 5 次本机训练趋势。
- 逐句纠错支持结构化问题列表，按语法、用词、自然表达、流畅度和识别清晰度标注类型与优先级。
- 对话气泡支持中文翻译按钮，英文较弱的用户可以随时查看 AI 回复或自己发言的中文释义。
- 未配置 `DEEPSEEK_API_KEY` 或真实 AI 请求失败时，自动使用本地 mock 兜底，保证 Demo 不会中断。

## 题目要求对应实现

| 题目要求 | 当前实现 |
| --- | --- |
| 场景选择 | 支持面试、点餐、会议三类场景，并根据场景切换 AI 角色和开场问题。 |
| 实时语音对话 | 可接入 Qwen3.5-Omni-Realtime，通过 WebSocket 进行实时语音识别、AI 回复和音频播放。 |
| 发音评测 | MVP 阶段使用 Pronunciation Clarity / 识别清晰度表示发音可懂度，基于 ASR 稳定性、表达完整度和上下文可理解性估算。 |
| 语法/表达纠错 | DeepSeek 生成结构化纠错，包含错误类型、问题片段、推荐表达、中文解释和跟读练习句。 |
| 课后总结 | 结束对话后生成总结报告，展示总分、轮数、主要优点、高频问题、推荐表达和下一次训练建议。 |
| 对话自然度 | 逐句反馈先由 Qwen Realtime 快速接话，沉浸模式不打断纠错，保持真实交流节奏。 |
| 延迟优化 | 语音识别完成后立即显示用户文本，AI 回复返回后立即展示并朗读，详细纠错和总结延后生成。 |
| 可量化反馈 | 提供表达流畅度、识别清晰度、语法、表达自然度、互动完成度五维评分。 |

## 技术栈

- 前端：React + Vite
- 后端：Python + FastAPI
- AI：DeepSeek + LangChain + Qwen3.5-Omni-Realtime（可选）
- 浏览器能力：MediaRecorder、Web Audio API、SpeechSynthesis

## 本地运行

请先确认本机已安装 Node.js、npm 和 Python。

安装依赖：

```bash
npm run install:all
```

如果只安装后端依赖：

```bash
python -m pip install -r backend/requirements.txt
```

配置真实 AI 能力：

```bash
copy backend\.env.example backend\.env
```

然后在 `backend/.env` 中填写：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DASHSCOPE_API_KEY=你的阿里云百炼 API Key
DASHSCOPE_REALTIME_MODEL=qwen3.5-omni-plus-realtime
DASHSCOPE_REALTIME_VOICE=Tina
```

注意：`backend/.env` 不要提交到 GitHub。`.env.example` 只保留空模板。

启动后端：

```bash
npm run dev:backend
```

启动前端：

```bash
npm run dev:frontend
```

默认访问：

```text
http://localhost:5173
```

构建前端：

```bash
npm run build
```

## 交互说明

1. 在页面顶部选择练习场景：面试、点餐或会议。
2. 选择练习模式：逐句反馈或沉浸对话。
3. 逐句反馈模式下，点击“录一句并对话”，Qwen Realtime 会识别英文并先给出一句自然回复。
4. 说过至少一句话后，再点击“获取完整纠错评分”生成纠错、建议和评分。
5. 沉浸对话模式下，点击“开始 Qwen 实时语音对话”后直接用英文对话。
6. 逐句反馈模式会展示纠错、评分和学习建议。
7. 沉浸对话模式不会即时纠错，先保证连续英文对话体验。
8. 点击“开始 Qwen 实时语音对话”后，直接用英文说话并听取实时语音回复。
9. 需要纠错和评分时，可将文本提交到“获取完整纠错评分”。
10. 点击“结束对话并生成课后报告”后停止本轮练习，并生成全程表现总结。

## PR 记录

### PR 1：项目初始化和前端 MVP 页面骨架

- 初始化 `frontend/`、`backend/`、`docs/` 和根目录 `README.md`。
- 使用 React + Vite 实现基础练习页面。
- 后端提供健康检查接口 `GET /api/health`。

### PR 2：接入后端 mock 口语练习接口

- 后端新增 `POST /api/practice/mock`。
- 前端提交模拟语音文本时调用后端 mock API。
- 后端根据场景返回 AI 英文回复、纠错反馈和四项评分。

### PR 3：接入浏览器录音采集

- 使用浏览器 `MediaRecorder` 采集麦克风音频。
- 页面展示录音时长、音频大小和音频回放控件。

### PR 4：接入浏览器语音识别

- 使用浏览器 `SpeechRecognition || webkitSpeechRecognition` 识别英文语音。
- 识别结果会自动填入文本框。

### PR 5：迁移 FastAPI 后端并接入 DeepSeek 口语反馈

- 后端从 Node.js + Express 迁移到 Python + FastAPI。
- 新增真实 AI 口语陪练接口 `POST /api/practice/coach`。
- 通过 DeepSeek 生成场景化英文回复、纠错反馈、评分和学习建议。

### PR 6：多轮英语口语对话 + AI 英文朗读

- 前端将单轮展示升级为多轮对话列表。
- 后端 `POST /api/practice/coach` 支持接收 `history` 历史对话。
- 前端使用浏览器 `SpeechSynthesis` 自动朗读 AI 英文回复。

### PR 7：后端模块化并使用 LangChain 封装 DeepSeek 调用

- 将原本集中在 `backend/main.py` 的后端代码拆分到 `backend/app/`。
- 使用 `langchain-deepseek` 的 `ChatDeepSeek` 封装 DeepSeek 模型调用。
- 保持原有 API 路径和前端交互不变。

### PR 8：支持重新朗读 AI 回复

- 每条 AI 对话消息增加“重读”按钮。
- 右侧最新 AI 回复区域增加“重读”按钮。
- 点击后复用浏览器 `SpeechSynthesis` 重新播放对应英文回复。

### PR 9：新增沉浸式全英文对话模式

- 新增“逐句反馈 / 沉浸对话”模式切换。
- 沉浸模式下 AI 全程只用英文对话。
- 沉浸模式下不即时展示纠错、评分和学习建议。
- 后端 `POST /api/practice/coach` 支持 `mode=immersive`。
- 保留 mock 兜底，真实 AI 失败时仍可继续英文对话。

### PR 10：接入 Qwen3.5-Omni-Realtime 实时语音对话

- 新增 `WebSocket /api/realtime/qwen`，由后端代理连接阿里云百炼实时语音模型。
- 前端新增“开始 Qwen 实时语音对话”入口，采集麦克风音频并发送 PCM 流。
- 后端隐藏 `DASHSCOPE_API_KEY`，前端不直接暴露第三方 API Key。
- 前端播放模型返回的实时 PCM 音频，并展示实时识别文本和回复文本。
- 保留 DeepSeek 完整反馈、浏览器语音识别和本地 fallback，保证未配置实时模型时仍可演示核心流程。

### PR 13：新增口语能力量化报告

- 课后总结新增流畅度、识别清晰度、语法准确度、表达自然度、互动完成度五维评分。
- 每项评分展示对应原因，并明确评分依据来自对话转写、ASR 可识别程度和语言质量。
- 前端保存最近 5 次本机总结均分，用于展示训练趋势。
- 说明当前 MVP 的发音相关评分是“识别清晰度 / 发音可懂度”，不是专业音素级发音评测。

### PR 14：优化结构化纠错反馈

- 逐句反馈结果新增 issues 数组，展示错误类型、优先级、问题片段、推荐表达、中文解释和跟读练习句。
- DeepSeek prompt 明确要求返回结构化纠错问题，后端对返回结构做归一化。
- mock 兜底同步返回结构化问题，保证 Demo 未配置真实模型时仍可展示完整纠错面板。
- 前端纠错卡优先展示结构化问题列表，并保留总体改写和总体原因。
- 对话展示区新增翻译按钮，通过后端接口调用 DeepSeek 生成中文释义。

### PR 15：产品化页面与评审点展示优化

- 顶部增加产品 slogan、当前训练状态和题目要求命中点标签。
- 左侧对话区明确展示实时对话训练、语音识别结果、AI 语音回复和实时链路说明。
- 右侧反馈区拆分为训练状态、当前句反馈、能力评分和课后总结，方便评委快速理解功能覆盖。
- 课后报告卡展示总分、完成轮数、主要优点、高频问题、推荐表达和下一次训练建议，数据不足时基于本轮对话兜底展示。
- 评分面板补充每项评分解释，明确纠错和总结延后生成以保护对话流畅度。

## 原创与依赖说明

本项目代码为本次实训营题目创建的原创 MVP 实现，没有复制第三方项目代码。项目使用 React、Vite、FastAPI、LangChain、DeepSeek、Qwen3.5-Omni-Realtime、uvicorn、websockets 等开源框架、第三方模型和库完成基础工程、页面、接口、WebSocket 流式通信和 AI 调用。

Qwen3.5-Omni-Realtime 提供实时语音理解和语音输出能力；DeepSeek 提供语法、表达纠错和总结生成能力。项目原创部分包括场景化训练流程、后端代理封装、实时状态展示、练习模式切换、纠错时机设计、fallback 机制、反馈面板和 README 运行说明。

当前 MVP 的 Pronunciation Clarity / 识别清晰度不是专业音素级发音评分，而是基于语音识别稳定性、表达完整度和上下文可理解性进行的发音可懂度估算。后续可接入专业 pronunciation assessment API，进一步输出音素、重音、节奏等细粒度指标。

浏览器录音、语音识别、句级朗读队列依赖浏览器原生能力；Web Speech API 在不同浏览器支持程度不同，建议使用最新版 Chrome 或 Edge 演示。

## 后续 PR

- PR 11：结束对话后生成全程总结报告。
- PR 12：接入真实云端 STT/TTS，替换当前浏览器识别和朗读兜底。
