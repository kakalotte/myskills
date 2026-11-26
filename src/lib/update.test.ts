import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./bridge', () => ({ isDemoMode: () => false }));

import {
  RELEASES_PAGE,
  checkForUpdates,
  compareVersions,
  isNewerVersion,
  normalizeVersion,
  parseRelease,
  parseVersion,
} from './update';

const releasePayload = {
  tag_name: 'v0.5.0',
  name: 'mySkills v0.5.0',
  body: '## 新增\n\n- 新功能',
  html_url: 'https://github.com/kakalotte/myskills/releases/tag/v0.5.0',
  published_at: '2026-11-24T09:00:00Z',
  draft: false,
  prerelease: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('version helpers', () => {
  it('normalizes release tags and parses semantic versions', () => {
    expect(normalizeVersion('v0.4.0')).toBe('0.4.0');
    expect(parseVersion('v0.10.0')).toEqual({ core: [0, 10, 0], prerelease: null });
    expect(parseVersion('0.5.0-beta.1')).toEqual({ core: [0, 5, 0], prerelease: 'beta.1' });
    expect(parseVersion('not-a-version')).toBeNull();
  });

  it('compares versions numerically and ranks releases above prereleases', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1);
    expect(compareVersions('v0.4.0', '0.4.0')).toBe(0);
    expect(isNewerVersion('0.5.0', '0.5.0-beta.1')).toBe(true);
    expect(isNewerVersion('bad', '0.1.0')).toBe(false);
  });
});

describe('release parsing', () => {
  it('accepts a published release and keeps its tag, URL and date', () => {
    const release = parseRelease(releasePayload);
    expect(release?.tagName).toBe('v0.5.0');
    expect(release?.htmlUrl).toBe(releasePayload.html_url);
    expect(release?.publishedAt).toBe('2026-11-24T09:00:00Z');
  });

  it('ignores drafts and prereleases', () => {
    expect(parseRelease({ ...releasePayload, prerelease: true })).toBeNull();
    expect(parseRelease({ ...releasePayload, draft: true })).toBeNull();
  });

  it('falls back to the releases page for unexpected URLs', () => {
    expect(
      parseRelease({ ...releasePayload, html_url: 'https://example.com/malware' })?.htmlUrl,
    ).toBe(RELEASES_PAGE);
  });
});

describe('update check', () => {
  it('detects a newer release', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(releasePayload)));
    const result = await checkForUpdates('0.4.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('0.5.0');
    expect(result.releaseUrl).toBe(releasePayload.html_url);
    expect(result).not.toHaveProperty('releaseNotes');
    expect(result).not.toHaveProperty('releaseName');
  });

  it('reports up-to-date installs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(releasePayload)));
    const result = await checkForUpdates('0.5.0');
    expect(result.updateAvailable).toBe(false);
  });

  it('maps GitHub rate limits and missing releases', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 403)));
    await expect(checkForUpdates('0.4.0')).rejects.toMatchObject({
      code: 'UPDATE_RATE_LIMITED',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    await expect(checkForUpdates('0.4.0')).rejects.toMatchObject({ code: 'UPDATE_NOT_FOUND' });
  });

  it('maps offline and aborted requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(checkForUpdates('0.4.0')).rejects.toMatchObject({ code: 'UPDATE_OFFLINE' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    await expect(checkForUpdates('0.4.0')).rejects.toMatchObject({ code: 'UPDATE_TIMEOUT' });
  });

  it('maps malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ tag_name: 'nope' })));
    await expect(checkForUpdates('0.4.0')).rejects.toMatchObject({
      code: 'UPDATE_INVALID_RESPONSE',
    });
  });
});
