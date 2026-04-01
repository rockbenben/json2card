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

  return { buildCardList };
})();

// Node: loaded via Function() wrapper in generate.mjs
