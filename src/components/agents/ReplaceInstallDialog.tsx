import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface ReplaceInstallDialogProps {
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation shown when installing over a same-name entry in an Agent workspace. */
export function ReplaceInstallDialog({
  pending = false,
  onCancel,
  onConfirm,
}: ReplaceInstallDialogProps) {
  return (
    <Modal open onOpenChange={(open) => !open && onCancel()} title="覆盖安装" size="sm">
      <div className="flex flex-col gap-space-md p-4">
        <p className="text-body-md text-on-surface">即将覆盖同名 skill</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="delete_forever"
            loading={pending}
            onClick={onConfirm}
          >
            覆盖安装
          </Button>
        </div>
      </div>
    </Modal>
  );
}
