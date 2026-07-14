const $ = (sel) => document.querySelector(sel);

// State
let currentData = null;
const STYLE_DEFAULTS = {
  textAlign: 'left', borderRadius: 40, gradientAngle: 135,
  noiseOpacity: 5, glowIntensity: 10, lineHeight: 2.0,
  letterSpacing: 0.5, gradientReverse: false, showQuoteMark: false,
};

let currentConfig = {
  bodyFont: "'Noto Serif SC'",
  labelFont: "'Noto Sans SC'",
  fontSize: 28,
  cardSize: '3:4',
  coverTitle: '',  // set after i18n loads
  colorOverrides: {},
  slots: {
    badge: 'displayLabel',
    body: 'content',
    footerLeft: 'text:',  // set after i18n loads
    footerRight: 'pageIndicator',
  },
  cardStyle: 'classic',
  styleParams: { ...STYLE_DEFAULTS },
  watermark: '',
  coverExcludeRoles: ['Moderator'],
  brandBg: '',    // brand theme: solid background for every card (empty = per-speaker colors)
  brandText: '',  // brand theme: text color
  customFonts: [], // [{name, dataUrl}] uploaded in the browser
};
let availableFonts = [];
let rawJson = null; // unparsed original JSON (before normalization)

// JSON field mapping — defines how to extract data from any JSON format
let jsonMapping = {
  messages: 'messages',
  content: 'content',
  role: 'role',
  userRole: 'user',
  characterId: 'characterId',
  characters: 'characters',
};

// Derive aspect ratio from size key: "3:4" → "3 / 4"
function getAspect(sizeKey) { return sizeKey.replace(':', ' / '); }

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof removeMarkdown === 'undefined') {
  window.removeMarkdown = function(s) { return s; };
}

// Style constants — loaded from server, with inline fallbacks
let USER_STYLE = { gradientStart: '#0c0c0c', gradientEnd: '#1a1a1a', textColor: '#f0e6d2', icon: '📜' };
let COLOR_PALETTE = [
  { gradientStart: '#c4836e', gradientEnd: '#a0604a' },
  { gradientStart: '#7b9e89', gradientEnd: '#5a7e69' },
  { gradientStart: '#8b7db8', gradientEnd: '#6a5d98' },
  { gradientStart: '#c98a7a', gradientEnd: '#b0705e' },
  { gradientStart: '#5d8a9e', gradientEnd: '#3d6a7e' },
  { gradientStart: '#b87a85', gradientEnd: '#985a65' },
  { gradientStart: '#5a8e8e', gradientEnd: '#3a6e6e' },
  { gradientStart: '#9a7e5a', gradientEnd: '#7a5e3a' },
  { gradientStart: '#8e6a7a', gradientEnd: '#6e4a5a' },
  { gradientStart: '#6a8e6a', gradientEnd: '#4a6e4a' },
  { gradientStart: '#7a8eaa', gradientEnd: '#5a6e8a' },
  { gradientStart: '#8a5a5a', gradientEnd: '#6a3a3a' },
  { gradientStart: '#6aaa9a', gradientEnd: '#4a8a7a' },
  { gradientStart: '#aa8a6a', gradientEnd: '#8a6a4a' },
  { gradientStart: '#7a6a8e', gradientEnd: '#5a4a6e' },
  { gradientStart: '#6a9a8a', gradientEnd: '#4a7a6a' },
];
let CHAR_ICONS = ['🎭', '🔥', '🌊', '⚡', '🌿', '🎵', '🔮', '⭐', '💎', '📖', '🏛', '🎯', '🌸', '🦋', '🍂', '🪶'];
let FIXED_ICONS = { moderator: '🎙️' };
let HIDDEN_ROLES = ['summary', 'you'];

/** Get style by index — guarantees no collision within 16 characters */
function getCharStyle(name, index) {
  const i = index >= 0 ? index : Math.abs([...String(name)].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0));
  const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
  const icon = FIXED_ICONS[name.toLowerCase()] || CHAR_ICONS[i % CHAR_ICONS.length];
  return { ...color, textColor: 'white', icon, label: name, name };
}

// Font pairings — body + label combinations
// Font pairings — names must match scanFonts displayName exactly
let FONT_PAIRINGS = {
  classic:  { body: 'Noto Serif SC', label: 'Noto Sans SC', i18n: 'pairClassic' },
  modern:   { body: 'Harmony OS Sans SC', label: 'Harmony OS Sans SC', i18n: 'pairModern' },
  literary: { body: 'LXGW Wen Kai', label: 'Noto Sans SC', i18n: 'pairLiterary' },
  business: { body: 'Alibaba Pu Hui Ti', label: 'Alibaba Pu Hui Ti', i18n: 'pairBusiness' },
};

// Slot ID → config key mapping (used in populate, bind, restore)
const SLOT_MAP = [['slotBadge', 'badge'], ['slotBody', 'body'], ['slotFooterLeft', 'footerLeft'], ['slotFooterRight', 'footerRight']];

// ── Init ──

async function init() {
  applyI18n();
  await loadServerConfig();
  await loadFonts();
  syncStyleParamsToUI();
  loadCustomPresets();
  populateSlotDropdowns();
  bindSlotEvents();
  loadHistory();
  bindEvents();
}

/** Apply translations to all data-i18n elements + dynamic dropdowns */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.title = t('title');
  $('#langToggle').textContent = currentLang === 'zh' ? 'EN' : '中文';

  // Set language-aware defaults (only if not already customized by user)
  if (!currentConfig.coverTitle) {
    currentConfig.coverTitle = t('defaultCoverTitle');
    $('#coverTitle').value = currentConfig.coverTitle;
  }
  $('#coverExcludeRoles').value = (currentConfig.coverExcludeRoles || []).join(', ');
  if (currentConfig.slots.footerLeft === 'text:') {
    currentConfig.slots.footerLeft = 'text:' + t('defaultFooterLeft');
  }

  // Re-populate style dropdown with translated labels
  const styleMap = { classic: 'styleClassic', gentle: 'styleGentle', texture: 'styleTexture', quote: 'styleQuote', magazine: 'styleMagazine', elegant: 'styleElegant' };
  const sSel = $('#cardStyleSelect');
  if (sSel.options.length) {
    for (const opt of sSel.options) {
      if (styleMap[opt.value]) opt.textContent = t(styleMap[opt.value]);
    }
  }
  renderStyleGallery();
  buildCharacterColorPanel();  // re-translate speaker-color field tooltips + header

  // Re-populate preset dropdown
  const presetMap = { roundtable: 'presetRoundtable', quote: 'presetQuote', note: 'presetNote', news: 'presetNews' };
  const pSel = $('#presetSelect');
  if (pSel.options.length) {
    for (const opt of pSel.options) {
      if (opt.value === '') opt.textContent = t('custom');
      else if (presetMap[opt.value]) opt.textContent = t(presetMap[opt.value]);
    }
  }

  // Re-populate card size dropdown
  const sizeI18n = { '3:4': 'size34', '1:1': 'size11', '4:3': 'size43', '9:16': 'size916', '16:9': 'size169' };
  const cSel = $('#cardSize');
  if (cSel.options.length) {
    for (const opt of cSel.options) {
      if (sizeI18n[opt.value]) opt.textContent = t(sizeI18n[opt.value]);
    }
  }

  // Re-populate format dropdown
  const fSel = $('#formatSelect');
  if (fSel.options.length) {
    for (const opt of fSel.options) {
      if (opt.value === '') opt.textContent = t('fmtAutoDetect');
      else {
        const tmpl = FORMAT_TEMPLATES.find(f => f.id === opt.value);
        if (tmpl) opt.textContent = t(tmpl.i18nLabel);
      }
    }
  }

  // Re-populate font pairing dropdown
  const fpSel = $('#fontPairing');
  if (fpSel.options.length) {
    for (const opt of fpSel.options) {
      if (FONT_PAIRINGS[opt.value]) opt.textContent = t(FONT_PAIRINGS[opt.value].i18n);
      else if (opt.value === 'custom') opt.textContent = t('pairCustom');
    }
  }

  // Re-populate slot dropdowns (Card Layout: badge, body, footer options)
  populateSlotDropdowns();

  // Re-translate format hint if visible
  if (detectedFormat) {
    $('#formatHint').textContent = t('formatDetected', { label: t(detectedFormat.i18nLabel), hint: t(detectedFormat.i18nHint) });
  }
}

let PRESETS = {};
let CARD_STYLES = {
  classic: { i18n: 'styleClassic' }, gentle: { i18n: 'styleGentle' }, texture: { i18n: 'styleTexture' },
  quote: { i18n: 'styleQuote' }, magazine: { i18n: 'styleMagazine' }, elegant: { i18n: 'styleElegant' },
};

async function loadServerConfig() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (cfg.userStyle) USER_STYLE = cfg.userStyle;
    if (cfg.colorPalette) COLOR_PALETTE = cfg.colorPalette;
    if (cfg.icons) CHAR_ICONS = cfg.icons;
    if (cfg.fixedIcons) FIXED_ICONS = cfg.fixedIcons;
    if (cfg.hiddenRoles) { HIDDEN_ROLES = cfg.hiddenRoles; _hiddenSet = new Set(HIDDEN_ROLES.map(r => r.toLowerCase())); }
    if (cfg.cardStyles) CARD_STYLES = cfg.cardStyles;
    if (cfg.presets) PRESETS = cfg.presets;

    // Populate presets (labels translated via applyI18n)
    const presetI18n = { roundtable: 'presetRoundtable', quote: 'presetQuote', note: 'presetNote', news: 'presetNews' };
    const pSel = $('#presetSelect');
    pSel.innerHTML = `<option value="">${t('custom')}</option>` +
      Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${t(presetI18n[k] || k)}</option>`).join('');
    pSel.value = 'roundtable';

    // Populate card styles (labels translated via applyI18n)
    const styleI18n = { classic: 'styleClassic', gentle: 'styleGentle', texture: 'styleTexture', quote: 'styleQuote', magazine: 'styleMagazine', elegant: 'styleElegant' };
    const sSel = $('#cardStyleSelect');
    sSel.innerHTML = Object.entries(CARD_STYLES).map(([k, v]) =>
      `<option value="${k}" ${k === 'classic' ? 'selected' : ''}>${t(styleI18n[k] || k)}</option>`
    ).join('');
    renderStyleGallery();  // now that CARD_STYLES has params, render distinct swatches

    // Populate card sizes (labels translated via applyI18n)
    const sizeI18n = { '3:4': 'size34', '1:1': 'size11', '4:3': 'size43', '9:16': 'size916', '16:9': 'size169' };
    if (cfg.cardSizes) {
      const cSel = $('#cardSize');
      cSel.innerHTML = Object.entries(cfg.cardSizes).map(([k]) =>
        `<option value="${k}" ${k === '3:4' ? 'selected' : ''}>${t(sizeI18n[k] || k)}</option>`
      ).join('');
    }
  } catch (e) { console.warn('Failed to load /api/config, using inline fallbacks:', e.message); }
}

function syncStyleParamsToUI() {
  const p = currentConfig.styleParams;
  $('#spTextAlign').value = p.textAlign;
  $('#spBorderRadius').value = p.borderRadius;
  $('#spGradientAngle').value = p.gradientAngle;
  $('#spNoiseOpacity').value = p.noiseOpacity;
  $('#spGlowIntensity').value = p.glowIntensity;
  $('#spLineHeight').value = Math.round(p.lineHeight * 10);
  $('#spQuoteMark').value = String(p.showQuoteMark);
  syncStyleParamLabels();
}

function syncStyleParamLabels() {
  const p = currentConfig.styleParams;
  $('#spBorderRadiusVal').textContent = p.borderRadius;
  $('#spGradientAngleVal').textContent = p.gradientAngle + '°';
  $('#spNoiseOpacityVal').textContent = p.noiseOpacity + '%';
  $('#spGlowIntensityVal').textContent = p.glowIntensity + '%';
  $('#spLineHeightVal').textContent = p.lineHeight.toFixed(1);
}

function loadCustomPresets() {
  const customs = JSON.parse(localStorage.getItem('customPresets') || '{}');
  const sel = $('#cardStyleSelect');
  // Remove old custom options
  sel.querySelectorAll('[data-custom]').forEach(o => o.remove());
  for (const [name, params] of Object.entries(customs)) {
    const opt = document.createElement('option');
    opt.value = `custom:${name}`;
    opt.textContent = `⭐ ${name}`;
    opt.dataset.custom = 'true';
    sel.appendChild(opt);
  }
}

async function loadFonts() {
  try {
    const res = await fetch('/api/fonts');
    const { fonts, defaults } = await res.json();
    availableFonts = fonts;
    populateFontSelect('#bodyFont', fonts, defaults.body);
    populateFontSelect('#labelFont', fonts, defaults.label);
    // Load @font-face CSS so preview renders actual fonts
    let fontCSS = '';
    const fmtMap = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };
    for (const f of fonts) {
      const ext = '.' + f.file.split('.').pop().toLowerCase();
      fontCSS += `@font-face { font-family: '${f.displayName}'; src: url('/fonts/${f.file}') format('${fmtMap[ext] || 'truetype'}'); font-weight: 400; }\n`;
    }
    const styleEl = document.getElementById('fontFaces') || document.createElement('style');
    styleEl.id = 'fontFaces';
    styleEl.textContent = fontCSS;
    if (!styleEl.parentNode) document.head.appendChild(styleEl);
    // Populate font pairing dropdown
    const fpSel = $('#fontPairing');
    fpSel.innerHTML = Object.entries(FONT_PAIRINGS).map(([k, v]) =>
      `<option value="${k}" ${k === 'classic' ? 'selected' : ''}>${t(v.i18n)}</option>`
    ).join('') + `<option value="custom">${t('pairCustom')}</option>`;
  } catch {
    for (const sel of ['#bodyFont', '#labelFont']) {
      const el = $(sel);
      el.innerHTML = `<option>${t('sysDefault')}</option>`;
    }
  }
}

function populateFontSelect(selector, fonts, defaultName) {
  const el = $(selector);
  el.innerHTML = fonts.map(f =>
    `<option value="${f.displayName}" ${f.displayName === defaultName ? 'selected' : ''}>${f.displayName}</option>`
  ).join('');
  if (!fonts.length) el.innerHTML = `<option>${t('sysDefault')}</option>`;
}

// ── Custom font upload (embedded as data-URI, works in preview + export) ──
function injectCustomFontFaces() {
  let el = document.getElementById('customFontFaces');
  if (!el) { el = document.createElement('style'); el.id = 'customFontFaces'; document.head.appendChild(el); }
  el.textContent = (currentConfig.customFonts || [])
    .map(f => `@font-face{font-family:'${f.name}';src:url('${f.dataUrl}');font-display:block;}`).join('\n');
}

function addFontOption(name) {
  for (const sel of ['#bodyFont', '#labelFont']) {
    const el = $(sel);
    if (![...el.options].some(o => o.value === name)) el.add(new Option(name + ' ⬆', name));
  }
}

function restoreCustomFonts() {
  injectCustomFontFaces();
  (currentConfig.customFonts || []).forEach(f => addFontOption(f.name));
}

function handleFontUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';  // allow re-selecting the same file later
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { alert(t('fontTooLarge')); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const name = (file.name.replace(/\.[^.]+$/, '').trim() || 'Custom').slice(0, 40);
    currentConfig.customFonts = (currentConfig.customFonts || []).filter(f => f.name !== name);
    currentConfig.customFonts.push({ name, dataUrl: reader.result });
    injectCustomFontFaces();
    addFontOption(name);
    $('#bodyFont').value = name;
    currentConfig.bodyFont = `'${name}'`;
    $('#fontPairing').value = 'custom';
    updatePreview();
  };
  reader.readAsDataURL(file);
}

// ── Events ──

function bindEvents() {
  // Language toggle
  $('#langToggle').addEventListener('click', () => {
    setLang(currentLang === 'zh' ? 'en' : 'zh');
    applyI18n();
    if (currentData) updatePreview();
  });

  // Clear history
  $('#clearHistory').addEventListener('click', () => { localStorage.removeItem('cardHistory'); loadHistory(); });

  // Theme toggle
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  $('#themeToggle').addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? '' : 'light');
    localStorage.setItem('theme', isLight ? 'dark' : 'light');
  });

  $('#fileInput').addEventListener('change', handleFileUpload);
  $('#loadExample').addEventListener('click', loadExample);
  $('#jsonInput').addEventListener('input', debounce(handleJsonChange, 500));
  $('#presetSelect').addEventListener('change', () => {
    const key = $('#presetSelect').value;
    if (key && PRESETS[key]) {
      const slots = { ...PRESETS[key].slots };
      // Translate preset footer text
      if (slots.footerLeft === 'text:圆桌论道') slots.footerLeft = 'text:' + t('defaultFooterLeft');
      if (slots.footerLeft === 'text:摘要') slots.footerLeft = 'text:' + t('footerSummary');
      currentConfig.slots = slots;
      const coverI18n = { roundtable: 'defaultCoverTitle', quote: 'coverQuote', note: 'coverNote', news: 'coverNews' };
      currentConfig.coverTitle = t(coverI18n[key] || 'defaultCoverTitle');
      $('#coverTitle').value = currentConfig.coverTitle;
      if (PRESETS[key].cardStyle) {
        currentConfig.cardStyle = PRESETS[key].cardStyle;
        $('#cardStyleSelect').value = currentConfig.cardStyle;
        setActiveStyleChip(currentConfig.cardStyle);
        const style = CARD_STYLES[currentConfig.cardStyle];
        if (style?.params) {
          currentConfig.styleParams = { ...STYLE_DEFAULTS, ...style.params };
          syncStyleParamsToUI();
        }
      }
      populateSlotDropdowns();
      updatePreview();
    }
  });
  $('#coverTitle').addEventListener('input', () => { currentConfig.coverTitle = $('#coverTitle').value; updatePreview(); });
  $('#coverExcludeRoles').addEventListener('input', () => {
    currentConfig.coverExcludeRoles = $('#coverExcludeRoles').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    updatePreview();
  });
  $('#watermark').addEventListener('input', () => { currentConfig.watermark = $('#watermark').value; updatePreview(); });
  setupBrandTheme();
  $('#fontUploadBtn').addEventListener('click', () => $('#fontUpload').click());
  $('#fontUpload').addEventListener('change', handleFontUpload);
  // Font pairing
  $('#fontPairing').addEventListener('change', () => {
    const pair = FONT_PAIRINGS[$('#fontPairing').value];
    if (pair) {
      currentConfig.bodyFont = `'${pair.body}'`;
      currentConfig.labelFont = `'${pair.label}'`;
      $('#bodyFont').value = pair.body;
      $('#labelFont').value = pair.label;
      updatePreview();
    }
  });
  $('#bodyFont').addEventListener('change', () => { currentConfig.bodyFont = `'${$('#bodyFont').value}'`; $('#fontPairing').value = 'custom'; updatePreview(); });
  $('#labelFont').addEventListener('change', () => { currentConfig.labelFont = `'${$('#labelFont').value}'`; $('#fontPairing').value = 'custom'; updatePreview(); });
  $('#fontSize').addEventListener('input', () => {
    currentConfig.fontSize = +$('#fontSize').value;
    $('#fontSizeValue').textContent = `${currentConfig.fontSize}px`;
    updatePreview();
  });
  $('#cardSize').addEventListener('change', () => { currentConfig.cardSize = $('#cardSize').value; updatePreview(); });
  $('#cardStyleSelect').addEventListener('change', () => {
    const val = $('#cardStyleSelect').value;
    currentConfig.cardStyle = val;
    setActiveStyleChip(val);
    if (val.startsWith('custom:')) {
      const customs = JSON.parse(localStorage.getItem('customPresets') || '{}');
      const params = customs[val.slice(7)];
      if (params) { currentConfig.styleParams = { ...STYLE_DEFAULTS, ...params }; syncStyleParamsToUI(); }
    } else {
      const style = CARD_STYLES[val];
      if (style?.params) { currentConfig.styleParams = { ...STYLE_DEFAULTS, ...style.params }; syncStyleParamsToUI(); }
    }
    updatePreview();
  });

  // Style parameter controls
  const paramBindings = [
    ['spTextAlign', 'textAlign', 'value'],
    ['spBorderRadius', 'borderRadius', 'int'],
    ['spGradientAngle', 'gradientAngle', 'int'],
    ['spNoiseOpacity', 'noiseOpacity', 'int'],
    ['spGlowIntensity', 'glowIntensity', 'int'],
    ['spLineHeight', 'lineHeight', 'div10'],
    ['spQuoteMark', 'showQuoteMark', 'bool'],
  ];
  for (const [id, key, type] of paramBindings) {
    $(`#${id}`).addEventListener(type === 'value' || type === 'bool' ? 'change' : 'input', () => {
      const el = $(`#${id}`);
      if (type === 'int') currentConfig.styleParams[key] = +el.value;
      else if (type === 'div10') currentConfig.styleParams[key] = +el.value / 10;
      else if (type === 'bool') currentConfig.styleParams[key] = el.value === 'true';
      else currentConfig.styleParams[key] = el.value;
      syncStyleParamLabels();
      $('#presetSelect').value = '';
      updatePreview();
    });
  }

  // Save custom preset to localStorage
  $('#saveCustomPreset').addEventListener('click', () => {
    const name = prompt(t('presetNamePrompt'));
    if (!name) return;
    const customs = JSON.parse(localStorage.getItem('customPresets') || '{}');
    customs[name] = { ...currentConfig.styleParams };
    localStorage.setItem('customPresets', JSON.stringify(customs));
    loadCustomPresets();
  });
  $('#exportBtn').addEventListener('click', handleExport);
  $('#exportLongBtn').addEventListener('click', handleExportLong);

  // Mapping panel toggle
  $('#toggleMapping').addEventListener('click', () => {
    const panel = $('#mappingPanel');
    const btn = $('#toggleMapping');
    if (panel.classList.contains('collapsed')) {
      panel.classList.replace('collapsed', 'expanded');
      btn.textContent = '▼';
    } else {
      panel.classList.replace('expanded', 'collapsed');
      btn.textContent = '▶';
    }
  });

  // Mapping field changes
  for (const id of ['mapMessages', 'mapContent', 'mapRole', 'mapUserRole', 'mapCharId', 'mapCharacters']) {
    $(`#${id}`).addEventListener('input', debounce(() => {
      syncMappingFromUI();
      if (rawJson) { normalizeAndPreview(); }
    }, 300));
  }

  $('#autoDetect').addEventListener('click', () => {
    if (rawJson) { autoDetectMapping(rawJson); syncMappingToUI(); normalizeAndPreview(); }
  });

  $('#formatSelect').addEventListener('change', () => {
    const id = $('#formatSelect').value;
    if (!id) { if (rawJson) { autoDetectMapping(rawJson); syncMappingToUI(); normalizeAndPreview(); } return; }
    const tmpl = FORMAT_TEMPLATES.find(t => t.id === id);
    if (tmpl && rawJson) {
      detectedFormat = tmpl;
      // Apply template mapping
      jsonMapping._arrayMode = !!tmpl.arrayMode;
      jsonMapping.userRole = tmpl.userRole;
      if (!tmpl.arrayMode) {
        jsonMapping.role = tmpl.role.includes('.') ? tmpl.role.split('.')[0] : tmpl.role;
        jsonMapping.content = tmpl.content;
        jsonMapping.characterId = tmpl.charId.includes('.') ? tmpl.charId.split('.')[0] : tmpl.charId;
      }
      syncMappingToUI();
      normalizeAndPreview();
    }
  });
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── JSON Input ──

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('#jsonInput').value = reader.result;
    handleJsonChange();
  };
  reader.readAsText(file);
}

async function loadExample() {
  const res = await fetch('/test.json');
  const text = await res.text();
  $('#jsonInput').value = text;
  handleJsonChange();
}

function handleJsonChange() {
  const text = $('#jsonInput').value.trim();
  if (!text) { rawJson = null; currentData = null; clearPreview(); return; }
  try {
    rawJson = JSON.parse(text);
    autoDetectMapping(rawJson);
    syncMappingToUI();
    normalizeAndPreview();
  } catch (err) {
    rawJson = null;
    currentData = null;
    showError(t('jsonError', { msg: err.message }));
  }
}

// ── JSON Mapping ──

/** Resolve a dot-path like "data.items" on an object */
function getByPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/** Recursively find the first array-of-objects path in a JSON structure */
function findMessageArray(obj, maxDepth = 3, prefix = '') {
  if (maxDepth <= 0 || !obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const p = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
      return p;
    }
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findMessageArray(val, maxDepth - 1, prefix ? `${prefix}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

/** Read mapping values from the UI inputs */
function syncMappingFromUI() {
  jsonMapping.messages = $('#mapMessages').value.trim() || 'messages';
  jsonMapping.content = $('#mapContent').value.trim() || 'content';
  jsonMapping.role = $('#mapRole').value.trim() || 'role';
  jsonMapping.userRole = $('#mapUserRole').value.trim() || 'user';
  jsonMapping.characterId = $('#mapCharId').value.trim() || 'characterId';
  jsonMapping.characters = $('#mapCharacters').value.trim() || 'characters';
}

/** Write current mapping state to the UI inputs */
function syncMappingToUI() {
  $('#mapMessages').value = jsonMapping.messages;
  $('#mapContent').value = jsonMapping.content;
  $('#mapRole').value = jsonMapping.role;
  $('#mapUserRole').value = jsonMapping.userRole;
  $('#mapCharId').value = jsonMapping.characterId;
  $('#mapCharacters').value = jsonMapping.characters;
}

// ── Format Templates ── (scored matching, not guessing)

// Format templates — classified by DATA STRUCTURE, not platform
const FORMAT_TEMPLATES = [
  { id: 'array', i18nLabel: 'fmtArray', i18nHint: 'fmtArrayHint',
    paths: ['messages'], arrayMode: true, userRole: 'You',
    detect: (s) => Array.isArray(s) && s.length >= 2 && typeof s[0] === 'string' },
  { id: 'role-content', i18nLabel: 'fmtRoleContent', i18nHint: 'fmtRoleContentHint',
    paths: ['messages'], role: 'role', content: 'content', charId: 'role', userRole: 'user',
    detect: (s) => s.role && (typeof s.content === 'string' || Array.isArray(s.content)) },
  { id: 'from-text', i18nLabel: 'fmtFromText', i18nHint: 'fmtFromTextHint',
    paths: ['messages'], role: 'from', content: 'text', charId: 'from', userRole: '',
    detect: (s) => typeof s.from === 'string' && typeof s.text === 'string' },
  { id: 'author-content', i18nLabel: 'fmtAuthorContent', i18nHint: 'fmtAuthorContentHint',
    paths: ['messages'], role: 'author.name', content: 'content', charId: 'author.name', userRole: '',
    detect: (s) => s.author && (s.author.name || s.author.username) && typeof s.content === 'string' },
  { id: 'user-text', i18nLabel: 'fmtUserText', i18nHint: 'fmtUserTextHint',
    paths: ['.'], role: 'user', content: 'text', charId: 'user', userRole: '',
    detect: (s) => s.user && s.text && s.ts },
  { id: 'nested-mapping', i18nLabel: 'fmtMapping', i18nHint: 'fmtMappingHint',
    paths: ['mapping'], custom: true,
    detect: () => false },
];

let detectedFormat = null;

/** Auto-detect: score each format template against the data, pick best match */
function autoDetectMapping(json) {
  detectedFormat = null;

  // ChatGPT export — verify deep structure (mapping.*.message.content.parts)
  if (json.mapping && typeof json.mapping === 'object' && !Array.isArray(json.mapping) &&
      Object.values(json.mapping).some(n => n?.message?.content?.parts)) {
    detectedFormat = FORMAT_TEMPLATES.find(t => t.id === 'nested-mapping');
    return;
  }

  // Top-level array with {user, text, ts} (Slack)
  if (Array.isArray(json) && json.length > 0) {
    const samples = json.slice(0, Math.min(3, json.length));
    if (samples.filter(s => s.user && s.text && s.ts).length > samples.length / 2) {
      detectedFormat = FORMAT_TEMPLATES.find(t => t.id === 'user-text');
      return;
    }
  }

  // Known paths + auto-discovered fallback
  const knownPaths = ['messages', 'data.messages', 'items', 'data', 'conversation', 'records', 'questions', 'chat', 'history', 'dialog', 'results'];
  const discovered = findMessageArray(json);
  const tryPaths = discovered && !knownPaths.includes(discovered)
    ? [...knownPaths, discovered] : knownPaths;

  for (const msgPath of tryPaths) {
    const arr = getByPath(json, msgPath);
    if (!Array.isArray(arr) || !arr.length) continue;

    // Multi-sample: check up to 3 messages, require majority match
    const samples = arr.slice(0, Math.min(3, arr.length));
    const isDiscovered = discovered && msgPath === discovered && !knownPaths.includes(msgPath);

    for (const tmpl of FORMAT_TEMPLATES) {
      if (tmpl.custom) continue;
      // Skip path filter for auto-discovered paths; keep it for known paths
      if (!isDiscovered && !tmpl.paths.some(p => p === msgPath || msgPath.endsWith(p))) continue;
      const matchCount = samples.filter(s => tmpl.detect(s)).length;
      if (matchCount <= samples.length / 2) continue;

      detectedFormat = tmpl;
      jsonMapping.messages = msgPath;
      if (tmpl.arrayMode) {
        jsonMapping._arrayMode = true;
        jsonMapping.userRole = tmpl.userRole;
      } else {
        jsonMapping._arrayMode = false;
        jsonMapping.role = tmpl.role.includes('.') ? tmpl.role.split('.')[0] : tmpl.role;
        jsonMapping.content = tmpl.content;
        jsonMapping.characterId = tmpl.charId.includes('.') ? tmpl.charId.split('.')[0] : tmpl.charId;
        jsonMapping.userRole = tmpl.userRole;

        // OpenAI/Claude: prefer 'name' field as characterId if present
        if (tmpl.id === 'role-content' && arr.some(m => m.name)) {
          jsonMapping.characterId = 'name';
        }

        // Telegram/Discord: detect user by frequency — least frequent speaker is likely the user
        if (!tmpl.userRole) {
          const freq = {};
          arr.forEach(m => { const r = getByPath(m, tmpl.role); if (r) freq[r] = (freq[r] || 0) + 1; });
          const sorted = Object.entries(freq).sort((a, b) => a[1] - b[1]);
          jsonMapping.userRole = sorted[0]?.[0] || '';
        }
      }
      // Detect characters list
      for (const p of ['characters', 'participants', 'speakers']) {
        if (Array.isArray(getByPath(json, p))) { jsonMapping.characters = p; break; }
      }
      return;
    }

    // No template matched — fallback to field scanning
    const sample = arr[0];
    jsonMapping.messages = msgPath;
    if (Array.isArray(sample)) {
      jsonMapping._arrayMode = true;
      jsonMapping.userRole = 'You';
    } else {
      jsonMapping._arrayMode = false;
      for (const f of ['content', 'text', 'body', 'message']) { if (typeof sample[f] === 'string') { jsonMapping.content = f; break; } }
      for (const f of ['role', 'type', 'speaker', 'sender', 'from', 'name']) { if (sample[f] !== undefined) { jsonMapping.role = f; break; } }
      const roles = [...new Set(arr.map(m => m[jsonMapping.role]).filter(Boolean))];
      jsonMapping.userRole = roles.includes('user') ? 'user' : roles.includes('human') ? 'human' : roles[0] || '';
      for (const f of ['characterId', 'character', 'name', 'author', 'speaker_id']) {
        if (arr.some(m => m[f] !== undefined)) { jsonMapping.characterId = f; break; }
      }
    }
    return;
  }
}

/** Extract speaker name from a message, handling nested paths like author.username */
function extractField(msg, field) {
  if (!field) return '';
  if (field.includes('.')) return String(getByPath(msg, field) || '');
  return String(msg[field] || '');
}

/** Extract content, handling Claude API content blocks [{type:"text",text:"..."}] */
function extractContent(msg, field) {
  const val = msg[field];
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.filter(b => b.text).map(b => b.text).join('\n');
  return String(val || '');
}

let _hiddenSet = new Set(HIDDEN_ROLES);

/** Normalize any JSON to the roundtable format using current mapping */
function normalizeJson(json) {
  const fmtId = detectedFormat?.id;

  // ChatGPT export: extract from nested mapping structure
  if (fmtId === 'nested-mapping' && json.mapping) {
    const nodes = Object.values(json.mapping)
      .filter(n => n.message?.content?.parts?.length)
      .sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
    const messages = nodes.map(n => {
      const role = n.message.author?.role || 'unknown';
      const content = n.message.content.parts.join('\n');
      const isUser = role === 'user' || role === 'system';
      return { role: isUser ? 'user' : 'character', content, characterId: isUser ? undefined : role };
    }).filter(m => m.content.trim());
    const characters = [...new Set(messages.filter(m => m.role === 'character').map(m => m.characterId))]
      .filter(id => id && !_hiddenSet.has(id.toLowerCase()));
    return { type: 'roundtable', characters, messages, title: json.title || '' };
  }

  // Slack export: top-level array or messages array
  if (fmtId === 'user-text' && (Array.isArray(json) || Array.isArray(json?.messages))) {
    const arr = Array.isArray(json) ? json : json.messages;
    const messages = arr.filter(m => m.text && m.user).map(m => ({
      role: 'character', content: m.text, characterId: m.user,
    }));
    const characters = [...new Set(messages.map(m => m.characterId))]
      .filter(id => id && !_hiddenSet.has(id.toLowerCase()));
    return { type: 'roundtable', characters, messages, title: '' };
  }

  const rawMessages = getByPath(json, jsonMapping.messages);
  if (!Array.isArray(rawMessages)) return null;

  const messages = rawMessages.map(m => {
    // Array format: [speaker, content]
    if (Array.isArray(m)) {
      const speaker = String(m[0] || '');
      const content = String(m[1] || '');
      const isUser = speaker === jsonMapping.userRole;
      return { role: isUser ? 'user' : 'character', content, characterId: isUser ? undefined : speaker };
    }

    // Q&A format: {question, answer} or {q, a}
    if (fmtId === 'qa') {
      const q = m.question || m.q || '';
      const a = m.answer || m.a || '';
      return { role: 'character', content: `${q}\n\n${a}`, characterId: 'Q&A' };
    }

    // Standard object format
    const speakerVal = extractField(m, detectedFormat?.role || jsonMapping.role);
    const content = extractContent(m, detectedFormat?.content || jsonMapping.content);
    const charId = extractField(m, detectedFormat?.charId || jsonMapping.characterId) || speakerVal;
    const isUser = speakerVal === jsonMapping.userRole || speakerVal === 'system';

    return {
      role: isUser ? 'user' : 'character',
      content,
      characterId: isUser ? undefined : charId,
    };
  }).filter(m => m.content.trim());

  let characters = getByPath(json, jsonMapping.characters);
  if (!Array.isArray(characters)) {
    characters = [...new Set(messages.filter(m => m.role === 'character').map(m => m.characterId))];
  }
  characters = characters.filter(id => id && !_hiddenSet.has(id.toLowerCase()));

  return { type: 'roundtable', characters, messages, title: json.title || '' };
}

/** Normalize raw JSON and update preview */
function updateFormatUI() {
  const sel = $('#formatSelect');
  sel.innerHTML = `<option value="">${t('fmtAutoDetect')}</option>` +
    FORMAT_TEMPLATES.map(f => `<option value="${f.id}" ${detectedFormat?.id === f.id ? 'selected' : ''}>${t(f.i18nLabel)}</option>`).join('');
  if (detectedFormat) {
    const label = t(detectedFormat.i18nLabel);
    const hint = t(detectedFormat.i18nHint);
    $('#formatHint').textContent = t('formatDetected', { label, hint });
    $('#formatHint').style.color = '#5a8a5a';
  } else {
    $('#formatHint').textContent = t('formatUnknown');
    $('#formatHint').style.color = '';
  }
}

function normalizeAndPreview() {
  currentData = normalizeJson(rawJson);
  if (!currentData) { clearPreview(); return; }
  updateFormatUI();
  populateSlotDropdowns();
  buildCharacterColorPanel();
  updatePreview();
}

// ── Card Layout Slots ──

const BUILT_IN_SOURCES = [
  { value: 'displayLabel', i18nKey: 'slotDisplayLabel' },
  { value: 'content', i18nKey: 'slotContent' },
  { value: 'icon', i18nKey: 'slotIcon' },
  { value: 'label', i18nKey: 'slotLabel' },
  { value: 'name', i18nKey: 'slotName' },
  { value: 'characterId', i18nKey: 'slotCharId' },
  { value: 'pageIndicator', i18nKey: 'slotPageIndicator' },
  { value: 'text:', i18nKey: 'slotCustomText' },
];

function populateSlotDropdowns() {
  // Collect extra fields from raw JSON messages
  const extraFields = [];
  if (rawJson) {
    const msgs = getByPath(rawJson, jsonMapping.messages);
    if (Array.isArray(msgs) && msgs.length > 0) {
      for (const key of Object.keys(msgs[0])) {
        if (!['content', 'role', 'characterId'].includes(key) &&
            !BUILT_IN_SOURCES.some(s => s.value === key)) {
          extraFields.push({ value: `raw:${key}`, label: `${t('slotFieldPrefix')}${key}` });
        }
      }
    }
  }

  const allSources = [...BUILT_IN_SOURCES, ...extraFields];

  for (const [slotId, configKey] of SLOT_MAP) {
    const el = $(`#${slotId}`);
    const current = currentConfig.slots[configKey] || '';
    const isCustomText = current.startsWith('text:');

    el.innerHTML = allSources.map(s => {
      const selected = isCustomText ? s.value === 'text:' : s.value === current;
      const label = s.i18nKey ? t(s.i18nKey) : s.label;
      return `<option value="${s.value}" ${selected ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

  // Show/hide custom text inputs for all slots
  for (const [slotId, configKey] of SLOT_MAP) {
    const textInput = $(`#${slotId}Text`);
    if (!textInput) continue;
    const val = currentConfig.slots[configKey] || '';
    const isCustom = val.startsWith('text:');
    textInput.classList.toggle('visible', isCustom);
    if (isCustom) textInput.value = val.slice(5);
  }
}

function bindSlotEvents() {
  for (const [slotId, configKey] of SLOT_MAP) {
    const textInput = $(`#${slotId}Text`);
    $(`#${slotId}`).addEventListener('change', () => {
      const val = $(`#${slotId}`).value;
      if (val === 'text:') {
        textInput.classList.add('visible');
        currentConfig.slots[configKey] = `text:${textInput.value}`;
      } else {
        textInput.classList.remove('visible');
        currentConfig.slots[configKey] = val;
      }
      updatePreview();
    });
    textInput.addEventListener('input', () => {
      currentConfig.slots[configKey] = `text:${textInput.value}`;
      updatePreview();
    });
  }
}

// ── Character Color Panel ──

function buildCharacterColorPanel() {
  const container = $('#characterColors');
  if (!currentData?.characters) { container.innerHTML = ''; return; }

  container.innerHTML = `<h3 style="font-size:12px;color:#666;margin-bottom:8px;">${t('charColors')}</h3>`;

  for (let ci = 0; ci < currentData.characters.length; ci++) {
    const id = currentData.characters[ci];
    const autoStyle = getCharStyle(id, ci);
    const existing = currentConfig.colorOverrides[id] || autoStyle;
    const row = document.createElement('div');
    row.className = 'char-color-row';
    row.innerHTML = `
      <input type="text" data-id="${id}" data-field="icon" value="${existing.icon}" style="width:32px;text-align:center;" title="${t('charIconTitle')}">
      <input type="color" data-id="${id}" data-field="gradientStart" value="${existing.gradientStart}" title="${t('charGradStart')}">
      <input type="color" data-id="${id}" data-field="gradientEnd" value="${existing.gradientEnd}" title="${t('charGradEnd')}">
      <input type="text" data-id="${id}" data-field="label" value="${existing.label}" placeholder="${t('charLabelPlaceholder')}" title="${t('charLabelTitle')}">
    `;
    row.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        const cid = input.dataset.id;
        if (!currentConfig.colorOverrides[cid]) {
          currentConfig.colorOverrides[cid] = { ...autoStyle };
        }
        currentConfig.colorOverrides[cid][input.dataset.field] = input.value;
        updatePreview();
      });
    });
    container.appendChild(row);
  }
}

// ── Preview ──

function getColorForMsg(msg, charIndex = -1) {
  const isUser = msg.role === 'user';
  const base = isUser ? { ...USER_STYLE, label: 'You', name: 'You' } : getCharStyle(msg.characterId, charIndex);
  const override = currentConfig.colorOverrides[isUser ? '_user' : msg.characterId];
  const merged = override ? { ...base, ...override } : base;
  return { ...merged, displayLabel: `${merged.icon} ${merged.label}` };
}

// ── Brand theme (solid-color mode) ──
const BRAND_PRESETS = [
  { name: 'Ink',    bg: '#14110b', text: '#ece3d0' },
  { name: 'Paper',  bg: '#faf7f0', text: '#2d2a26' },
  { name: 'Slate',  bg: '#1e293b', text: '#e2e8f0' },
  { name: 'Blue',   bg: '#1d4ed8', text: '#eff6ff' },
  { name: 'Sand',   bg: '#e7dfce', text: '#3a3226' },
  { name: 'Forest', bg: '#14312a', text: '#dcefe6' },
];

function applyBrandToConfig() {
  const on = $('#brandEnable').checked;
  $('#brandControls').style.display = on ? 'block' : 'none';
  currentConfig.brandBg = on ? $('#brandBgColor').value : '';
  currentConfig.brandText = on ? $('#brandTextColor').value : '';
  updatePreview();
}

/** Reflect currentConfig.brand* into the brand UI (e.g. after loading history). */
function syncBrandUI() {
  const on = !!currentConfig.brandBg;
  $('#brandEnable').checked = on;
  if (on) {
    $('#brandBgColor').value = currentConfig.brandBg;
    if (currentConfig.brandText) $('#brandTextColor').value = currentConfig.brandText;
  }
  $('#brandControls').style.display = on ? 'block' : 'none';
}

function setupBrandTheme() {
  const wrap = $('#brandPresets');
  BRAND_PRESETS.forEach(pre => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'brand-chip';
    chip.title = pre.name;
    chip.textContent = 'Aa';
    chip.style.background = pre.bg;
    chip.style.color = pre.text;
    chip.addEventListener('click', () => {
      $('#brandBgColor').value = pre.bg;
      $('#brandTextColor').value = pre.text;
      $('#brandEnable').checked = true;
      applyBrandToConfig();
    });
    wrap.appendChild(chip);
  });
  $('#brandEnable').addEventListener('change', applyBrandToConfig);
  $('#brandBgColor').addEventListener('input', () => { if ($('#brandEnable').checked) applyBrandToConfig(); });
  $('#brandTextColor').addEventListener('input', () => { if ($('#brandEnable').checked) applyBrandToConfig(); });
  $('#brandControls').style.display = 'none';
}

// ── Style preset gallery (visual picker for the built-in card styles) ──
const STYLE_I18N = { classic: 'styleClassic', gentle: 'styleGentle', texture: 'styleTexture', quote: 'styleQuote', magazine: 'styleMagazine', elegant: 'styleElegant' };

function setActiveStyleChip(key) {
  document.querySelectorAll('#styleGallery .style-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.style === key));
}

const _SW_NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function renderStyleGallery() {
  const gal = $('#styleGallery');
  if (!gal) return;
  // Each chip is a real mini-card with the style actually applied — radius,
  // gradient direction, grain (noise), glow, text-align and quote mark — so the
  // six presets are obviously distinct at a glance.
  gal.innerHTML = Object.entries(CARD_STYLES).map(([k, v]) => {
    const p = { ...STYLE_DEFAULTS, ...(v.params || {}) };
    const r = Math.round((p.borderRadius ?? 40) * 0.42);
    const [g1, g2] = p.gradientReverse ? ['#a0604a', '#c4836e'] : ['#c4836e', '#a0604a'];
    const noise = Math.min(0.5, (p.noiseOpacity ?? 5) / 100 * 4.5).toFixed(2);
    const glow = Math.min(0.6, (p.glowIntensity ?? 0) / 100 * 3.2).toFixed(2);
    const center = p.textAlign === 'center' ? ' c' : '';
    const q = p.showQuoteMark ? '<span class="sm-q">“</span>' : '';
    return `<button type="button" class="style-chip" data-style="${k}" title="${t(STYLE_I18N[k] || k)}">
      <span class="style-mini" style="border-radius:${r}px;background:linear-gradient(${p.gradientAngle ?? 135}deg,${g1},${g2})">
        <span class="sm-grain" style="opacity:${noise};background-image:${_SW_NOISE}"></span>
        <span class="sm-glow" style="opacity:${glow}"></span>${q}
        <span class="sm-body${center}"><span class="sm-pill"></span><span class="sm-line" style="width:82%"></span><span class="sm-line" style="width:58%"></span></span>
      </span>
      <span class="style-name">${t(STYLE_I18N[k] || k)}</span>
    </button>`;
  }).join('');
  gal.querySelectorAll('.style-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const sel = $('#cardStyleSelect');
      sel.value = chip.dataset.style;
      sel.dispatchEvent(new Event('change'));
      setActiveStyleChip(chip.dataset.style);
    });
  });
  setActiveStyleChip(currentConfig.cardStyle || 'classic');
}

let _fitTimer = null;  // debounce handle for the preview auto-fit pass
function updatePreview() {
  if (!currentData?.messages) { clearPreview(); return; }

  const container = $('#previewCards');
  const aspect = getAspect(currentConfig.cardSize || '3:4');
  container.innerHTML = '';

  // Cover card — a title plate; data + markup shared with the export via CardRules
  const cover = CardRules.coverData(currentData.messages, currentData.characters, currentConfig);
  const coverTitle = currentConfig.coverTitle || t('defaultCoverTitle');
  const coverEl = createCardPreview({
    gradientStart: '#0c0c0c',
    gradientEnd: '#1a1a1a',
    textColor: '#f0e6d2',
    _cover: true,
    _coverTitle: coverTitle,
    _coverSummary: cover.summary,
    _coverNames: cover.names,
    _coverKicker: cover.kicker,
    name: coverTitle,
  }, 1, currentData.messages.length + 1, aspect);
  container.appendChild(coverEl);

  // Message cards — shared rules from card-rules.js
  const cards = CardRules.buildCardList(currentData.messages, currentData.characters, getColorForMsg, USER_STYLE);
  let cardIdx = 2;
  cards.forEach(card => {
    const el = createCardPreview(card, cardIdx++, currentData.messages.length + 1, aspect, card._rawMsg);
    container.appendChild(el);
  });

  const n = currentData.messages.length + 1;
  $('#cardCount').textContent = t('previewCount', { n });
  $('#proofMeta').textContent = `${n} cards · ${currentConfig.cardSize || '3:4'}`;
  $('#exportBtn').disabled = false;
  $('#exportLongBtn').disabled = false;

  // Auto-fit preview bodies to mirror the export (short → larger type). Debounced:
  // autoFitFontSize forces reflows, and updatePreview reruns on every slider tick,
  // so coalesce to one pass after dragging settles to keep the editor smooth.
  clearTimeout(_fitTimer);
  _fitTimer = setTimeout(() => {
    document.querySelectorAll('#previewCards .card-preview').forEach(cardEl => {
      const cp = cardEl.querySelector('.content-preview');
      const inner = cardEl.querySelector('.cp-inner');
      if (cp && inner && window.CardRules) CardRules.autoFitFontSize(inner, cp);
    });
  }, 80);
}

function resolveSlotClient(source, card, rawMsg = {}) {
  if (!source) return '';
  if (source.startsWith('text:')) return source.slice(5);
  if (source.startsWith('raw:')) return rawMsg[source.slice(4)] != null ? String(rawMsg[source.slice(4)]) : '';
  switch (source) {
    case 'displayLabel':  return card.displayLabel || card.label || '';
    case 'content':       return card.content || '';
    case 'icon':          return card.icon || '';
    case 'label':         return card.label || '';
    case 'name':          return card.name || '';
    case 'characterId':   return rawMsg.characterId || '';
    case 'pageIndicator': return `${card.index} / ${card.total}`;
    default:              return rawMsg[source] != null ? String(rawMsg[source]) : '';
  }
}

function createCardPreview(card, index, total, aspect, rawMsg = {}) {
  const cell = document.createElement('div');
  cell.className = 'proof-cell';
  const slugName = card.name || card.label || '';
  cell.dataset.slug = `card-${String(index).padStart(2, '0')}${slugName ? '  ·  ' + slugName : ''}`;

  const el = document.createElement('div');
  const p = currentConfig.styleParams || STYLE_DEFAULTS;
  const brandBg = currentConfig.brandBg || '';  // solid brand background overrides gradient
  const start = brandBg || (p.gradientReverse ? card.gradientEnd : card.gradientStart);
  const end = brandBg || (p.gradientReverse ? card.gradientStart : card.gradientEnd);
  const tc = brandBg ? (currentConfig.brandText || card.textColor) : card.textColor;
  el.className = 'card-preview';
  el.style.aspectRatio = aspect;
  el.style.color = tc;
  el.style.background = `linear-gradient(${p.gradientAngle}deg, ${start}, ${end})`;
  el.style.borderRadius = `${p.borderRadius / 2.5}px`;

  // Cover plate — same builder as the export (generate.mjs), scaled down
  if (card._cover) {
    el.style.color = tc;
    el.innerHTML = CardRules.coverPlateHTML({
      kicker: card._coverKicker,
      title: escapeHtml(card._coverTitle),
      summary: escapeHtml(card._coverSummary),
      names: escapeHtml(card._coverNames),
      textColor: tc,
      bodyFont: currentConfig.bodyFont || "'Noto Serif SC'",
      labelFont: currentConfig.labelFont,
      scale: 0.4,
    });
    cell.appendChild(el);
    return cell;
  }

  const cardObj = { ...card, index, total };
  const slots = currentConfig.slots;
  const badgeVal = resolveSlotClient(slots.badge, cardObj, rawMsg);
  const bodyVal = resolveSlotClient(slots.body, cardObj, rawMsg);
  const flVal = resolveSlotClient(slots.footerLeft, cardObj, rawMsg);
  const frVal = resolveSlotClient(slots.footerRight, cardObj, rawMsg);
  const bodyText = bodyVal.length > 400 ? bodyVal.slice(0, 400) + '…' : bodyVal;
  const bodyInner = (window.CardRules ? CardRules.splitUnits(bodyText) : [{ raw: bodyText, code: false }]).map(u => u.code
    ? `<pre class="code">${escapeHtml(CardRules.fenceBody(u.raw))}</pre>`
    : `<div class="cp-p">${escapeHtml(removeMarkdown(u.raw)).replace(/\n/g, '<br>')}</div>`
  ).join('');
  const centered = p.textAlign === 'center';
  const wm = escapeHtml(currentConfig.watermark || '');

  el.innerHTML = `
    ${p.showQuoteMark ? `<span style="position:absolute;top:6px;${centered ? 'left:50%;transform:translateX(-50%);' : 'left:20px;'}font-size:52px;opacity:0.09;line-height:1;z-index:0;">\u201C</span>` : ''}
    ${badgeVal ? `<div class="pill-preview${centered ? ' centered' : ''}" style="font-family:${currentConfig.labelFont},sans-serif;">${escapeHtml(badgeVal)}</div>` : ''}
    <div class="content-preview" style="text-align:${p.textAlign};line-height:${p.lineHeight};letter-spacing:${p.letterSpacing}px;font-family:${currentConfig.bodyFont},serif;"><span class="cp-inner">${bodyInner}</span></div>
    <div class="footer-preview" style="${centered ? 'justify-content:center;gap:12px;' : ''}">
      <span>${escapeHtml(flVal)}</span>
      <span>${escapeHtml(frVal)}</span>
    </div>
    ${wm ? `<span style="position:absolute;bottom:8px;right:12px;font-size:8px;opacity:0.25;">${wm}</span>` : ''}
  `;
  cell.appendChild(el);
  return cell;
}

function clearPreview() {
  $('#previewCards').innerHTML = `<p class="empty">${t('previewHint')}</p>`;
  $('#cardCount').textContent = '';
  const pm = $('#proofMeta'); if (pm) pm.textContent = '';
  $('#exportBtn').disabled = true;
  $('#exportLongBtn').disabled = true;
}

function showError(msg) {
  $('#previewCards').innerHTML = `<p class="empty" style="color:#c0392b;">${msg}</p>`;
  $('#cardCount').textContent = '';
  $('#exportBtn').disabled = true;
  $('#exportLongBtn').disabled = true;
}

// ── Export ──

async function handleExport() {
  if (!currentData) return;

  const btn = $('#exportBtn');
  btn.disabled = true;
  btn.textContent = t('generating');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentData, config: currentConfig }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentConfig.coverTitle || 'cards') + '.zip';
    a.click();
    URL.revokeObjectURL(url);

    saveHistory();
  } catch (err) {
    alert(t('exportFailed', { msg: err.message }));
  } finally {
    btn.disabled = false;
    btn.textContent = t('exportZip');
  }
}

async function handleExportLong() {
  if (!currentData) return;
  const btn = $('#exportLongBtn');
  btn.disabled = true;
  btn.textContent = t('generating');
  try {
    const res = await fetch('/api/generate-long', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentData, config: currentConfig }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentConfig.coverTitle || 'cards') + '-long.png';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(t('exportFailed', { msg: err.message }));
  } finally {
    btn.disabled = false;
    btn.textContent = t('exportLong');
  }
}

// ── History ──

function saveHistory() {
  const history = JSON.parse(localStorage.getItem('cardHistory') || '[]');
  history.unshift({
    timestamp: new Date().toISOString(),
    title: currentConfig.coverTitle,
    messageCount: currentData.messages.length,
    config: { ...currentConfig },
    jsonMapping: { ...jsonMapping },
    rawJson: rawJson,
    jsonData: currentData,
  });
  if (history.length > 20) history.length = 20;
  localStorage.setItem('cardHistory', JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem('cardHistory') || '[]');
  const container = $('#historyList');

  if (!history.length) {
    container.innerHTML = `<p class="empty">${t('noHistory')}</p>`;
    return;
  }

  container.innerHTML = history.map((item, i) => `
    <div class="history-item" data-index="${i}">
      <div>${item.title} (${t('msgCount', { n: item.messageCount })}) <span class="history-del" data-index="${i}" title="✕">✕</span></div>
      <div class="time">${new Date(item.timestamp).toLocaleString(currentLang === 'zh' ? 'zh-CN' : 'en-US')}</div>
    </div>
  `).join('');

  container.querySelectorAll('.history-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      history.splice(+btn.dataset.index, 1);
      localStorage.setItem('cardHistory', JSON.stringify(history));
      loadHistory();
    });
  });

  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = +el.dataset.index;
      const item = history[idx];
      currentConfig = { ...item.config };
      if (item.jsonMapping) jsonMapping = { ...item.jsonMapping };
      rawJson = item.rawJson || item.jsonData;
      currentData = item.jsonData;

      $('#jsonInput').value = JSON.stringify(rawJson, null, 2);
      $('#coverTitle').value = currentConfig.coverTitle || t('defaultCoverTitle');
      $('#coverExcludeRoles').value = (currentConfig.coverExcludeRoles || []).join(', ');
      $('#watermark').value = currentConfig.watermark || '';
      $('#fontSize').value = currentConfig.fontSize;
      $('#fontSizeValue').textContent = `${currentConfig.fontSize}px`;
      $('#cardSize').value = currentConfig.cardSize;
      if (currentConfig.cardStyle) { $('#cardStyleSelect').value = currentConfig.cardStyle; setActiveStyleChip(currentConfig.cardStyle); }
      if (currentConfig.styleParams) syncStyleParamsToUI();
      syncBrandUI();
      restoreCustomFonts();

      syncMappingToUI();
      populateSlotDropdowns();
      buildCharacterColorPanel();
      updatePreview();
    });
  });
}

// ── Start ──
init();
