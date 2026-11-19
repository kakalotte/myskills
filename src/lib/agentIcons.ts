/**
 * Agent 图标映射（离线资源，SVG）。
 * 图标文件来自 Lobe Icons（https://github.com/lobehub/lobe-icons，MIT）
 * 并离线存放于 public/agent-icons/，许可全文见同目录 LICENSE.lobe-icons.txt
 * 与仓库根目录 THIRD_PARTY_NOTICES.md。
 * 少量未在静态 SVG 包中提供的 agent 使用本地生成的占位 SVG。
 * 各品牌商标归各自权利人所有；此处仅用于标识对应 Agent，不代表背书。
 */

export const AGENT_ICON_DIR = '/agent-icons/';

export const AGENT_ICON_FILES: Record<string, string> = {
  amp: 'amp.svg',
  antigravity: 'antigravity.svg',
  augment: 'augment.svg',
  claude_code: 'claude_brand.svg',
  cline: 'cline.svg',
  codebuddy: 'codebuddy.svg',
  codex: 'codex.svg',
  command_code: 'commandcode.svg',
  continue: 'continue.png',
  cursor: 'cursor.svg',
  deepagents: 'deepagents.svg',
  deepseek_harness: 'deepseek.svg',
  droid: 'droid.svg',
  firebender: 'firebender.svg',
  gemini_cli: 'geminicli.svg',
  github_copilot: 'githubcopilot.svg',
  gitlab_duo: 'gitlab_duo.svg',
  goose: 'goose.svg',
  grok: 'grok.svg',
  hermes: 'hermesagent.svg',
  junie: 'junie.svg',
  kilo_code: 'kilocode.svg',
  kimi: 'kimi.svg',
  kiro: 'kiro.svg',
  minimax_code: 'minimax.svg',
  mistral_vibe: 'mistral.svg',
  openclaw: 'openclaw.svg',
  omp_agent: 'oh_my_pi.svg',
  opencode: 'opencode.svg',
  openhands: 'openhands.svg',
  pi: 'pi.svg',
  qoder: 'qoder.svg',
  qwen_code: 'qwen.svg',
  replit: 'replit.svg',
  roo_code: 'roocode.svg',
  trae: 'trae.svg',
  trae_cn: 'trae_cn.svg',
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
 * How an icon needs to adapt to a dark surface. Icons are self-contained
 * avatar tiles (brand-color background + white glyph), so no CSS inversion or
 * edge treatment is needed — every icon keeps its own colors in both themes.
 */
export type AgentIconTreatment = 'default';

export function getAgentIconTreatment(): AgentIconTreatment {
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
