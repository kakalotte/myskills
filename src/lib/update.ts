import { isDemoMode } from './bridge';
import type { CmdError, UpdateCheck } from './types';

export const GITHUB_REPO = 'kakalotte/myskills';
export const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;

const RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASE_URL_PREFIX = `${RELEASES_PAGE}/`;
const REQUEST_TIMEOUT_MS = 10_000;

/** Minimal shape of GitHub's "latest release" payload that the UI needs. */
export interface GitHubRelease {
  tagName: string;
  htmlUrl: string;
  publishedAt: string | null;
}

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string | null;
}

/** Demo-mode release: never fetched from the network. */
const DEMO_RELEASE: GitHubRelease = {
  tagName: 'v0.5.0',
  htmlUrl: `${RELEASES_PAGE}/tag/v0.5.0`,
  publishedAt: '2026-11-24T09:00:00Z',
};

function updateError(code: string, message: string, detail?: string): CmdError {
  return detail ? { code, message, detail } : { code, message };
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError',
  );
}

function isCmdError(error: unknown): error is CmdError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<CmdError>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

function httpError(status: number): CmdError {
  if (status === 403 || status === 429) {
    return updateError('UPDATE_RATE_LIMITED', '请求过于频繁，请稍后再试');
  }
  if (status === 404) {
    return updateError('UPDATE_NOT_FOUND', '未找到发布信息');
  }
  return updateError('UPDATE_HTTP_ERROR', `检查更新失败（HTTP ${status}）`);
}

/** Strip the release tag prefix so versions can be compared and displayed. */
export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

export function parseVersion(raw: string | null | undefined): ParsedVersion | null {
  if (!raw) return null;
  const normalized = normalizeVersion(raw);
  const match = normalized.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

/** Returns 1 when `left` is newer, -1 when older, 0 when equal or unparseable. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  // A release outranks its prereleases (0.5.0 > 0.5.0-beta.1).
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** Validate and normalize a GitHub releases API response. */
export function parseRelease(payload: unknown): GitHubRelease | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.draft === true || record.prerelease === true) return null;
  const tagName = typeof record.tag_name === 'string' ? record.tag_name.trim() : '';
  if (!tagName || !parseVersion(tagName)) return null;
  const htmlUrl =
    typeof record.html_url === 'string' && record.html_url.startsWith(RELEASE_URL_PREFIX)
      ? record.html_url
      : RELEASES_PAGE;
  return {
    tagName,
    htmlUrl,
    publishedAt: typeof record.published_at === 'string' ? record.published_at : null,
  };
}

export async function fetchLatestRelease(): Promise<GitHubRelease> {
  if (isDemoMode()) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return DEMO_RELEASE;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) throw httpError(response.status);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw updateError('UPDATE_INVALID_RESPONSE', 'GitHub 返回了无法识别的版本信息');
    }
    const release = parseRelease(payload);
    if (!release) {
      throw updateError('UPDATE_INVALID_RESPONSE', 'GitHub 返回了无法识别的版本信息');
    }
    return release;
  } catch (error) {
    if (isAbortError(error)) {
      throw updateError('UPDATE_TIMEOUT', '检查更新超时，请稍后重试');
    }
    if (isCmdError(error)) throw error;
    throw updateError('UPDATE_OFFLINE', '无法连接到 GitHub，请检查网络后重试');
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the latest release and compare it with the running app version. */
export async function checkForUpdates(currentVersion: string): Promise<UpdateCheck> {
  const release = await fetchLatestRelease();
  const latestVersion = normalizeVersion(release.tagName);
  return {
    currentVersion,
    latestVersion,
    updateAvailable: isNewerVersion(latestVersion, currentVersion),
    releaseUrl: release.htmlUrl,
    publishedAt: release.publishedAt,
    checkedAt: new Date().toISOString(),
  };
}
