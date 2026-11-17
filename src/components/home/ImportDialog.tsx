import { useState } from 'react';
import { useAppStore } from '../../store/app-store';
import type { ScopeKind, SkillView } from '../../lib/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

interface ImportDialogProps {
  skill: SkillView | null;
  context?: { scope: ScopeKind; projectId?: string | null };
  onClose: () => void;
}

export function ImportDialog({ skill, context, onClose }: ImportDialogProps) {
  const importSkill = useAppStore((state) => state.importSkill);
  const pushToast = useAppStore((state) => state.pushToast);
  const centralStore = useAppStore((state) => state.bootstrap?.centralStoreDisplay);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!skill) return;
    setBusy(true);
    try {
      await importSkill({
        skillName: skill.name,
        scope: context?.scope ?? 'global',
        projectId: context?.projectId ?? null,
      });
      onClose();
    } catch (error) {
      pushToast({
        tone: 'error',
        title: '纳入中央库失败',
        description: (error as { message?: string }).message ?? String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(skill)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="纳入中央库"
      size="lg"
      dismissible={!busy}
    >
      <div className="flex items-start gap-2.5 px-4 py-4 pr-12">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary-fixed text-primary">
          <Icon name="archive" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-headline-md font-semibold text-on-surface">纳入中央库</h2>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            复制到中央库，原文件保持不变。纳入后可编辑并分发。
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="rounded-card border border-outline-variant/40 bg-surface-container-low/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body-md font-semibold text-on-surface">{skill?.name}</p>
              <p className="truncate font-mono text-[11px] text-on-surface-variant">
                {skill?.dirName}
              </p>
            </div>
            <span className="shrink-0 rounded bg-error-container px-1.5 py-px font-mono text-[10px] text-on-error-container">
              外部只读
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1 text-[11px]">
            <PathRow icon="dns" label="来源" value={skill?.displayPath ?? ''} />
            <PathRow icon="inventory_2" label="目标" value={`${centralStore}/${skill?.dirName}`} />
          </div>
        </div>

        <div className="flex items-start gap-1.5 rounded-control bg-secondary-container/35 px-2.5 py-2 text-[11px] leading-4 text-on-secondary-container">
          <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
          复制后会重新扫描；同名技能会被阻止，不覆盖。
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-outline-variant/30 bg-surface-container-low/40 px-4 py-2.5">
        <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button variant="primary" size="sm" icon="archive" loading={busy} onClick={() => void confirm()}>
          {busy ? '正在复制' : '纳入中央库'}
        </Button>
      </div>
    </Modal>
  );
}

function PathRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon name={icon} size={13} className="shrink-0 text-outline" />
      <span className="w-8 shrink-0 text-on-surface-variant">{label}</span>
      <span className="truncate font-mono text-[11px] text-on-surface">{value}</span>
    </div>
  );
}
