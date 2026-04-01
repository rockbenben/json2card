# json2card

> 365 Open Source Plan #003 · Turn any JSON into beautiful shareable cards — via Web UI, CLI, or REST API.

[中文文档](README.zh.md)

![Web UI](docs/web-ui.png)

![Card Preview](docs/card-preview.png)

## Features

- **Three ways to use** — Web UI for visual editing, CLI for batch processing, REST API for integration
- **Auto format detection** — Paste ChatGPT, Claude, Telegram, Discord, Slack exports or any custom JSON; format recognized automatically via multi-sample validation
- **Rich customization** — 6 style presets, 5 card sizes, 16-color palette, custom fonts, 4-slot layout, watermark
- **Smart pagination** — Long messages auto-split across cards with accurate overflow detection
- **Clean output** — Markdown syntax stripped automatically, cards show pure text
- **Cross-origin API** — CORS enabled, deploy once and call from anywhere
- **Fast rendering** — File-based font loading + page reuse, ~100ms per card on warm server

## Get Started

**Docker** (recommended):
```bash
docker run -d -p 3000:3000 json2card
```

**Docker Compose**:
```bash
docker compose up -d
```

**From source**:
```bash
npm install && npm run setup-fonts && npm start
# Open http://localhost:3000
```

## Supported Formats

| Format | Example |
|--------|---------|
| `[["speaker","text"], ...]` | Simple dialog list |
| `{role, content}` | OpenAI / Claude API (supports `name` field) |
| `{from, text}` | Telegram export |
| `{author.name, content}` | Discord export |
| `{user, text}` | Slack export |
| `mapping.*.message...` | ChatGPT export |
| Any structure | Auto-discovered or manual field mapping |

## Customization

| Category | Options |
|----------|---------|
| **Style** | 6 presets (Classic, Gentle, Textured, Quote, Magazine, Elegant) + 7 tunable params |
| **Size** | 3:4 Portrait, 1:1 Square, 4:3 Landscape, 9:16 Tall, 16:9 Wide |
| **Colors** | 16 auto-assigned muted tones, per-speaker override |
| **Fonts** | Drop files into `fonts/`, auto-detected |
| **Layout** | 4 slots (header, body, footer left/right) x any field |
| **Watermark** | Custom text, bottom-right |
| **Language** | Chinese / English |
| **Theme** | Dark / Light |

## API

Two endpoints, both accept `POST` with JSON body `{data, config}`.

| Endpoint | Output |
|----------|--------|
| `/api/generate` | ZIP with separate PNGs |
| `/api/generate-long` | Single stitched PNG |

```bash
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"data":{"messages":[["You","Hi"],["Bot","Hello!"]]},"config":{}}' \
  -o cards.zip
```

<details>
<summary>Node.js / Python examples</summary>

**Node.js**:
```javascript
const res = await fetch('http://localhost:3000/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: { messages: [['You', 'Hi'], ['Bot', 'Hello!']] },
    config: { cardSize: '1:1', watermark: 'My App' }
  })
});
fs.writeFileSync('cards.zip', Buffer.from(await res.arrayBuffer()));
```

**Python**:
```python
import requests
resp = requests.post('http://localhost:3000/api/generate', json={
    'data': {'messages': [['You', 'Hi'], ['Bot', 'Hello!']]},
    'config': {'cardSize': '1:1'}
})
open('cards.zip', 'wb').write(resp.content)
```

</details>

## CLI

```bash
npm run generate                  # test.json -> output/
node generate.mjs data.json      # custom input
node generate.mjs --size 9:16    # card size
node generate.mjs --body-font X  # custom font
```

## Config Reference

All fields optional. Defaults used when omitted.

```json
{
  "config": {
    "cardSize": "3:4",
    "watermark": "Brand",
    "coverTitle": "Legend Talk",
    "fontSize": 28,
    "cardStyle": "classic",
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `RATE_LIMIT` | `10` | Max requests per minute per IP (`0` to disable) |

## Project Structure

```
generate.mjs        — render engine
server.mjs          — Express API + CORS
fonts.mjs           — font scanning
template.html       — card template
public/             — web UI + i18n
Dockerfile          — one-command deploy
docker-compose.yml  — compose deploy
```

```bash
npm test    # 11 tests
```

## About 365 Open Source Plan

Project #003 of the [365 Open Source Plan](https://github.com/rockbenben/365opensource).

One person + AI, 300+ open source projects in a year. [Submit your idea ->](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)
