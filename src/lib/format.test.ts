import { describe, expect, it } from 'vitest';
import {
  badgeStateLabel,
  cn,
  formatClock,
  mountLabel,
  scopeLabel,
  sourceLabel,
} from './format';

describe('format helpers', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, undefined, 'b', null, '')).toBe('a b');
  });

  it('labels scopes, sources and mounts in Chinese', () => {
    expect(scopeLabel('global')).toBe('全局级');
    expect(scopeLabel('project')).toBe('项目级');
    expect(sourceLabel('builtin')).toBe('自建');
    expect(sourceLabel('imported')).toBe('导入');
    expect(sourceLabel('external')).toBe('外部安装');
    expect(mountLabel('symlink')).toBe('链接');
    expect(mountLabel('copy')).toBe('副本');
    expect(mountLabel(null)).toBe('未安装');
    expect(badgeStateLabel('installed')).toBe('已安装');
    expect(badgeStateLabel('conflict')).toBe('未安装');
  });

  it('formats timestamps and tolerates invalid input', () => {
    expect(formatClock(null)).toBe('--:--');
    expect(formatClock('not-a-date')).toBe('--:--');
    expect(formatClock('2026-11-09T10:00:00Z')).toMatch(/\d{2}:\d{2}/);
  });
});
