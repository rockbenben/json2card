import fs from 'node:fs/promises';
import path from 'node:path';

const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf']);

const FORMAT_MAP = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'truetype',
  '.otf': 'opentype',
};

/**
 * Convert a font filename to a human-readable display name.
 * "NotoSerifSC-Regular.woff2" → "Noto Serif SC"
 */
function fileToDisplayName(filename) {
  const stem = path.parse(filename).name;
  return stem
    .replace(/[-_](Regular|Bold|Light|Medium|Thin|Black|SemiBold|ExtraBold|ExtraLight)$/i, '')
    .replace(/[-_]\d+[-_]\d+/g, '')       // remove version numbers like -3-55
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase split
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_]+/g, ' ')                // underscores to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scan a directory for font files.
 * @param {string} fontsDir
 * @returns {Promise<Array<{ file: string, displayName: string, format: string }>>}
 */
export async function scanFonts(fontsDir) {
  let entries;
  try {
    entries = await fs.readdir(fontsDir);
  } catch {
    return [];
  }

  const fonts = [];
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!FONT_EXTENSIONS.has(ext)) continue;
    fonts.push({
      file: entry,
      displayName: fileToDisplayName(entry),
      format: FORMAT_MAP[ext],
    });
  }

  return fonts.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Generate @font-face CSS declarations.
 * Web path ("/fonts") → relative URLs. Filesystem path → base64 data URIs.
 * @param {Array} fonts - from scanFonts
 * @param {string} basePath - web path or absolute dir path
 * @param {boolean} [inline=false] - if true, read files and embed as base64
 * @returns {string|Promise<string>}
 */
export function generateFontFaceCSS(fonts, basePath, inline = false, filterNames = null) {
  if (filterNames) fonts = fonts.filter(f => filterNames.includes(f.displayName));
  const normalised = basePath.replace(/\\/g, '/');
  const segments = normalised.split('/').filter(Boolean);
  const isWebPath = normalised.startsWith('/') && segments.length === 1;

  if (inline) {
    // Read font files and embed as base64 data URIs (for Puppeteer)
    return Promise.all(fonts.map(async f => {
      const filePath = path.join(basePath, f.file);
      const buf = await fs.readFile(filePath);
      const b64 = buf.toString('base64');
      const mime = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', opentype: 'font/otf' }[f.format] || 'application/octet-stream';
      return `@font-face {
  font-family: '${f.displayName}';
  src: url('data:${mime};base64,${b64}') format('${f.format}');
  font-weight: 400;
  font-style: normal;
}`;
    })).then(rules => rules.join('\n'));
  }

  return fonts.map(f => {
    const url = isWebPath ? `${basePath}/${f.file}` : `file:///${normalised.replace(/^\//, '')}/${f.file}`;
    return `@font-face {
  font-family: '${f.displayName}';
  src: url('${url}') format('${f.format}');
  font-weight: 400;
  font-style: normal;
}`;
  }).join('\n');
}
