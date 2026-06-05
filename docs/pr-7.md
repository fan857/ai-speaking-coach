# PR 7：后端模块化并使用 LangChain 封装 DeepSeek 调用

## 本 PR 做了什么

- 将后端从单文件 `backend/main.py` 拆分为 `backend/app/` 模块。
- `main.py` 只保留环境加载、FastAPI 应用创建和本地启动入口。
- 新增 `schemas.py` 管理请求数据结构。
- 新增 `routes.py` 管理 API 路由。
- 新增 `config.py` 管理环境变量和 AI 配置状态。
- 新增 `scenarios.py` 管理练习场景配置。
- 新增 `mock_feedback.py` 管理本地兜底反馈。
- 新增 `prompts.py` 管理 DeepSeek 提示词。
- 新增 `ai_client.py` 使用 LangChain `ChatDeepSeek` 调用 DeepSeek。
- 保持前端页面、接口路径和返回结构不变。

## 为什么这样做

PR5 和 PR6 已经让后端具备真实 AI 反馈和多轮上下文能力，但所有代码集中在 `main.py` 里，不利于后续扩展课后总结、发音评测、提示词版本管理和模型切换。

本 PR 不新增用户侧功能，只做后端可维护性提升和模型调用封装，符合“每个 PR 只做一件事”的要求。

## 核心实现思路

- 用 `create_app()` 创建 FastAPI 应用，路由通过 `include_router` 注入。
- 用 Pydantic `PracticeRequest` 和 `ConversationMessage` 统一请求结构。
- 用 `get_ai_provider_config()` 读取 DeepSeek 配置，不在代码中写死密钥。
- 用 `ChatDeepSeek` 代替手写 HTTP 请求，模型调用集中在 `ai_client.py`。
- 模型调用失败、LangChain 依赖缺失或 Key 未配置时，继续返回 mock 兜底结果，保证 Demo 可用。

## 如何测试

1. 安装后端依赖：

```bash
npm run install:all
```

2. 启动后端：

```bash
npm run dev:backend
```

3. 检查健康接口：

```text
GET http://localhost:3001/api/health
```

4. 启动前端：

```bash
npm run dev:frontend
```

5. 打开：

```text
http://localhost:5173
```

6. 输入英文并提交，确认：

- API 路径仍然是 `/api/practice/coach`。
- 前端仍能展示 AI 回复、纠错、评分和学习建议。
- 配置 `DEEPSEEK_API_KEY` 时反馈来源显示 DeepSeek。
- 未配置 Key 或请求失败时仍返回本地兜底反馈。
