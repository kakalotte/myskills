import { Icon } from '../../components/ui/Icon';

function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded-control bg-surface-container px-1 py-0.5 font-mono text-on-surface">
      {children}
    </code>
  );
}

const assetHighlights = [
  {
    title: '属于你',
    description: <>保存在 <InlineCode>~/.myskills/store</InlineCode>，不上传、不共享、不需要账号；</>,
  },
  {
    title: '可打磨',
    description: '随时编辑内容，已有的 frontmatter 字段会原样保留，不会被工具改写；',
  },
  {
    title: '可复用',
    description: '装到 WorkBuddy、Claude Code、Cursor、Codex 等任意 Agent，甚至只装到某个项目里；',
  },
  {
    title: '可携带',
    description: '整个库可导出为 ZIP，换电脑、换 Agent、重装系统后导入即用。',
  },
];

const capabilities = [
  {
    icon: 'link',
    title: '一处维护，处处可用',
    description:
      '中央库（~/.myskills/store）是唯一可写源。安装时优先建立符号链接，系统不允许时自动回退为副本，并明确告诉你当前用的是哪种方式。',
  },
  {
    icon: 'hub',
    title: '覆盖主流 Agent',
    description:
      '内置 46 个 Agent 目录适配：WorkBuddy、Claude Code、Cursor、Codex、GitHub Copilot、Gemini CLI、OpenCode、Windsurf、Trae 等。新增 Agent 只需维护一份路径表。',
  },
  {
    icon: 'layers',
    title: '全局与项目双作用域',
    description:
      '同一个 Skill 可以装到全局，也可以只装进某个项目。项目作用域优先，绝不会悄悄覆盖同名技能；遇到同名项会先询问，确认后才替换。',
  },
  {
    icon: 'shield',
    title: '安全兜底',
    description:
      '副本安装带 SHA-256 指纹，内容被改过会拒绝盲删；强制移除会把副本移入回收目录。中央库原件永远不会被卸载删除。',
  },
  {
    icon: 'inventory_2',
    title: '组合分发与备份',
    description: '把多个 Skill 打包成「组合」，一键分发到任意 Agent；整个库可导出为 ZIP，随时迁移或恢复。',
  },
  {
    icon: 'wifi_off',
    title: '完全本地，不联网',
    description: '无账号、无遥测、无上传。所有数据只在你自己的磁盘上。',
  },
  {
    icon: 'dark_mode',
    title: '跨平台 + 深色主题',
    description:
      '基于 Tauri 2，支持 Windows、macOS、Linux；提供浅色 / 深色 / 跟随系统三种主题，设置保存在本地。',
  },
];

export function SettingsAboutPage() {
  const githubUrl = 'https://github.com/kakalotte/myskills';

  return (
    <>
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

      <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-xl shadow-card">
        <div className="flex items-center gap-space-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-primary-fixed">
            <Icon name="lightbulb" size={22} className="text-primary" />
          </span>
          <h2 className="text-headline-md text-on-surface">把个人经验，变成可复用的私有 Skill 资产</h2>
        </div>

        <div className="flex flex-col gap-space-sm text-body-md leading-relaxed text-on-surface-variant">
          <p>
            你踩过的坑、总结的排查套路、反复打磨的提示词、团队约定俗成的代码规范——这些不该只留在某一次聊天记录里，也不该只存在于你脑子里。
          </p>
          <p>
            在 mySkills 里，你可以直接新建并编辑 Skill，把个人经验写成一份 <InlineCode>SKILL.md</InlineCode>
            ，存进本地中央库。它从此变成一份<span className="font-semibold text-on-surface">私有 Skill 资产</span>：
          </p>
          <ul className="flex flex-col gap-space-xs">
            {assetHighlights.map((item) => (
              <li key={item.title} className="flex gap-space-sm">
                <Icon name="check" size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold text-on-surface">{item.title}</span>：{item.description}
                </span>
              </li>
            ))}
          </ul>
          <p>
            经验会过时，但资产不会丢。把每一次「这次我记住了」变成下一次开箱即用的 Skill，让个人能力真正沉淀下来。
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-space-md rounded-card bg-surface-container-lowest p-space-xl shadow-card">
        <div className="flex items-center gap-space-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-secondary-container">
            <Icon name="auto_awesome" size={22} className="text-secondary" />
          </span>
          <h2 className="text-headline-md text-on-surface">核心能力</h2>
        </div>

        <ul className="grid grid-cols-1 gap-space-md md:grid-cols-2">
          {capabilities.map((item) => (
            <li key={item.title} className="flex flex-col gap-space-xs rounded-card bg-surface-container-low p-space-md">
              <span className="flex items-center gap-space-xs text-headline-sm text-on-surface">
                <Icon name={item.icon} size={18} className="shrink-0 text-primary" />
                {item.title}
              </span>
              <p className="text-body-sm leading-relaxed text-on-surface-variant">{item.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
