import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import archiver from 'archiver';
import puppeteer from 'puppeteer';
import { renderCardsFromData, USER_STYLE, COLOR_PALETTE, CHAR_ICONS, FIXED_ICONS, HIDDEN_ROLES, CARD_SIZES, CARD_STYLES, STYLE_DEFAULTS, DEFAULT_SLOTS, PRESETS } from './generate.mjs';
import { scanFonts } from './fonts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const FONTS_DIR = path.join(__dirname, 'fonts');

let browser = null;
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    });
  }
  return browser;
}

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '10mb' }));

// Rate limiter — disabled with RATE_LIMIT=0, default 10 req/min/IP
const RATE_MAX = parseInt(process.env.RATE_LIMIT ?? '10');
const renderCalls = new Map();
// Cleanup stale IPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, calls] of renderCalls) {
    const recent = calls.filter(t => now - t < 60000);
    if (recent.length === 0) renderCalls.delete(ip);
    else renderCalls.set(ip, recent);
  }
}, 300000).unref();
function rateLimit(windowMs = 60000) {
  return (req, res, next) => {
    if (RATE_MAX <= 0) return next(); // disabled
    const ip = req.ip;
    const now = Date.now();
    const calls = renderCalls.get(ip) || [];
    const recent = calls.filter(t => now - t < windowMs);
    if (recent.length >= RATE_MAX) {
      return res.status(429).json({ error: `Rate limit: max ${RATE_MAX} requests per minute` });
    }
    recent.push(now);
    renderCalls.set(ip, recent);
    next();
  };
}

// ── API routes (before static middleware) ──

app.get('/api/config', (req, res) => {
  res.json({ userStyle: USER_STYLE, colorPalette: COLOR_PALETTE, icons: CHAR_ICONS, fixedIcons: FIXED_ICONS, hiddenRoles: HIDDEN_ROLES, cardSizes: CARD_SIZES, cardStyles: CARD_STYLES, styleDefaults: STYLE_DEFAULTS, defaultSlots: DEFAULT_SLOTS, presets: PRESETS });
});

// Scan once at startup, refresh via POST /api/fonts/refresh
let fontsCache = await scanFonts(FONTS_DIR);

app.get('/api/fonts', (req, res) => {
  res.json({ fonts: fontsCache, defaults: { body: 'Noto Serif SC', label: 'Noto Sans SC' } });
});

app.post('/api/fonts/refresh', async (req, res) => {
  fontsCache = await scanFonts(FONTS_DIR);
  res.json({ fonts: fontsCache, refreshed: true });
});

// POST /api/generate-long — render all cards as one vertical long image
app.post('/api/generate-long', rateLimit(), async (req, res) => {
  const { data, config = {} } = req.body;
  if (!data?.messages) return res.status(400).json({ error: 'Missing data.messages' });
  try {
    const results = await renderCardsFromData(data, config, TEMPLATE_PATH, FONTS_DIR, await getBrowser());
    // Stitch PNGs vertically using a Puppeteer page
    const b = await getBrowser();
    const page = await b.newPage();
    const imgTags = results.map(r => `<img src="data:image/png;base64,${r.buffer.toString('base64')}" style="display:block;width:100%;">`).join('');
    const firstSize = config.cardSize ? CARD_SIZES[config.cardSize] : null;
    const w = firstSize?.width || 1080;
    await page.setContent(`<html><body style="margin:0;padding:0;width:${w}px;">${imgTags}</body></html>`, { waitUntil: 'domcontentloaded' });
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: w, height: totalHeight });
    const buffer = await page.screenshot({ fullPage: true, omitBackground: true });
    await page.close();
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('Generate-long error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate', rateLimit(), async (req, res) => {
  const { data, config = {} } = req.body;
  if (!data?.messages) return res.status(400).json({ error: 'Missing data.messages' });
  try {
    const results = await renderCardsFromData(data, config, TEMPLATE_PATH, FONTS_DIR, await getBrowser());
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="cards.zip"');
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);
    for (const { filename, buffer } of results) archive.append(buffer, { name: filename });
    await archive.finalize();
  } catch (err) {
    console.error('Generate error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── Static files (after API routes) ──

// Serve remove-markdown as browser script (before static to avoid 404)
const _rmMdSrc = readFileSync(path.join(__dirname, 'node_modules/remove-markdown/index.js'), 'utf-8')
  .replace('module.exports = ', 'window.removeMarkdown = ');
app.get('/vendor/remove-markdown.js', (req, res) => { res.type('application/javascript').send(_rmMdSrc); });

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));
app.use('/fonts', express.static(FONTS_DIR));
app.get('/test.json', (req, res) => res.sendFile(path.join(__dirname, 'test.json')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
