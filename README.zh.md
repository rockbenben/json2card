# json2card

> 365 开源计划 #003 · 把任意 JSON 变成干净、贴合品牌的分享卡片 —— 聊天导出自动识别。支持网页、命令行、REST API。

[English](README.md)

别再截图那些乱糟糟的 Slack、ChatGPT、Claude 对话了。粘贴原始导出，json2card 自动识别格式并排成可分享的卡片 —— 无需配置结构，也不用事后在 Figma 里收拾。调好品牌色，再把 PNG 直接放进博客、Notion 或 16:9 幻灯片/PPT。

![Web UI](docs/web-ui.png)

![Card Preview](docs/card-preview.png)

## 特性

- **自动识别任意导出** — ChatGPT、Claude、Telegram、Discord、Slack 或你自己的 JSON。多条消息采样验证，一次命中结构;遇到奇怪结构，用一行字段映射指一下即可。
- **导出前就调成你的样子** — 品牌主题（统一背景 + 文字色贴合博客/幻灯片）、上传自己的字体、6 种可视风格预设、16 色调色板、5 种尺寸、水印 —— 不必事后 P 图。
- **乱输入也优雅降级** — 长消息自动分页,嵌套/非字符串内容强转为文本,` ``` ` 代码块保留等宽,markdown 剥离为纯文字。它会降级,而不是把版面搞崩。
- **三种使用方式** — 网页可视化编辑、命令行批处理（不用再写一次性脚本）、REST API 集成。
- **自适应字号** — 短语录放大填满画幅,密集/分页内容保持你设定的字号。
- **快且可移植** — 已启用 CORS 的 API、file:// 字体加载 + 页面复用（热服务器约 100ms/张）、一条命令 Docker 部署。

## 开始使用

**Docker**（推荐）:
```bash
docker run -d -p 3000:3000 json2card
```

**Docker Compose**:
```bash
docker compose up -d
```

**从源码运行**:
```bash
npm install && npm run setup-fonts && npm start
# 打开 http://localhost:3000
```

## 支持的格式

| 格式 | 说明 |
|------|------|
| `[["说话人","内容"], ...]` | 简单对话列表 |
| `{role, content}` | OpenAI / Claude API（支持 `name` 字段） |
| `{from, text}` | Telegram 导出 |
| `{author.name, content}` | Discord 导出 |
| `{user, text}` | Slack 导出 |
| `mapping.*.message...` | ChatGPT 导出 |
| 任意结构 | 自动发现或手动字段映射 |

每条消息只渲染其**文本**;非文本附件(图片、文件)会跳过,代码块保留等宽,其余 markdown 剥离为纯文字。

对话是最佳场景,但本质是*记录 → 卡片*:把任意对象数组 —— 语录、笔记、FAQ、更新日志 —— 映射到「标签 + 文本」字段,每行就是一张卡(见语录/笔记/新闻模板)。

## 自定义

| 类别 | 选项 |
|------|------|
| **模板** | 圆桌讨论、语录、笔记、新闻 —— 一键为该用途重排布局 |
| **风格** | 6 种预设（经典、柔和、纸质、引用、杂志、典雅）可视画廊 + 7 个可调参数 |
| **品牌主题** | 整套统一背景色 + 文字色，含一键预设色板 |
| **尺寸** | 3:4 小红书、1:1 方形(朋友圈/微博)、4:3、9:16 竖屏 Story、**16:9 幻灯片/PPT**(1920×1080) |
| **配色** | 16 色自动分配，可逐角色自定义 |
| **字体** | `fonts/` 自动识别，或浏览器上传（data-URI 内嵌；适合拉丁/子集字体） |
| **布局** | 4 个槽位（标题、正文、底部左/右）x 任意字段 |
| **水印** | 自定义文字，右下角 |
| **语言** | 18 种界面语言，含从右到左（阿拉伯语） |
| **主题** | 暗色 / 亮色 |

**16:9 + 品牌主题 = 直接进 PPT** —— 同一段对话,1920×1080 幻灯片就绪:

![16:9 幻灯片示例](docs/slide-example.png)

## API

两个端点，均接受 `POST` 请求，JSON 请求体 `{data, config}`。

| 端点 | 输出 |
|------|------|
| `/api/generate` | ZIP 压缩包（多张 PNG） |
| `/api/generate-long` | 单张拼接长图 PNG |

```bash
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"data":{"messages":[["You","你好"],["Bot","你好！"]]},"config":{}}' \
  -o cards.zip
```

<details>
<summary>Node.js / Python 调用示例</summary>

**Node.js**:
```javascript
const res = await fetch('http://localhost:3000/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: { messages: [['You', '你好'], ['Bot', '你好！']] },
    config: { cardSize: '1:1', watermark: '我的应用' }
  })
});
fs.writeFileSync('cards.zip', Buffer.from(await res.arrayBuffer()));
```

**Python**:
```python
import requests
resp = requests.post('http://localhost:3000/api/generate', json={
    'data': {'messages': [['You', '你好'], ['Bot', '你好！']]},
    'config': {'cardSize': '1:1'}
})
open('cards.zip', 'wb').write(resp.content)
```

</details>

## 命令行

```bash
npm run generate                  # test.json -> output/
node generate.mjs data.json      # 自定义输入
node generate.mjs --size 9:16    # 卡片尺寸
node generate.mjs --body-font X  # 自定义字体
```

## 配置参数

全部可选，不传用默认值。

```json
{
  "config": {
    "cardSize": "3:4",
    "watermark": "品牌名",
    "coverTitle": "Legend Talk",
    "fontSize": 28,
    "cardStyle": "classic",
    "brandBg": "",
    "brandText": "",
    "styleParams": {
      "textAlign": "left",
      "borderRadius": 40,
      "gradientAngle": 135,
      "noiseOpacity": 5,
      "glowIntensity": 10,
      "lineHeight": 2.0,
      "letterSpacing": 0.5,
      "gradientReverse": false,
      "showQuoteMark": false
    },
    "slots": {
      "badge": "displayLabel",
      "body": "content",
      "footerLeft": "text:Legend Talk",
      "footerRight": "pageIndicator"
    }
  }
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `RATE_LIMIT` | `10` | 每分钟每 IP 最大请求数（`0` 关闭限流） |

## 项目结构

```
generate.mjs        — 渲染引擎
server.mjs          — Express API + CORS
fonts.mjs           — 字体扫描
template.html       — 卡片模板
public/             — 网页界面 + 国际化
Dockerfile          — 一键部署
docker-compose.yml  — Compose 部署
```

```bash
npm test    # 11 个测试
```

## 关于 365 开源计划

本项目是 [365 开源计划](https://github.com/rockbenben/365opensource) 的第 003 个项目。

一个人 + AI，一年 300+ 个开源项目。[提交你的需求 ->](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)
