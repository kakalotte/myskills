import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../lib/bridge';

export function useWindowControls() {
  const desktop = isTauri();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    getCurrentWindow()
      .isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
  }, [desktop]);

  async function minimize() {
    if (!desktop) return;
    await getCurrentWindow().minimize();
  }

  async function toggleMaximize() {
    if (!desktop) return;
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized());
  }

  async function close() {
    if (!desktop) return;
    await getCurrentWindow().close();
  }

  return { desktop, maximized, minimize, toggleMaximize, close };
}
