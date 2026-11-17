import { open, save } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { isTauri } from './bridge';

export async function copyText(value: string): Promise<void> {
  if (isTauri()) {
    await writeText(value);
    return;
  }
  await navigator.clipboard.writeText(value);
}

export async function revealPath(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('该操作仅在桌面应用中可用');
  }
  await revealItemInDir(path);
}

export async function pickDirectory(title = '选择目录'): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const result = await open({ directory: true, multiple: false, title });
  return typeof result === 'string' ? result : null;
}

export async function pickFile(
  title = '选择文件',
  extensions: string[] = [],
): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const result = await open({
    directory: false,
    multiple: false,
    title,
    filters: extensions.length > 0 ? [{ name: '文件', extensions }] : undefined,
  });
  return typeof result === 'string' ? result : null;
}

export async function saveFile(
  title = '保存文件',
  defaultPath?: string,
  extensions: string[] = [],
): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const result = await save({
    title,
    defaultPath,
    filters: extensions.length > 0 ? [{ name: '文件', extensions }] : undefined,
  });
  return typeof result === 'string' ? result : null;
}

export function isDesktop(): boolean {
  return isTauri();
}
