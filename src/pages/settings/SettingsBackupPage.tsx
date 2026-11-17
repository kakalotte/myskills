import { useCallback, useState } from 'react';
import { api } from '../../lib/bridge';
import { cn } from '../../lib/format';
import { pickFile, saveFile } from '../../lib/platform';
import { useAppStore } from '../../store/app-store';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import type { ExportBackupOutcome, ImportBackupOutcome } from '../../lib/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function defaultBackupName(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-');
  return `myskills-backup-${stamp}.zip`;
}

export function SettingsBackupPage({ embedded = false }: { embedded?: boolean } = {}) {
  const pushToast = useAppStore((state) => state.pushToast);
  const refresh = useAppStore((state) => state.refreshGlobal);

  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastExport, setLastExport] = useState<ExportBackupOutcome | null>(null);
  const [importResult, setImportResult] = useState<ImportBackupOutcome | null>(null);
  const [archivePath, setArchivePath] = useState<string | null>(null);

  const handleExportBackup = useCallback(async () => {
    const targetPath = await saveFile('保存备份', defaultBackupName(), ['zip']);
    if (!targetPath) return;

    setExporting(true);
    setError(null);
    try {
      const outcome = await api.exportBackup({ targetPath });
      setLastExport(outcome);
      pushToast({
        tone: 'success',
        title: '备份已导出',
        description: outcome.filePath,
      });
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      setError(normalized.message ?? '导出备份失败');
      pushToast({
        tone: 'error',
        title: '导出备份失败',
        description: normalized.message ?? String(err),
      });
    } finally {
      setExporting(false);
    }
  }, [pushToast]);

  const handlePickArchive = useCallback(async () => {
    const picked = await pickFile('选择备份 ZIP', ['zip']);
    if (!picked) return;
    setArchivePath(picked);
    setImportResult(null);
  }, []);

  const handleImportBackup = useCallback(async () => {
    if (!archivePath) return;
    if (!window.confirm('若存在同名技能，将直接覆盖。是否继续导入？')) return;

    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const outcome = await api.importBackup({ archivePath, conflictStrategy: 'overwrite' });
      setImportResult(outcome);
      await refresh({ announce: false });
      pushToast({
        tone: 'success',
        title: '导入完成',
        description: outcome.message,
      });
    } catch (err: unknown) {
      const normalized = err as { code?: string; message?: string };
      setError(normalized.message ?? '导入备份失败');
      pushToast({
        tone: 'error',
        title: '导入备份失败',
        description: normalized.message ?? String(err),
      });
    } finally {
      setImporting(false);
    }
  }, [archivePath, pushToast, refresh]);

  return (
    <div className={cn('flex flex-col gap-space-md', embedded ? '' : 'p-space-md')}>
      {error ? (
        <p className="rounded-control bg-error-container/50 px-space-md py-space-sm text-body-sm text-on-error-container">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-space-lg lg:grid-cols-2">
        <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card">
          <div className="flex items-center gap-space-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-card bg-primary-fixed">
              <Icon name="archive" size={22} className="text-primary" />
            </span>
            <h2 className="text-headline-md text-on-surface">导出备份</h2>
          </div>

          <div className="mt-auto flex flex-col gap-space-sm">
            <Button
              variant="primary"
              size="sm"
              icon="download"
              loading={exporting}
              disabled={exporting}
              onClick={handleExportBackup}
            >
              导出 ZIP
            </Button>
            <p className="font-mono text-label-code-sm text-on-surface-variant">
              {lastExport
                ? `已导出：${fileNameOf(lastExport.filePath)} (${formatSize(lastExport.fileSize)})`
                : '尚未导出'}
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-md shadow-card">
          <div className="flex items-center gap-space-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-card bg-secondary-container">
              <Icon name="unarchive" size={22} className="text-secondary" />
            </span>
            <h2 className="text-headline-md text-on-surface">导入备份</h2>
          </div>

          {archivePath ? (
            <div className="flex items-center justify-between gap-space-sm rounded-card bg-surface-container p-space-md">
              <div className="flex min-w-0 items-center gap-space-xs">
                <Icon name="folder_zip" size={20} className="shrink-0 text-primary" />
                <span className="truncate font-mono text-label-code-md font-semibold text-on-surface">
                  {fileNameOf(archivePath)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setArchivePath(null);
                  setImportResult(null);
                }}
                className="rounded p-1 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
                title="重新选择"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePickArchive}
              className="flex flex-col items-center justify-center gap-space-xs rounded-card bg-surface-container-low p-space-xl text-center transition-all hover:bg-surface-container"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest">
                <Icon name="cloud_upload" size={28} className="text-primary" />
              </span>
              <span className="text-body-md font-semibold text-on-surface">选择 .zip 备份包</span>
            </button>
          )}

          <div className="mt-auto flex flex-col gap-space-sm">
            <Button
              variant="primary"
              size="sm"
              icon="restore"
              loading={importing}
              disabled={!archivePath || importing}
              onClick={handleImportBackup}
            >
              导入
            </Button>
            {importResult ? (
              <p className="font-mono text-label-code-sm text-on-surface-variant">
                {importResult.message}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
