# PR 2: 前后端 Mock API 联调

## 本 PR 做了什么

- 后端新增 `POST /api/practice/mock` 接口。
- 前端提交模拟语音文本时调用后端 mock API。
- 后端根据练习场景返回 AI 回复、纠错反馈和评分。
- 前端增加提交中状态和错误提示。
- Vite 开发环境增加 `/api` 代理。

## 为什么这样做

PR 1 已经完成页面骨架和本地 mock 闭环。PR 2 只做一件事：把 mock 数据从前端迁移到后端接口，让项目具备真实前后端交互形态，同时仍然不接入真实 AI API，保持实现可控。

## 核心实现思路

- 后端用 Express 接收 `scenarioId` 和 `transcript`。
- 后端校验场景和输入文本，返回固定 mock 结果。
- 前端用 `fetch("/api/practice/mock")` 请求接口。
- Vite 代理把 `/api` 请求转发到 `http://localhost:3001`。

## 如何测试

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

选择任意场景，输入一句英文，点击“提交模拟语音”，确认页面展示 AI 回复、纠错反馈和评分。

也可以直接测试接口：

```bash
curl -X POST http://localhost:3001/api/practice/mock \
  -H "Content-Type: application/json" \
  -d "{\"scenarioId\":\"interview\",\"transcript\":\"I built a web app.\"}"
```
