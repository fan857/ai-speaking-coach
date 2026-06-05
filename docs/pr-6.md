# PR 6：多轮英语口语对话 + AI 英文朗读

## 本 PR 做了什么

- 前端将单轮练习展示升级为多轮对话列表。
- 用户每次提交英文后，页面会追加用户消息和 AI 回复。
- 后端 `POST /api/practice/coach` 支持接收 `history` 历史对话。
- DeepSeek 真实 AI 回复会参考最近几轮上下文继续追问。
- mock 兜底也会根据历史轮次改变回复，保证未配置 Key 时仍可演示。
- 前端使用浏览器 `SpeechSynthesis` 自动朗读 AI 英文回复。
- 新增“结束对话”按钮，结束后停止继续输入；本 PR 不生成课后总结。

## 为什么这样做

题目要求用户能在指定场景下进行真实对话训练。单轮问答只能验证接口联通，无法体现“陪练”的连续交互能力。本 PR 把练习流程升级为可连续推进的对话，并加入 AI 英文朗读，让用户更接近真实口语互动体验。

课后总结属于另一个独立功能，按照“每个 PR 只做一件事”的规范，放到后续 PR 完成。

## 核心实现思路

- 前端维护 `conversationMessages`，按 `{ role, content }` 保存用户和 AI 消息。
- 每次提交时，前端把当前历史作为 `history` 发送给后端。
- 后端使用 Pydantic 定义 `ConversationMessage`，校验 `history` 数据结构。
- DeepSeek 提示词中加入最近 8 条历史消息，要求 AI 延续上下文且不要重复提问。
- AI 返回后，前端将回复追加到对话列表，并调用 `SpeechSynthesisUtterance` 进行英文朗读。
- 如果 DeepSeek 请求失败，后端继续返回 mock 兜底结果，前端不会报错。

## 如何测试

1. 安装依赖：

```bash
npm run install:all
```

2. 启动后端：

```bash
npm run dev:backend
```

3. 启动前端：

```bash
npm run dev:frontend
```

4. 打开：

```text
http://localhost:5173
```

5. 选择“面试”场景，输入：

```text
I built a learning app for students.
```

6. 点击“发送并获取 AI 回复”，确认：

- 用户文本显示在对话区。
- AI 英文回复显示在对话区。
- 浏览器会自动朗读 AI 英文回复。
- 右侧展示纠错、评分和学习建议。

7. 再输入第二句：

```text
I improved the practice speed by 30 percent.
```

确认 AI 回复会延续上一轮项目介绍上下文继续追问。

8. 点击“结束对话”，确认输入和识别被禁用，页面提示本轮对话已结束。
