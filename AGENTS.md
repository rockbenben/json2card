# AGENTS.md

任意 JSON → 分享卡片。网页版 / CLI / REST API 三种用法，渲染全部发生在本地（无账号、无遥测）。

细节分工：**配置字段查 `README.md`（中英双份，改一处要同步另一处）**，其余规则写在本文件。

## Commands

- 装依赖 `npm install`（仓库用 npm，有 `package-lock.json`）
- 起服务 `npm start` = `node server.mjs`，开 <http://localhost:3000>
- 渲染示例 `npm run generate` = `node generate.mjs`，`test.json` → `output/`
- 下字体 `npm run setup-fonts` —— 仓库已内置 5 个字体，脚本只补缺失的那些（幂等，重复跑只打印 "already exists"）
- 测试 `npm test`（`node --test test-cards.mjs`）

运行时下限 **Node.js ≥ 22.12**——这是 puppeteer 25 的 `engines` 要求，不是我们挑的。低于这个版本 `npm ci` 会装得上、跑起来会炸。

没有 lint / format 脚本，也不要新增。代码风格跟随既有文件。

## Layout

- `generate.mjs` — 渲染引擎。CLI 与 `renderCardsFromData()` 都在这里
- `launch-browser.mjs` — 共用的 Chromium 启动器（服务端与 CLI 都走它）
- `server.mjs` — Express API + 手写 CORS 头 + 限流
- `fonts.mjs` — 扫描 `fonts/` 并把文件名转成展示名
- `template.html` — **导出**用的卡片模板（网页预览不读它，见下）
- `public/card-rules.js` — **预览与导出共用的卡片规则**（关键文件，见下）
- `public/app.js` / `public/i18n.js` / `public/style.css` / `public/index.html` — 网页版
- `scripts/download-fonts.mjs` — `npm run setup-fonts`
- `test-cards.mjs` / `test.json` — 单测与示例数据
- `docs/` — README 配图（`web-ui.png` 是桌面版界面）

## 安静出错的坑

这些**不会抛异常**，只会静默产出坏东西：

- **`public/card-rules.js` 被加载两次**：浏览器里当 `<script>` 挂 `window.CardRules`，Node 里由 `generate.mjs` 用 `new Function()` 求值。同一份源码、两个消费者。改它会同时改变预览与导出——这正是它存在的理由（两边不许漂移）。
- **`public/app.js` 里手抄了一份样式常量**（调色板、图标、隐藏角色）作 `/api/config` 加载前的兜底。那份拷贝必须与 `generate.mjs` 里的**逐字节一致**：漂移的表现是预览和导出颜色/图标对不上，而两边都不报错。
- **`server.mjs` 把 `node_modules/remove-markdown/index.js` 用字符串替换改成浏览器脚本**（`module.exports = ` → `window.removeMarkdown = `）。remove-markdown 一旦换掉这个字面量，vendor 脚本会静默变成非法 JS——浏览器端预览就没了。
- **容器里 Chromium 以 root 运行，必须带 `--no-sandbox`**，否则 Chromium 直接拒绝启动（`Running as root without --no-sandbox is not supported`）。镜像没有非 root 用户。
- **预览不读 `template.html`**：导出走模板，网页预览走 `public/style.css` + `public/app.js`，其中 `.sheen` / `.noise` / `.glow-*` 是手工镜像模板里同名规则的（CSS 里写着 "mirrors template.html"）。改模板的质感层要同步改 CSS，否则预览和导出的观感不一致。
- **封面卡不能套一层渲染**。`.content-inner` 的 `min-height:100%` 依赖直接父级有确定高度；把封面 HTML 嵌进 `.content` 里排版会塌。导出侧的处理见 `generate.mjs` 里 "Cover" 那段注释。
- **模板里的 `{{TEXT_COLOR}}` 是烘焙进 `pre.code` 的静态色**。逐卡改文字色时必须同时覆盖 `p` 和 `pre.code`，否则代码块永远是第一张卡的颜色。
- **字体展示名是从文件名推导的**，不是从字体内部读的。`public/app.js` 里 `FONT_PAIRINGS` 的名字必须与 `scanFonts()` 返回的 `displayName` 完全一致（`AlibabaPuHuiTi-3-55-Regular.ttf` → `Alibaba Pu Hui Ti`），否则配对落到默认字体。
- **`HIDDEN_ROLES`（`summary`、`you`）要从 `characters` 数组里整个剔除**，不只是不给配色——它们不占色位、不出配色面板。
- **阿拉伯语 / 希伯来语不能加字距**（连写文字会被 tracking 破坏）。预览与导出两边都有这条规则，改一处要改另一处。

## Testing

- 单测 `npm test` —— 只覆盖纯函数（配色分配、文件名清理、字体扫描）。**渲染不在单测覆盖范围内。**
- 动了渲染路径（模板、`card-rules.js`、`generate.mjs` 的 evaluate 分支），**必须实跑一次**：`npm run generate`，看 `output/` 里的 PNG 是否正常。代码对不等于渲染对。
- 改完 Docker 相关的东西要**真的构建一次镜像**（`docker build -t json2card:check .`），并在容器里跑一遍 `/api/generate`——镜像内用的是 apt 装的 Chromium，和本机下载的 bundled Chromium 不是同一个。
- 本机 npm 默认 registry 是 `registry.npmmirror.com`，它**不实现 audit 端点**：`npm audit` / `npm audit fix` 会直接报错退出。要看漏洞用 `npm audit --registry=https://registry.npmjs.org`；要修就用 `npm update <pkg>`（保持 lockfile 的 `resolved` 仍指向镜像源）。

## CI

- 唯一的工作流 `.github/workflows/docker.yml`：**手动触发**或 **release 发布时**运行，把镜像推到 Docker Hub 与 GHCR，构建 `linux/amd64` + `linux/arm64`。
- **CI 从不跑测试**，只在手动触发或 release 发布时构建推送。所以依赖升级或渲染改动**不会被 CI 拦住**，必须自己验证。
- GHCR 要求 owner 名小写，工作流里有一步专门做这件事；别删。
- `DOCKERHUB_USERNAME` 走 `vars`（仓库变量），`DOCKERHUB_TOKEN` / `GITHUB_TOKEN` 走 `secrets`。**任何 token 都不进版本库。**
- 镜像基础镜像是 `node:24-slim`（Node 20 已 EOL，GitHub Actions 也已移除 Node 20）。`24-slim` 与 `20-slim` 同为 Debian bookworm，所以 apt 包名不变。

## Commit

- 默认分支 `main`
- Conventional Commits，**message 与 body 都用英文**
- 按功能相关性拆分，一个 commit 一个逻辑单元；不相关的改动绝不混进同一笔
- **不加任何 AI 署名**：`Co-Authored-By:`、`Generated with`、session 尾注一律不要

## Security

- 聊天内容不进第三方：渲染全在本机，字体、JSON 都不外传。
- 送进 Puppeteer 的用户内容**必须先 `escapeHtml`**（`generate.mjs` 与 `public/app.js` 各有一份），否则 JSON 里的 `<` 能变成真 HTML 注入到卡片里。
- 上传的字体以 data URI 内嵌进 `@font-face`，文件名会被清洗成 CSS 安全的字符——别绕过那层清洗。
- 对外开实例前记得调 `RATE_LIMIT`（默认每 IP 每分钟 10 次，`0` 关闭）。
