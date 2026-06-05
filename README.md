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
- 未配置 `DEEPSEEK_API_KEY` 或真实 AI 请求失败时，自动使用本地 mock 兜底，保证 Demo 不会中断。

## 技术栈

- 前端：React + Vite
- 后端：Python + FastAPI
- AI：DeepSeek + LangChain
- 浏览器能力：MediaRecorder、Web Speech API、SpeechSynthesis

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
3. 点击“开始识别”，用英语说一句话，识别文本会自动填入文本框。
4. 也可以直接编辑文本框内容。
5. 点击发送按钮后，AI 会返回英文回复并自动朗读。
6. 逐句反馈模式会展示纠错、评分和学习建议。
7. 沉浸对话模式不会即时纠错，先保证连续英文对话体验。
8. 点击“结束对话”后停止本轮练习；全程总结将在后续 PR 完成。

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

## 原创与依赖说明

本项目代码为本次实训营题目创建的原创 MVP 实现，没有复制第三方项目代码。项目使用 React、Vite、FastAPI、LangChain、DeepSeek、uvicorn 等开源框架和库完成基础工程、页面、接口和 AI 调用。

浏览器录音、语音识别和朗读依赖浏览器原生能力；Web Speech API 在不同浏览器支持程度不同，建议使用最新版 Chrome 或 Edge 演示。

## 后续 PR

- PR 10：结束对话后生成全程总结报告。
- PR 11：优化语音识别到 AI 回复的自动闭环流畅度。
