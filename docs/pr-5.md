# PR 5: 真实 AI 口语陪练反馈

## 本 PR 做了什么

- 后端新增 `POST /api/practice/coach` 接口。
- 后端从 Node.js + Express 迁移为 Python + FastAPI。
- 支持通过 DeepSeek V4 模型生成口语陪练反馈。
- AI 反馈包含：
  - 英文 AI 回复
  - 针对用户原句的纠错反馈
  - 流利度、发音清晰度、语法、表达自然度评分
  - 2 到 3 条学习建议
- 前端提交时改为调用 `/api/practice/coach`。
- 页面展示反馈来源：真实 AI 反馈 / 本地兜底反馈。
- 新增 `backend/.env.example`，说明后端 API Key 和模型配置方式。
- 新增 `backend/requirements.txt`，管理 FastAPI 后端依赖。
- 根目录 `npm run dev:backend` 改为启动 Python FastAPI 服务。

## 为什么这样做

题目核心是 AI 英语口语陪练。PR1 到 PR4 已经完成项目骨架、前后端联调、录音采集和语音识别。PR5 开始接入真实大模型能力，让系统能够根据用户说出的内容和所选场景生成自然回复、纠错、评分和学习建议。

## 核心实现思路

- 使用 FastAPI 实现原有后端接口，保持前端请求路径不变。
- 后端优先读取 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 和可选 `DEEPSEEK_BASE_URL`。
- 默认使用 `deepseek-v4-flash`，也可以配置为 `deepseek-v4-pro`。
- OpenAI fallback 仅在显式设置 `AI_PROVIDER=openai` 时启用，避免误连 OpenAI。
- 使用 DeepSeek 的 OpenAI 兼容 Chat Completions API 请求大模型。
- 通过 JSON 输出约束要求模型返回稳定 JSON。
- 后端对返回结果做兜底归一化，保证分数为 0 到 100 的整数。
- 未配置 Key 或请求失败时，返回本地兜底结果，保证 Demo 不会中断。
- 前端根据 `source` 字段展示当前反馈来源。

## 如何测试

安装依赖：

```bash
npm run install:all
```

或者只安装后端依赖：

```bash
python -m pip install -r backend/requirements.txt
```

配置环境变量：

```bash
copy backend\.env.example backend\.env
```

在 `backend/.env` 中填写：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

启动后端：

```bash
npm run dev:backend
```

启动前端：

```bash
npm run dev:frontend
```

打开：

```text
http://localhost:5173
```

测试步骤：

1. 选择任意场景。
2. 点击“开始识别”，用英语说一句话。
3. 确认识别文本进入文本框。
4. 点击“获取 AI 反馈”。
5. 如果已配置 Key，确认右侧显示“DeepSeek 真实 AI 反馈”。
6. 确认页面展示英文 AI 回复、纠错反馈、学习建议和四项评分。

未配置 `DEEPSEEK_API_KEY` 时，页面会显示“本地兜底反馈”，用于本地演示和无 Key 场景。
