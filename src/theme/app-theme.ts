import { defineTheme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from '../astryx-themes';

/**
 * App palette carried by the Astryx theme runtime.
 *
 * Every entry is a `[light, dark]` tuple, which Astryx compiles to CSS
 * `light-dark()`. `<Theme mode>` sets `color-scheme` on the provider, so the
 * tuples resolve per mode — including `mode="system"`, which is pure CSS and
 * follows the OS without a JS listener.
 *
 * Names are prefixed `--app-` so they never collide with Astryx's own
 * `--color-*` tokens. `theme.css` maps them onto Tailwind (`@theme inline`).
 */
export const appTheme = defineTheme({
  name: 'myskills-app',
  extends: themes[defaultThemeSlug],
  localTokens: {
    /* surfaces and text */
    '--app-background': ['#f4f6f8', '#0f1319'],
    '--app-surface': ['#ffffff', '#171d26'],
    '--app-surface-container-lowest': ['#ffffff', '#131820'],
    '--app-surface-container-low': ['#fbfcfd', '#161c25'],
    '--app-surface-container': ['#eaf0f6', '#1b222c'],
    '--app-surface-container-high': ['#dfe7f1', '#212a36'],
    '--app-surface-container-highest': ['#d2deee', '#283241'],
    '--app-on-surface': ['#111827', '#e8edf5'],
    '--app-on-surface-variant': ['#4b5563', '#a5b1c2'],
    '--app-outline': ['#94a3b8', '#6b7a8d'],
    '--app-outline-variant': ['#d7dee8', '#2b3644'],

    /* accent */
    '--app-primary': ['#2563eb', '#60a5fa'],
    '--app-on-primary': ['#ffffff', '#0b1220'],
    '--app-primary-container': ['#dbeafe', '#1e3358'],
    '--app-on-primary-container': ['#1e3a8a', '#c7dbff'],
    '--app-primary-fixed': ['#e8effd', '#1b2b45'],
    '--app-primary-fixed-dim': ['#93b4f5', '#2b4a7d'],
    '--app-on-primary-fixed': ['#0b2a6b', '#cfe0ff'],

    /* secondary / tertiary */
    '--app-secondary': ['#4f46e5', '#a5b4fc'],
    '--app-on-secondary': ['#ffffff', '#1a1f4d'],
    '--app-secondary-container': ['#e0e7ff', '#2a2f63'],
    '--app-on-secondary-container': ['#312e81', '#d3dbff'],
    '--app-secondary-fixed': ['#e6e9ff', '#242a55'],
    '--app-on-secondary-fixed': ['#2a2a72', '#ccd3ff'],
    '--app-tertiary': ['#7c3aed', '#c4b5fd'],
    '--app-on-tertiary': ['#ffffff', '#2c2050'],
    '--app-tertiary-container': ['#ede9fe', '#362a5c'],
    '--app-on-tertiary-container': ['#4c1d95', '#e4d9ff'],
    '--app-tertiary-fixed': ['#ede9fe', '#2f2650'],
    '--app-on-tertiary-fixed': ['#4c1d95', '#e0d4ff'],

    /* status */
    '--app-error': ['#dc2626', '#f87171'],
    '--app-on-error': ['#ffffff', '#2a0b0b'],
    '--app-error-container': ['#fee2e2', '#4a1a1a'],
    '--app-on-error-container': ['#991b1b', '#ffd2d2'],
    '--app-success': ['#059669', '#34d399'],
    '--app-on-success': ['#ffffff', '#06281d'],
    '--app-success-container': ['#d1fae5', '#12352a'],
    '--app-on-success-container': ['#065f46', '#a7f3d0'],
    '--app-warning': ['#d97706', '#fbbf24'],
    '--app-on-warning': ['#ffffff', '#2f2205'],
    '--app-warning-container': ['#fef3c7', '#3a2c12'],
    '--app-on-warning-container': ['#92400e', '#fde3b0'],

    /* code panes and modal scrim */
    '--app-inverse-surface': ['#1f2937', '#0b0f14'],
    '--app-inverse-on-surface': ['#e5edf7', '#cfd9e6'],
    '--app-code-surface': ['#f6f8fb', '#0b0f14'],
    '--app-code-on-surface': ['#111827', '#d6dfec'],
    '--app-scrim': ['rgba(31, 41, 55, 0.38)', 'rgba(0, 0, 0, 0.62)'],

    /* elevation: light-dark() only applies to colors, so each shadow color is one */
    '--app-shadow-card':
      '0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.5)), 0 4px 14px light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.4))',
    '--app-shadow-float':
      '0 12px 36px light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.6)), 0 3px 10px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.45))',
    '--app-shadow-dialog':
      '0 28px 72px light-dark(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.7)), 0 6px 18px light-dark(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.5))',
  },
});
