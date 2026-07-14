/**
 * Shared card preparation rules — used by both preview (browser) and export (Node).
 * Browser: loaded as <script>, exposes window.CardRules
 * Node:    loaded via Function() wrapper in generate.mjs
 */
const CardRules = (() => {
  const SUMMARY_LABEL = { label: '· · ·', name: 'Summary', displayLabel: '· · ·' };

  /**
   * Build card descriptors from messages — single source of truth for card rules.
   * @param {Array} messages - normalized messages [{role, content, characterId}, ...]
   * @param {Array} characters - unique character IDs
   * @param {Function} getColor - (msg, charIndex) => color object
   * @param {Object} [darkStyle] - dark theme colors for Summary bookend (defaults to USER_STYLE values)
   * @returns {Array} card descriptors: { ...color, label, displayLabel, content, _rawMsg }
   */
  function buildCardList(messages, characters, getColor, darkStyle) {
    const dark = darkStyle || { gradientStart: '#0c0c0c', gradientEnd: '#1a1a1a', textColor: '#f0e6d2', icon: '📜' };
    const charIndexMap = {};
    (characters || []).forEach((id, i) => { charIndexMap[id] = i; });

    const cards = [];
    messages.forEach((msg, i) => {
      const isFirstUser = i === 0 && msg.role === 'user';
      const isLastSummary = i === messages.length - 1 &&
        (msg.characterId === 'Summary' || msg.characterId === 'summary');

      // Skip first user message if short — already shown on cover
      if (isFirstUser) {
        const paras = msg.content.trim().split(/\n+/).filter(l => l.trim());
        if (paras.length <= 3) return;
      }

      // Summary → dark bookend (matches cover); others → character color
      const color = isLastSummary
        ? { ...dark, ...SUMMARY_LABEL }
        : getColor(msg, charIndexMap[msg.characterId] ?? -1);

      // User → hide badge
      const dl = msg.role === 'user' ? '' : color.displayLabel;

      cards.push({ ...color, label: dl, displayLabel: dl, content: msg.content, _rawMsg: msg });
    });

    return cards;
  }

  // ── Auto-fit (shared by export page.evaluate and web preview) ──
  // Single source of truth for how a short body grows to fill its frame.
  const AUTOFIT = { trigger: 0.5, target: 0.62, maxScale: 2.2, edge: 8 };

  /**
   * Scale `inner`'s font up so a short body fills its box comfortably — larger
   * on tall cards, smaller on square, capped so it never shouts or clips. Dense
   * bodies are left untouched. Binary search keeps reflows to ~a dozen reads.
   * DOM-only; runs in the browser (preview) and inside Puppeteer (export).
   * @param {HTMLElement} inner - measured/scaled wrapper (min-height:100%, holds font-size)
   * @param {HTMLElement} box   - the clipping frame providing available height
   */
  function autoFitFontSize(inner, box) {
    inner.style.fontSize = '';
    const boxH = box.clientHeight;
    inner.style.minHeight = '0'; // measure NATURAL height (wrapper otherwise fills)
    const base = parseFloat(getComputedStyle(inner).fontSize) || 28;
    if (inner.scrollHeight < boxH * AUTOFIT.trigger) {
      const cap = Math.min(boxH * AUTOFIT.target, boxH - AUTOFIT.edge);
      const fitsAt = (fs) => { inner.style.fontSize = fs + 'px'; return inner.scrollHeight <= cap; };
      let lo = base, hi = base * AUTOFIT.maxScale, best = base;
      for (let i = 0; i < 12 && hi - lo > 0.5; i++) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) { best = mid; lo = mid; } else { hi = mid; }
      }
      inner.style.fontSize = Math.floor(best) + 'px';
    }
    inner.style.minHeight = ''; // restore fill so justify-center re-centers
  }

  /**
   * Cover "title plate" markup — shared by export (generate.mjs, scale 1) and
   * the web preview (scale ~0.4) so the two never drift. Text fields must be
   * pre-escaped by the caller.
   */
  function coverPlateHTML(o) {
    const s = o.scale || 1;
    const px = (n) => +(n * s).toFixed(2);
    const cross = px(22), lineLen = px(34), off = (lineLen - cross) / 2, lw = Math.max(1, px(1.5));
    const label = o.labelFont ? `font-family:${o.labelFont},sans-serif;` : '';
    return `<div style="height:100%;display:flex;flex-direction:column;color:${o.textColor};">
  <div style="display:flex;align-items:center;gap:${px(15)}px;opacity:0.44;font-size:${px(20)}px;letter-spacing:${px(2.5)}px;font-family:ui-monospace,'SF Mono','Cascadia Code',Consolas,monospace;text-transform:uppercase;">
    <span style="position:relative;display:inline-block;width:${cross}px;height:${cross}px;border:${lw}px solid currentColor;border-radius:50%;flex-shrink:0;">
      <span style="position:absolute;left:50%;top:${-off}px;height:${lineLen}px;width:${lw}px;background:currentColor;transform:translateX(-50%);"></span>
      <span style="position:absolute;top:50%;left:${-off}px;width:${lineLen}px;height:${lw}px;background:currentColor;transform:translateY(-50%);"></span>
    </span>
    <span>${o.kicker}</span>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">
    <div style="font-size:${px(62)}px;line-height:1.22;letter-spacing:${px(1)}px;font-weight:600;margin-bottom:${px(38)}px;${label}">${o.title}</div>
    <div style="width:${px(56)}px;height:${Math.max(1.5, px(2))}px;background:currentColor;opacity:0.35;margin-bottom:${px(38)}px;"></div>
    <div style="font-size:${px(30)}px;line-height:1.95;opacity:0.74;font-family:${o.bodyFont},'Noto Serif SC',serif;">${o.summary}</div>
  </div>
  <div style="font-size:${px(22)}px;line-height:1.7;letter-spacing:${px(2)}px;opacity:0.5;">${o.names}</div>
</div>`;
  }

  /**
   * Derive the cover plate's data (summary line, roster, voice count, kicker)
   * from messages — single source of truth for BOTH export (generate.mjs) and
   * the web preview, so they never render a different title/summary/kicker.
   */
  function coverData(messages, characters, config) {
    const c = config || {};
    const userMsg = (messages || []).find(m => m.role === 'user');
    const paras = userMsg ? String(userMsg.content).split(/\n+/).filter(l => l.trim()) : [];
    const summary = paras.filter(p => p.length >= 10).sort((a, b) => a.length - b.length)[0] || paras[0] || '';
    const excludeSet = new Set((c.coverExcludeRoles || []).map(r => String(r).toLowerCase()));
    const overrides = c.colorOverrides || {};
    const kept = (characters || []).filter(id => !excludeSet.has(String(id).toLowerCase()));
    const names = kept.map(id => overrides[id]?.name || id).join('  ·  ');
    const voiceCount = kept.length;
    return { summary, names, voiceCount, kicker: voiceCount ? `${voiceCount} · VOICES` : 'PROOF' };
  }

  /**
   * Ensure `.content` holds exactly one clean `.content-inner`, clearing any
   * leftover cover node from a warm page and any prior auto-fit scale. DOM-only;
   * shared by both page.evaluate contexts in generate.mjs. Returns the wrapper.
   */
  function resetContentInner(box) {
    let inner = box.querySelector('.content-inner');
    if (!inner || box.children.length > 1) {
      box.innerHTML = '';
      inner = document.createElement('div');
      inner.className = 'content-inner';
      box.appendChild(inner);
    }
    inner.style.fontSize = '';
    return inner;
  }

  return { buildCardList, autoFitFontSize, coverPlateHTML, coverData, resetContentInner, AUTOFIT };
})();

// Browser: expose as a window global so Puppeteer-injected pages and app.js
// can both reach it. Node (generate.mjs Function wrapper) has no window.
if (typeof window !== 'undefined') window.CardRules = CardRules;
