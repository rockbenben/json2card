import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getColorConfig, resolveSlot } from './generate.mjs';
import { scanFonts, generateFontFaceCSS } from './fonts.mjs';
import { mkdir, writeFile, rm } from 'node:fs/promises';

describe('getColorConfig', () => {
  it('returns user style with dark background', () => {
    const c = getColorConfig({ role: 'user' });
    assert.equal(c.gradientStart, '#0c0c0c');
    assert.equal(c.icon, '📜');
    assert.ok(c.displayLabel.includes('📜'));
  });

  it('assigns different colors to different characters', () => {
    const a = getColorConfig({ role: 'character', characterId: 'Alice' });
    const b = getColorConfig({ role: 'character', characterId: 'Bob' });
    // Different names should (almost certainly) get different palette entries
    assert.notEqual(a.gradientStart, b.gradientStart);
  });

  it('is deterministic — same name always gets same color', () => {
    const c1 = getColorConfig({ role: 'character', characterId: 'TestChar' });
    const c2 = getColorConfig({ role: 'character', characterId: 'TestChar' });
    assert.equal(c1.gradientStart, c2.gradientStart);
    assert.equal(c1.icon, c2.icon);
  });

  it('applies overrides', () => {
    const c = getColorConfig({ role: 'character', characterId: 'Alice' }, { Alice: { gradientStart: '#ff0000' } });
    assert.equal(c.gradientStart, '#ff0000');
  });
});

describe('resolveSlot', () => {
  const card = { displayLabel: '📖 Test', content: 'Hello', icon: '📖', label: 'Test', name: 'test', index: 3, total: 10 };

  it('resolves built-in sources', () => {
    assert.equal(resolveSlot('displayLabel', card), '📖 Test');
    assert.equal(resolveSlot('content', card), 'Hello');
    assert.equal(resolveSlot('pageIndicator', card), '3 / 10');
  });

  it('resolves custom text', () => {
    assert.equal(resolveSlot('text:圆桌论道', card), '圆桌论道');
  });

  it('resolves raw message fields', () => {
    assert.equal(resolveSlot('timestamp', card, { timestamp: 123 }), '123');
    assert.equal(resolveSlot('missing', card, {}), '');
  });
});

describe('scanFonts', () => {
  const testDir = './test-fonts-tmp';

  it('returns empty array for nonexistent directory', async () => {
    assert.deepStrictEqual(await scanFonts('./no-such-dir'), []);
  });

  it('scans and extracts display names', async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(`${testDir}/NotoSerifSC-Regular.woff2`, '');
    await writeFile(`${testDir}/MyCustomFont.ttf`, '');
    await writeFile(`${testDir}/readme.txt`, '');
    const fonts = await scanFonts(testDir);
    assert.equal(fonts.length, 2);
    assert.deepStrictEqual(fonts.map(f => f.displayName).sort(), ['My Custom Font', 'Noto Serif SC']);
    await rm(testDir, { recursive: true });
  });
});

describe('generateFontFaceCSS', () => {
  it('generates file:// URLs for deep paths', () => {
    const css = generateFontFaceCSS([{ file: 'T.woff2', displayName: 'T', format: 'woff2' }], '/a/b/fonts');
    assert.ok(css.includes('file:///a/b/fonts/T.woff2'));
  });

  it('generates relative URLs for single-segment paths', () => {
    const css = generateFontFaceCSS([{ file: 'T.otf', displayName: 'T', format: 'opentype' }], '/fonts');
    assert.ok(css.includes('/fonts/T.otf'));
    assert.ok(!css.includes('file://'));
  });
});
