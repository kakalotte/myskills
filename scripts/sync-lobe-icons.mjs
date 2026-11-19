/**
 * Sync extra Agent icons from lobe-icons (https://github.com/lobehub/lobe-icons, MIT).
 *
 * Run with `npm run icons:sync`. Network is used at build time only; the app
 * itself stays fully offline. Generates flat SVG files in public/agent-icons/
 * named `lobe_<id>.svg` plus a registry file consumed by the UI.
 *
 * Rules (per user):
 *  1. If the brand ships an official `*-color.svg`, copy it as-is.
 *  2. Otherwise build an avatar tile from AVATAR_BACKGROUND / AVATAR_COLOR /
 *     AVATAR_ICON_MULTIPLE in the brand's style.ts.
 *  3. A pure-black background becomes white with a dark glyph.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const RAW = 'https://raw.githubusercontent.com/lobehub/lobe-icons/master';
const ICON_DIR = path.resolve('public/agent-icons');
const REGISTRY_OUT = path.resolve('src/lib/lobeIcons.generated.ts');

const DIRS_API = 'https://api.github.com/repos/lobehub/lobe-icons/contents/packages/static-svg/icons?ref=master';
const TOC_URL = `${RAW}/src/toc.json`;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function isLight(hex) {
  if (!hex || !hex.startsWith('#')) return false;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 205;
}

function isBlack(hex) {
  return /^#0{3}(000)?$/i.test(hex || '');
}

function resolveConst(text, name) {
  const m = text.match(new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`));
  return m ? m[1].trim() : null;
}

function glyphMarkup(svg) {
  let s = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/g, '');
  return s.trim();
}

function tint(markup, color) {
  return markup.replace(/fill="[^"]*"/g, `fill="${color}"`);
}

function makeTile({ glyph, background, foreground, multiple }) {
  const t = ((24 - 24 * multiple) / 2).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <rect width="24" height="24" rx="5" fill="${background}" />
  <g transform="translate(${t} ${t}) scale(${multiple})" fill="${foreground}">${glyph}</g>
</svg>
`;
}

const [tocRaw, dirsRaw, existingRegistry] = await Promise.all([
  fetchText(TOC_URL),
  fetchText(DIRS_API),
  fs.readFile(path.resolve('src/lib/agentIcons.ts'), 'utf8').catch(() => ''),
]);

const toc = JSON.parse(tocRaw);
const upstreamFiles = new Set(JSON.parse(dirsRaw).map((f) => f.name));

// Existing local icon file names, so we only add what's missing.
const localFiles = new Set((await fs.readdir(ICON_DIR)).filter((f) => f.endsWith('.svg') || f.endsWith('.png')));
// Names already referenced by AGENT_ICON_FILES (e.g. claude_brand.svg).
for (const m of existingRegistry.matchAll(/'([^']+\.(?:svg|png))'/g)) localFiles.add(m[1]);

const apps = toc.filter((item) => item.group === 'application');
const missing = apps.filter((item) => {
  const norm = item.id.toLowerCase();
  return !localFiles.has(`${norm}.svg`) && !localFiles.has(`${item.title.toLowerCase()}.svg`);
});

const added = [];
const skipped = [];
for (const item of missing) {
  const id = item.id;
  const lower = id.toLowerCase();
  const colorFile = `${lower}-color.svg`;
  const outName = `lobe_${lower}.svg`;
  let content = null;
  let source = '';

  // 1) official Color variant
  if (upstreamFiles.has(colorFile)) {
    try {
      content = await fetchText(`${RAW}/packages/static-svg/icons/${colorFile}`);
      source = 'color';
    } catch {}
  }

  // 2) avatar tile from style.ts
  if (!content) {
    let style = '';
    try { style = await fetchText(`${RAW}/src/${id}/style.ts`); } catch {}
    let primary = item.color;
    const cp = resolveConst(style, 'COLOR_PRIMARY');
    if (cp && !cp.startsWith('COLOR_')) primary = cp;
    let bg = resolveConst(style, 'AVATAR_BACKGROUND');
    let fg = resolveConst(style, 'AVATAR_COLOR');
    let multiple = parseFloat(resolveConst(style, 'AVATAR_ICON_MULTIPLE') || '') || 0.7;
    if (!bg || bg.startsWith('COLOR_')) bg = primary || '#1E1E2E';
    if (!fg || fg.startsWith('COLOR_')) fg = primary || '#fff';

    // pure black background -> white tile + dark glyph
    if (isBlack(bg)) {
      bg = '#ffffff';
      fg = '#000000';
    } else if (isLight(bg) && isLight(fg)) {
      fg = '#000000';
    }

    let glyph = '';
    const monoFile = `${lower}.svg`;
    if (upstreamFiles.has(monoFile)) {
      try { glyph = glyphMarkup(await fetchText(`${RAW}/packages/static-svg/icons/${monoFile}`)); } catch {}
    }
    if (!glyph) { skipped.push(`${id}: no glyph`); continue; }
    content = makeTile({ glyph: tint(glyph, fg), background: bg, foreground: fg, multiple });
    source = 'tile';
  }

  await fs.writeFile(path.join(ICON_DIR, outName), content, 'utf8');
  added.push({ id, file: outName, name: item.fullTitle || item.title, source });
}

const lines = added.map((a) => `  { id: '${a.id}', file: '${a.file}', name: '${a.name.replace(/'/g, "\\'")}', source: '${a.source}' },`);
const generated = `// GENERATED by scripts/sync-lobe-icons.mjs - do not edit by hand.\n\nexport interface LobeIcon {\n  id: string;\n  file: string;\n  name: string;\n  source: 'color' | 'tile';\n}\n\nexport const LOBE_ICONS: LobeIcon[] = [\n${lines.join('\n')}\n];\n`;
await fs.writeFile(REGISTRY_OUT, generated, 'utf8');

console.log(`application=${apps.length} missing=${missing.length} added=${added.length} skipped=${skipped.length}`);
console.log(`color=${added.filter((a) => a.source === 'color').length} tile=${added.filter((a) => a.source === 'tile').length}`);
if (skipped.length) console.log('skipped:\n' + skipped.join('\n'));
