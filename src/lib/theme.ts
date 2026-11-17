import type { ThemePreference } from './types';

/**
 * `settings.json` (backend) is the authoritative preference. A local cache only
 * seeds the first render so a forced dark theme does not boot light while
 * bootstrap is still in flight.
 *
 * The TS side does no `data-theme` juggling: the root Astryx `<Theme mode>` syncs
 * `data-theme` / `data-astryx-theme` onto `<html>` itself, which also makes the
 * theme's `light-dark()` tokens reach portals. Only `index.html` reads the cache
 * before the bundle loads, to paint the first frame in the right scheme.
 */
const CACHE_KEY = 'myskills.theme-cache';

const VALID: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && VALID.includes(value as ThemePreference);
}

export function readThemeCache(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    return isThemePreference(cached) ? cached : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemeCache(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, preference);
  } catch {
    // Storage can be unavailable; the preference still persists in settings.json.
  }
}

export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: 'light', label: '浅色', description: '始终使用浅色界面', icon: 'light_mode' },
  { value: 'dark', label: '深色', description: '始终使用深色界面', icon: 'dark_mode' },
  {
    value: 'system',
    label: '跟随系统',
    description: '随操作系统的浅色/深色设置自动切换',
    icon: 'brightness_auto',
  },
];
