import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import removeMarkdown from 'remove-markdown';
import { scanFonts, generateFontFaceCSS } from './fonts.mjs';
const { buildCardList } = new Function(readFileSync(new URL('./public/card-rules.js', import.meta.url), 'utf-8') + '\nreturn CardRules;')();

// ── Constants ──

// User/topic card style (dark)
export const USER_STYLE = { gradientStart: '#0c0c0c', gradientEnd: '#1a1a1a', textColor: '#f0e6d2', icon: '📜' };

// 16-color palette — popular social media tones, each visually distinct
export const COLOR_PALETTE = [
  { gradientStart: '#c4836e', gradientEnd: '#a0604a' },  // 赤陶 terracotta
  { gradientStart: '#7b9e89', gradientEnd: '#5a7e69' },  // 鼠尾草 sage
  { gradientStart: '#8b7db8', gradientEnd: '#6a5d98' },  // 薰衣草 lavender
  { gradientStart: '#c98a7a', gradientEnd: '#b0705e' },  // 蜜桃 peach
  { gradientStart: '#5d8a9e', gradientEnd: '#3d6a7e' },  // 雾霾蓝 dusty blue
  { gradientStart: '#b87a85', gradientEnd: '#985a65' },  // 豆沙粉 dusty rose
  { gradientStart: '#5a8e8e', gradientEnd: '#3a6e6e' },  // 青色 teal
  { gradientStart: '#9a7e5a', gradientEnd: '#7a5e3a' },  // 暖沙 warm sand
  { gradientStart: '#8e6a7a', gradientEnd: '#6e4a5a' },  // 藕紫 mauve
  { gradientStart: '#6a8e6a', gradientEnd: '#4a6e4a' },  // 森林绿 forest
  { gradientStart: '#7a8eaa', gradientEnd: '#5a6e8a' },  // 海洋蓝 ocean blue
  { gradientStart: '#8a5a5a', gradientEnd: '#6a3a3a' },  // 酒红 burgundy
  { gradientStart: '#6aaa9a', gradientEnd: '#4a8a7a' },  // 薄荷 mint
  { gradientStart: '#aa8a6a', gradientEnd: '#8a6a4a' },  // 焦糖 caramel
  { gradientStart: '#7a6a8e', gradientEnd: '#5a4a6e' },  // 梅子 plum
  { gradientStart: '#6a9a8a', gradientEnd: '#4a7a6a' },  // 湖绿 lake green
];

// 16 icons — one per palette color, no duplicates within 16 characters
export const CHAR_ICONS = ['🎭', '🔥', '🌊', '⚡', '🌿', '🎵', '🔮', '⭐', '💎', '📖', '🏛', '🎯', '🌸', '🦋', '🍂', '🪶'];

export const FIXED_ICONS = { moderator: '🎙️' };

// Structural roles — completely removed from characters array (no color slot, no color panel)
export const HIDDEN_ROLES = ['summary', 'you'];

/** Get style for a character by index — guarantees no color/icon collision within 16 characters */
export function getCharStyle(name, index = -1) {
  const i = index >= 0 ? index : Math.abs([...String(name)].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0));
  const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
  const icon = FIXED_ICONS[name.toLowerCase()] || CHAR_ICONS[i % CHAR_ICONS.length];
  return { ...color, textColor: 'white', icon, label: name, name };
}

export const CARD_SIZES = {
  '3:4':  { width: 1080, height: 1440, label: '3:4 小红书竖版' },
  '1:1':  { width: 1080, height: 1080, label: '1:1 朋友圈/微博' },
  '4:3':  { width: 1080, height: 810,  label: '4:3 横版' },
  '9:16': { width: 1080, height: 1920, label: '9:16 Instagram Story' },
  '16:9': { width: 1920, height: 1080, label: '16:9 公众号头图' },
};

export const DEFAULT_SLOTS = {
  badge: 'displayLabel', body: 'content',
  footerLeft: 'text:圆桌论道', footerRight: 'pageIndicator',
};

// Visual style parameters — all individually adjustable in Web UI
export const STYLE_DEFAULTS = {
  textAlign: 'left',       // left | center
  borderRadius: 40,        // 0-48px
  gradientAngle: 135,      // 0-360 degrees
  noiseOpacity: 5,         // 0-10 (percent)
  glowIntensity: 10,       // 0-20 (percent)
  lineHeight: 2.0,         // 1.6-2.4
  letterSpacing: 0.5,      // 0-3px
  gradientReverse: false,  // swap start/end
  showQuoteMark: false,    // decorative quote mark
};

// Presets = named parameter combos
export const CARD_STYLES = {
  classic:  { label: '经典',  params: {} },
  gentle:   { label: '柔和',  params: { borderRadius: 48, gradientAngle: 170, noiseOpacity: 3, lineHeight: 2.2, letterSpacing: 1 } },
  texture:  { label: '纸质',  params: { borderRadius: 24, gradientAngle: 180, noiseOpacity: 9, glowIntensity: 0 } },
  quote:    { label: '引用',  params: { textAlign: 'center', gradientAngle: 160, noiseOpacity: 3, glowIntensity: 5, lineHeight: 2.3, showQuoteMark: true } },
  magazine: { label: '杂志',  params: { borderRadius: 12, gradientAngle: 180, noiseOpacity: 2, glowIntensity: 0, gradientReverse: true, lineHeight: 1.9 } },
  elegant:  { label: '典雅',  params: { borderRadius: 32, gradientAngle: 145, noiseOpacity: 4, glowIntensity: 15, lineHeight: 2.1, letterSpacing: 1.5 } },
};

export const PRESETS = {
  roundtable: { label: '圆桌讨论', slots: { ...DEFAULT_SLOTS }, coverTitle: '圆桌论道', cardStyle: 'classic' },
  quote:      { label: '语录卡片', slots: { badge: 'name', body: 'content', footerLeft: 'text:—', footerRight: 'characterId' }, coverTitle: '语录', cardStyle: 'quote' },
  note:       { label: '笔记卡片', slots: { badge: 'label', body: 'content', footerLeft: 'pageIndicator', footerRight: 'text:' }, coverTitle: '笔记', cardStyle: 'gentle' },
  news:       { label: '新闻摘要', slots: { badge: 'displayLabel', body: 'content', footerLeft: 'text:摘要', footerRight: 'pageIndicator' }, coverTitle: '新闻摘要', cardStyle: 'magazine' },
};

const DEFAULT_CONFIG = {
  bodyFont: "'Noto Serif SC'", labelFont: "'Noto Sans SC'",
  fontSize: 28, cardSize: '3:4', coverTitle: 'Legend Talk',
  colorOverrides: {}, slots: { ...DEFAULT_SLOTS },
  cardStyle: 'classic', styleParams: { ...STYLE_DEFAULTS },
  watermark: '', coverExcludeRoles: ['Moderator'],
};

// ── Helpers ──

export function getColorConfig(msg, colorOverrides = {}, charIndex = -1) {
  const charId = msg.characterId;
  const base = msg.role === 'user'
    ? { ...USER_STYLE, label: 'You', name: 'You' }
    : getCharStyle(charId, charIndex);
  const key = msg.role === 'user' ? '_user' : charId;
  const merged = colorOverrides[key] ? { ...base, ...colorOverrides[key] } : base;
  return { ...merged, displayLabel: `${merged.icon} ${merged.label}` };
}

/** Escape HTML to prevent XSS in Puppeteer rendering */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function contentToHtml(text) {
  return removeMarkdown(text).split(/\n{1,}/).filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
}

function generateDotsHtml(current, total) {
  if (total > 15) return '';
  return Array.from({ length: total }, (_, i) =>
    `<span class="${i + 1 === current ? 'dot active' : 'dot'}"></span>`
  ).join('\n');
}

export function resolveSlot(source, card, rawMsg = {}) {
  if (!source) return '';
  if (source.startsWith('text:')) return escapeHtml(source.slice(5));
  if (source.startsWith('raw:')) { const k = source.slice(4); return rawMsg[k] != null ? escapeHtml(String(rawMsg[k])) : ''; }
  const map = {
    displayLabel: card.displayLabel || card.label || '',
    content: card.content || '', icon: card.icon || '',
    label: card.label || '', name: card.name || '',
    characterId: rawMsg.characterId || '',
    pageIndicator: `${card.index} / ${card.total}`,
  };
  const val = map[source] ?? (rawMsg[source] != null ? String(rawMsg[source]) : '');
  return source === 'pageIndicator' ? val : escapeHtml(val);
}

// ── Template ──

function buildCardCSS(card, config) {
  const p = { ...STYLE_DEFAULTS, ...config.styleParams };
  const gradStart = p.gradientReverse ? card.gradientEnd : card.gradientStart;
  const gradEnd = p.gradientReverse ? card.gradientStart : card.gradientEnd;
  const centered = p.textAlign === 'center';
  return `
    .card { background: linear-gradient(${p.gradientAngle}deg, ${gradStart}, ${gradEnd}); border-radius: ${p.borderRadius}px; }
    .noise { opacity: ${p.noiseOpacity / 100}; }
    .glow-tr { background: radial-gradient(circle, rgba(255,255,255,${p.glowIntensity / 100}) 0%, transparent 70%); }
    .glow-bl { background: radial-gradient(circle, rgba(255,255,255,${p.glowIntensity / 200}) 0%, transparent 70%); }
    ${centered ? '.pill { align-self: center; }' : ''}
    .content p { text-align: ${p.textAlign}; line-height: ${p.lineHeight}; letter-spacing: ${p.letterSpacing}px; }
    ${centered ? '.footer { justify-content: center; gap: 24px; }' : ''}
    ${p.showQuoteMark ? `.deco { display: block; position: absolute; top: 45px; left: 72px; font-size: 140px; opacity: 0.06; color: ${card.textColor}; line-height: 1; } .deco::before { content: "\\201C"; }` : ''}
  `;
}

function buildCardData(card, config, rawMsg = {}) {
  const slots = config.slots || DEFAULT_SLOTS;
  return {
    styleCSS: buildCardCSS(card, config),
    textColor: card.textColor,
    badge: resolveSlot(slots.badge, card, rawMsg),
    bodyHtml: card._isHtml ? card.content : contentToHtml(resolveSlot(slots.body, card, rawMsg)),
    footerLeft: resolveSlot(slots.footerLeft, card, rawMsg),
    dotsHtml: slots.footerRight === 'pageIndicator' ? generateDotsHtml(card.index, card.total) : '',
    pageIndicator: resolveSlot(slots.footerRight, card, rawMsg),
    watermark: escapeHtml(config.watermark || ''),
  };
}

function buildHtml(template, card, config, fontFaceCSS, rawMsg = {}) {
  const size = CARD_SIZES[config.cardSize] || CARD_SIZES['3:4'];
  const d = buildCardData(card, config, rawMsg);

  return template
    .replace('{{FONT_FACE_CSS}}', fontFaceCSS)
    .replace('{{STYLE_CSS}}', d.styleCSS)
    .replaceAll('{{CARD_WIDTH}}', String(size.width))
    .replaceAll('{{CARD_HEIGHT}}', String(size.height))
    .replaceAll('{{TEXT_COLOR}}', d.textColor)
    .replaceAll('{{BODY_FONT}}', config.bodyFont)
    .replaceAll('{{LABEL_FONT}}', config.labelFont)
    .replace('{{FONT_SIZE}}', String(config.fontSize))
    .replace('{{PILL_LABEL}}', d.badge)
    .replace('{{CONTENT_HTML}}', d.bodyHtml)
    .replace('{{FOOTER_LEFT}}', d.footerLeft)
    .replace('{{DOTS_HTML}}', d.dotsHtml)
    .replace('{{PAGE_INDICATOR}}', d.pageIndicator)
    .replace('{{WATERMARK}}', d.watermark);
}

function buildCoverCard(data, config) {
  const userMsg = data.messages.find(m => m.role === 'user');
  const paras = userMsg ? userMsg.content.split(/\n+/).filter(l => l.trim()) : [];
  const summary = paras.filter(p => p.length >= 10).sort((a, b) => a.length - b.length)[0] || paras[0] || '';
  const excludeSet = new Set((config.coverExcludeRoles || []).map(r => r.toLowerCase()));
  const names = (data.characters || [])
    .filter(id => !excludeSet.has(id.toLowerCase()))
    .map(id => config.colorOverrides[id]?.name || id)
    .join('  ·  ');

  return {
    gradientStart: '#0c0c0c', gradientEnd: '#1a1a1a', textColor: '#f0e6d2',
    label: config.coverTitle, name: '封面', suffix: '', _isHtml: true,
    content: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;">
  <p style="font-size:28px;line-height:2.2;opacity:0.8;letter-spacing:1px;margin:0;">${escapeHtml(summary)}</p>
  <div style="width:40px;height:1px;background:currentColor;opacity:0.2;margin:48px 0;"></div>
  <p style="font-size:22px;opacity:0.4;letter-spacing:4px;margin:0;">${escapeHtml(names)}</p>
</div>`,
  };
}

// ── Overflow splitting (Puppeteer) ──

async function splitByRendering(page, colorConfig, content, config) {
  // Pre-process in Node: strip markdown + escape + wrap — once per paragraph
  const paragraphs = content.split(/\n{1,}/).filter(p => p.trim());
  const paraHtml = paragraphs.map(p => {
    const clean = removeMarkdown(p).trim();
    return clean ? `<p>${escapeHtml(clean)}</p>` : '';
  });
  // Pre-compute sentence HTML for oversized paragraphs
  const sentData = paragraphs.map(p => {
    const sents = p.split(/(?<=[。！？])/);
    return sents.length > 1 ? sents.map(s => `<p>${escapeHtml(removeMarkdown(s))}</p>`) : null;
  });

  // Set up card state + run ALL splitting in ONE evaluate call (no IPC per step)
  const card = { ...colorConfig, content: '', _isHtml: false, index: 1, total: 1 };
  const d = buildCardData(card, config, colorConfig._rawMsg || {});
  const ranges = await page.evaluate((u, ph, sd) => {
    // Sync full card state
    document.getElementById('card-css').textContent = u.styleCSS;
    const tc = u.textColor;
    const pill = document.querySelector('.pill');
    pill.textContent = u.badge;
    pill.style.color = tc;
    document.querySelector('.footer-title').textContent = u.footerLeft;
    document.querySelector('.footer-title').style.color = tc;
    const fr = document.querySelector('.footer-right');
    fr.innerHTML = u.dotsHtml + `<span class="page-num">${u.pageIndicator}</span>`;
    fr.querySelector('.page-num').style.color = tc;
    fr.querySelectorAll('.dot').forEach(d => { d.style.background = tc; });
    document.querySelector('.watermark').textContent = u.watermark;
    document.querySelector('.watermark').style.color = tc;

    const el = document.querySelector('.content');
    function fits(html) { el.innerHTML = html; return el.scrollHeight <= el.clientHeight; }

    // All content fits → no split
    if (fits(ph.join('\n'))) return null;

    const pages = [];
    let start = 0;
    while (start < ph.length) {
      // Single paragraph too large → sentence-level split
      if (!fits(ph[start])) {
        const sh = sd[start];
        if (sh && sh.length > 1) {
          let sStart = 0;
          while (sStart < sh.length) {
            let lo = sStart + 1, hi = sh.length, best = sStart + 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (fits(sh.slice(sStart, mid).join(''))) { best = mid; lo = mid + 1; }
              else hi = mid - 1;
            }
            pages.push({ t: 's', i: start, s: sStart, e: best });
            sStart = best;
          }
        } else {
          pages.push({ t: 'p', s: start, e: start + 1 });
        }
        start++;
        continue;
      }
      // Binary search for max paragraphs
      let lo = start + 1, hi = ph.length, best = start + 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (fits(ph.slice(start, mid).join('\n'))) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      pages.push({ t: 'p', s: start, e: best });
      start = best;
    }
    return pages;
  }, d, paraHtml, sentData);

  if (!ranges) return [content];

  // Reconstruct pages from ranges using original (raw) paragraphs
  return ranges.map(r => {
    if (r.t === 's') {
      const sents = paragraphs[r.i].split(/(?<=[。！？])/);
      return sents.slice(r.s, r.e).join('');
    }
    return paragraphs.slice(r.s, r.e).join('\n\n');
  });
}

// ── Render pipeline ──

let _templateCache = null, _templatePath = null;
let _fontCSSCache = null, _fontCacheKey = null;
let _allFonts = null, _allFontsDir = null;
// Page pool: reuse page with fonts already loaded (skip ~1s font load on 2nd+ render)
let _warmPage = null, _warmPageKey = null, _warmPageBrowser = null;

/** Normalize messages: convert array format [speaker, text] to {role, content, characterId} */
function normalizeMessages(data) {
  if (!data?.messages?.length) return data;
  const first = data.messages[0];
  if (!Array.isArray(first)) return data; // already object format
  const userRole = 'You';
  const messages = data.messages.map(m => {
    const speaker = String(m[0] || '');
    const content = String(m[1] || '');
    return {
      role: speaker === userRole ? 'user' : 'character',
      content,
      characterId: speaker === userRole ? undefined : speaker,
    };
  });
  const hiddenSet = new Set(HIDDEN_ROLES);
  const characters = [...new Set(messages.filter(m => m.role === 'character').map(m => m.characterId))]
    .filter(id => id && !hiddenSet.has(id.toLowerCase()));
  return { ...data, messages, characters };
}

export async function renderCardsFromData(data, config = {}, templatePath, fontsDir, browser = null) {
  data = normalizeMessages(data);
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Cached I/O
  if (_templatePath !== templatePath) { _templateCache = await fs.readFile(templatePath, 'utf-8'); _templatePath = templatePath; }
  if (_allFontsDir !== fontsDir) { _allFonts = await scanFonts(fontsDir); _allFontsDir = fontsDir; _fontCSSCache = null; _fontCacheKey = null; }
  // Font CSS: file:// URLs (tiny CSS, fonts loaded by Chromium from disk)
  const bodyName = cfg.bodyFont.replace(/'/g, '');
  const labelName = cfg.labelFont.replace(/'/g, '');
  const usedNames = [...new Set([bodyName, labelName])];
  const cacheKey = usedNames.sort().join(',');
  if (_fontCacheKey !== cacheKey) { _fontCSSCache = generateFontFaceCSS(_allFonts, fontsDir, false, usedNames); _fontCacheKey = cacheKey; }
  const template = _templateCache, fontCSS = _fontCSSCache;
  const size = CARD_SIZES[cfg.cardSize] || CARD_SIZES['3:4'];

  const ownBrowser = !browser;
  if (!browser) browser = await puppeteer.launch({ args: ['--allow-file-access-from-files'] });
  try {
    const initCard = { gradientStart: '#0c0c0c', gradientEnd: '#1a1a1a', textColor: '#f0e6d2', content: '', _isHtml: true, index: 1, total: 1 };
    const initHtml = buildHtml(template, initCard, cfg, fontCSS);
    const pageKey = `${size.width}x${size.height}:${cacheKey}`;

    // Reuse warm page if available (fonts already loaded), otherwise create new
    let page;
    if (_warmPage && _warmPageKey === pageKey && _warmPageBrowser === browser) {
      try { await _warmPage.evaluate(() => true); page = _warmPage; } catch { _warmPage = null; }
    }
    if (!page) {
      page = await browser.newPage();
      await page.setViewport({ width: size.width, height: size.height });
      const tmpFile = path.join(os.tmpdir(), `json2card-${process.pid}-${Date.now()}.html`);
      await fs.writeFile(tmpFile, initHtml);
      await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      await fs.unlink(tmpFile).catch(() => {});
    }
    _warmPage = page; _warmPageKey = pageKey; _warmPageBrowser = browser;

    // Phase 1: Build card list + split long messages
    const coverCard = buildCoverCard(data, cfg);
    const baseCards = buildCardList(data.messages, data.characters,
      (msg, ci) => getColorConfig(msg, cfg.colorOverrides, ci), USER_STYLE);

    const messageCards = [];
    for (const card of baseCards) {
      const splitPages = await splitByRendering(page, card, card.content, cfg);
      for (let i = 0; i < splitPages.length; i++) {
        const dl = card.displayLabel;
        const label = splitPages.length === 1 ? dl : (dl ? `${dl} (${i + 1}/${splitPages.length})` : `(${i + 1}/${splitPages.length})`);
        messageCards.push({
          ...card, label, displayLabel: dl, content: splitPages[i],
          suffix: splitPages.length === 1 ? '' : `-${i + 1}`,
        });
      }
    }

    const cards = [coverCard, ...messageCards];
    cards.forEach((c, i) => { c.index = i + 1; c.total = cards.length; });

    // Phase 2: Render to PNG — all cards via DOM update (fonts already loaded)
    const results = [];
    for (const card of cards) {
      const d = buildCardData(card, cfg, card._rawMsg || {});
      await page.evaluate((u) => {
        document.getElementById('card-css').textContent = u.styleCSS;
        const tc = u.textColor;
        document.querySelector('.pill').textContent = u.badge;
        document.querySelector('.pill').style.color = tc;
        document.querySelector('.content').innerHTML = u.bodyHtml;
        document.querySelectorAll('.content p').forEach(p => { p.style.color = tc; });
        document.querySelector('.footer-title').textContent = u.footerLeft;
        document.querySelector('.footer-title').style.color = tc;
        const fr = document.querySelector('.footer-right');
        fr.innerHTML = u.dotsHtml + `<span class="page-num">${u.pageIndicator}</span>`;
        fr.querySelector('.page-num').style.color = tc;
        fr.querySelectorAll('.dot').forEach(d => { d.style.background = tc; });
        document.querySelector('.watermark').textContent = u.watermark;
        document.querySelector('.watermark').style.color = tc;
      }, d);
      const buffer = await page.screenshot({ omitBackground: true, encoding: 'binary' });
      results.push({ filename: `card-${String(card.index).padStart(2, '0')}-${card.name}${card.suffix}.png`, buffer: Buffer.from(buffer) });
    }

    // Don't close page — keep warm for next render
    return results;
  } finally {
    if (ownBrowser) await browser.close();
  }
}

// ── CLI ──

const __filename = fileURLToPath(import.meta.url);

async function main() {
  const args = process.argv.slice(2);
  let inputPath = 'test.json';
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--body-font' && args[i + 1]) config.bodyFont = `'${args[++i]}'`;
    else if (args[i] === '--label-font' && args[i + 1]) config.labelFont = `'${args[++i]}'`;
    else if (args[i] === '--size' && args[i + 1]) config.cardSize = args[++i];
    else if (!args[i].startsWith('--')) inputPath = args[i];
  }

  const dir = path.dirname(__filename);
  console.log(`Reading ${inputPath}...`);
  const data = JSON.parse(await fs.readFile(inputPath, 'utf-8'));

  console.log('Rendering cards...');
  const results = await renderCardsFromData(data, config, path.join(dir, 'template.html'), path.join(dir, 'fonts'));

  await fs.mkdir('output', { recursive: true });
  for (const { filename, buffer } of results) {
    await fs.writeFile(path.join('output', filename), buffer);
    console.log(`✓ ${filename}`);
  }
  console.log(`\nDone! ${results.length} cards saved to output/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(err => { console.error(err); process.exit(1); });
}
