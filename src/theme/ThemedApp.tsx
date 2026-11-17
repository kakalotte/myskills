import { Theme } from '@astryxdesign/core/theme';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/app-store';
import { appTheme } from './app-theme';

/**
 * The root `<Theme mode>` owns color mode end to end: it sets `color-scheme`
 * for the provider subtree, syncs `data-theme` / `data-astryx-theme` onto
 * `<html>` (so browser chrome and portals follow), and `mode="system"` tracks
 * the OS through CSS alone.
 */
export function ThemedApp({ children }: { children: ReactNode }) {
  const theme = useAppStore((state) => state.theme);
  return (
    <Theme theme={appTheme} mode={theme}>
      {children}
    </Theme>
  );
}
