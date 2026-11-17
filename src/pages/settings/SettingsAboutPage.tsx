import { Icon } from '../../components/ui/Icon';

export function SettingsAboutPage() {
  const githubUrl = 'https://github.com/kakalotte/myskills';

  return (
    <section className="flex flex-col items-center gap-space-lg rounded-card bg-surface-container-lowest p-space-xl shadow-card">
      <div className="flex flex-col items-center gap-space-md text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-card bg-surface-container-low">
          <img src="/logo/logo.svg" alt="" aria-hidden="true" className="h-10 w-10" draggable={false} />
        </span>
        <div className="flex flex-col items-center gap-space-xs">
          <h2 className="text-headline-lg tracking-tight text-on-surface">mySkills Desktop</h2>
          <p className="max-w-md text-body-md leading-relaxed text-on-surface-variant">
            本地管理个人 Skills，快捷部署到每个 Agent
          </p>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-space-sm py-space-2xs text-label-code-sm text-[var(--color-primary,#2563eb)] transition-colors hover:bg-surface-container-high"
          >
            <Icon name="open_in_new" size={14} />
            {githubUrl}
          </a>
        </div>
      </div>
    </section>
  );
}
