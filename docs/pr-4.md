# PR 4: 浏览器语音识别

## 本 PR 做了什么

- 前端新增“开始识别 / 停止识别”按钮。
- 使用浏览器 Web Speech API 识别英文语音。
- 将识别结果自动写入文本框。
- 展示识别中、识别完成、未识别到内容、识别失败等状态。
- 保留 PR3 的录音回放能力和 PR2 的后端 mock 反馈链路。

## 为什么这样做

英语口语陪练的核心体验需要真实语音输入。PR3 已经完成浏览器音频采集，PR4 继续补齐“语音转文本”这一环，让用户可以通过说话生成文本，再提交给后端获得对话回复、纠错和评分。

## 核心实现思路

- 使用 `window.SpeechRecognition || window.webkitSpeechRecognition` 兼容 Chrome/Edge。
- 设置识别语言为 `en-US`。
- 开启 `interimResults`，让识别过程中的文本也能实时进入输入框。
- 通过 `onresult` 更新文本框，通过 `onerror` 和 `onend` 管理状态提示。
- 不新增后端接口，不接入真实大模型，保持本 PR 只关注浏览器语音识别。

## 如何测试

启动前端：

```bash
npm run dev:frontend
```

启动后端：

```bash
npm run dev:backend
```

打开：

```text
http://localhost:5173
```

测试步骤：

1. 选择任意场景。
2. 点击“开始识别”。
3. 允许浏览器使用麦克风。
4. 用英语说一句话，例如 `I finished the login page this week.`
5. 确认文本框自动出现识别结果。
6. 点击“提交模拟语音”，确认页面继续展示 AI 回复、纠错反馈和评分。

注意：Web Speech API 对浏览器支持有限，建议使用最新版 Chrome 或 Edge 测试。
