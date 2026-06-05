# AI English Speaking Coach

七牛云 × XEngineer 暑期实训营第三批次题目一：AI 英语口语陪练。

> Demo 视频链接：PR 1 暂未录制，后续 MVP 完成后补充。

## PR 1 完成内容

- 初始化项目目录结构：
  - `frontend/`：React + Vite 前端
  - `backend/`：Node.js + Express 后端
  - `docs/`：项目文档
  - `README.md`：运行方式与阶段说明
- 前端完成 MVP 页面骨架：
  - 场景选择：面试、点餐、会议
  - 对话展示区
  - 录音按钮占位
  - 文本输入框，用于模拟语音识别结果
  - AI 回复区域
  - 纠错反馈区域
  - 评分面板
- 使用 mock 数据跑通一次练习闭环：
  - 用户输入一句英文
  - AI 返回一句英文回复
  - 展示语法纠错与更自然表达
  - 展示流利度、发音清晰度、语法、表达自然度评分
- 后端初始化 Express 服务：
  - `GET /api/health`

## PR 2 完成内容

- 后端新增 mock 练习接口：
  - `POST /api/practice/mock`
- 前端提交模拟语音文本时，改为调用后端 mock API。
- 后端根据场景返回 AI 英文回复、纠错反馈和四项评分。
- 前端增加提交中状态和错误提示。
- Vite 开发服务器增加 `/api` 代理，方便本地前后端联调。

## 技术栈

- 前端：React, Vite
- 后端：Node.js, Express
- 当前阶段：不接入真实 OpenAI API，不接入真实语音识别或 TTS，仅使用 mock 数据模拟交互。

## 原创与依赖说明

本项目代码为本次实训营题目创建的原创 MVP 实现。PR 1 使用 React、Vite、Express 等开源框架完成基础工程和演示页面，没有复制第三方项目代码。

## 本地运行

请先确认本机已安装 Node.js 和 npm。

安装依赖：

```bash
npm run install:all
```

启动前端：

```bash
npm run dev:frontend
```

默认访问：

```text
http://localhost:5173
```

启动后端：

```bash
npm run dev:backend
```

健康检查：

```text
GET http://localhost:3001/api/health
```

构建前端：

```bash
npm run build
```

## 当前交互说明

1. 在页面顶部选择一个练习场景。
2. 在文本框输入一句英文，模拟语音识别结果。
3. 点击“提交模拟语音”。
4. 前端请求后端 mock API。
5. 页面会展示 AI 回复、纠错建议和四项评分。

## 后续 PR 

- PR 3：接入真实语音录制与浏览器音频采集。
- PR 4：接入真实 AI 对话、纠错和总结能力。
- PR 5：实现课后总结报告与 Demo 视频录制。
