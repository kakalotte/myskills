/**
 * Agent 图标映射（离线资源，SVG）。
 * 图标文件来自 https://icons.lobehub.com/ 生态（@lobehub/icons-static-svg）并离线存放于 public/agent-icons/；
 * 少量未在静态 SVG 包中提供的 agent 使用本地生成的占位 SVG。各标识著作权归各自权利人所有。
 */

export const AGENT_ICON_DIR = '/agent-icons/';

export const AGENT_ICON_FILES: Record<string, string> = {
  amp: 'amp.svg',
  antigravity: 'antigravity.svg',
  augment: 'augment.svg',
  claude_code: 'claude_code.svg',
  cline: 'cline.svg',
  codebuddy: 'codebuddy.svg',
  codex: 'codex.svg',
  command_code: 'command_code.svg',
  continue: 'continue.png',
  cursor: 'cursor.svg',
  deepagents: 'deepagents.svg',
  deepseek_harness: 'deepseek_harness.svg',
  droid: 'droid.svg',
  firebender: 'firebender.svg',
  gemini_cli: 'gemini_cli.svg',
  github_copilot: 'github_copilot.svg',
  gitlab_duo: 'gitlab_duo.svg',
  goose: 'goose.svg',
  grok: 'grok.svg',
  hermes: 'hermes.svg',
  junie: 'junie.svg',
  kilo_code: 'kilo_code.svg',
  kimi: 'kimi.svg',
  kiro: 'kiro.svg',
  minimax_code: 'minimax_code.svg',
  mistral_vibe: 'mistral_vibe.svg',
  openclaw: 'openclaw.svg',
  omp_agent: 'oh_my_pi.svg',
  opencode: 'opencode.svg',
  openhands: 'openhands.svg',
  pi: 'pi.svg',
  qoder: 'qoder.svg',
  qwen_code: 'qwen_code.svg',
  replit: 'replit.svg',
  roo_code: 'roo_code.svg',
  // `trae` / `trae_cn` ship a 140x34 wordmark with an embedded dark background,
  // which turns into an unreadable smudge at 15-28px. They intentionally fall
  // back to the initials badge; `trae.svg` / `trae_cn.svg` stay in public/.
  warp: 'warp.svg',
  windsurf: 'windsurf.svg',
  workbuddy: 'workbuddy.svg',
  workbuddy_overseas: 'workbuddy.svg',
  zencoder: 'zencoder.svg',
  zcode: 'zcode.svg',

  qclaw: 'openclaw.svg',
  easyclaw: 'openclaw.svg',
  autoclaw: 'openclaw.svg',
};

export function getAgentIconSrc(id: string): string | null {
  const file = AGENT_ICON_FILES[id];
  return file ? `${AGENT_ICON_DIR}${file}` : null;
}

/**
 * How an icon needs to adapt to a dark surface.
 *
 * Several brand marks are a single dark ink (`fill="currentColor"`, pure black,
 * or no fill at all), which disappears on `--app-surface` in dark mode. Others
 * ship their own near-black tile, whose edge vanishes too. Icons that are
 * colorful on transparent or already carry a light plate need nothing.
 */
export type AgentIconTreatment = 'mono' | 'dark-tile' | 'default';

/** Single-ink glyphs: inverted in dark mode by `styles/theme.css`. */
const MONO_ICONS = new Set([
  'antigravity',
  'augment',
  'cline',
  'codex',
  'cursor',
  'deepagents',
  'github_copilot',
  'goose',
  'hermes',
  'junie',
  'minimax_code',
  'opencode',
  'openhands',
  'qwen_code',
  'replit',
  'roo_code',
  'warp',
  'zencoder',
]);

/** Icons drawn on an almost-black plate: get a hairline edge in dark mode. */
const DARK_TILE_ICONS = new Set([
  'droid',
  'firebender',
  'grok',
  'kiro',
  'oh_my_pi',
  'openclaw',
  'pi',
  'qoder',
  'windsurf',
  'zcode',
]);

export function getAgentIconTreatment(id: string): AgentIconTreatment {
  if (MONO_ICONS.has(id)) return 'mono';
  if (DARK_TILE_ICONS.has(id)) return 'dark-tile';
  return 'default';
}

export function agentInitials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return ((words[0] ?? name).slice(0, 2) || '?').toUpperCase();
}

/**
 * Some adapters have no usable square icon (their artwork is a wordmark), and
 * their display name abbreviates poorly — `TRAE IDE` would become `TI`.
 */
const INITIALS_OVERRIDES: Record<string, string> = {
  trae: 'TR',
  trae_cn: 'TC',
};

/** Badge text for adapters rendered by the initials fallback. */
export function agentMarkLabel(id: string, name?: string): string {
  return INITIALS_OVERRIDES[id] ?? agentInitials(name ?? id);
}

const FALLBACK_BG = [
  '#1d4ed8',
  '#6d28d9',
  '#0f766e',
  '#c2410c',
  '#4338ca',
  '#be185d',
  '#047857',
  '#334155',
];

export function agentFallbackBg(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_BG[hash % FALLBACK_BG.length];
}
