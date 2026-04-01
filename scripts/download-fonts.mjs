import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(__dirname, '..', 'fonts');

const FONTS = [
  // 思源宋体 — 经典衬线，适合正式/文学/引用
  { name: 'Noto Serif SC (思源宋体)',
    url: 'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf',
    file: 'NotoSerifSC-Regular.otf' },
  // 思源黑体 — 经典无衬线，适合标签/UI/标题
  { name: 'Noto Sans SC (思源黑体)',
    url: 'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
    file: 'NotoSansSC-Regular.otf' },
  // 霞鹜文楷 — 楷体风格，适合语录/文艺/手写感卡片
  { name: 'LXGW WenKai (霞鹜文楷)',
    url: 'https://github.com/lxgw/LxgwWenKai/releases/latest/download/LXGWWenKai-Regular.ttf',
    file: 'LXGWWenKai-Regular.ttf' },
];

async function main() {
  await fs.mkdir(fontsDir, { recursive: true });

  for (const font of FONTS) {
    const dest = path.join(fontsDir, font.file);
    try {
      await fs.access(dest);
      console.log(`✓ ${font.name} — already exists`);
      continue;
    } catch {}

    console.log(`↓ ${font.name}...`);
    try {
      const res = await fetch(font.url, { redirect: 'follow' });
      if (!res.ok) { console.warn(`  ✗ HTTP ${res.status}, skipping`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(dest, buf);
      console.log(`  ✓ saved (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    } catch (e) {
      console.warn(`  ✗ ${e.message}, skipping`);
    }
  }

  const files = await fs.readdir(fontsDir);
  const fonts = files.filter(f => /\.(otf|ttf|woff2?)$/i.test(f));
  console.log(`\n${fonts.length} fonts in fonts/: ${fonts.join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
