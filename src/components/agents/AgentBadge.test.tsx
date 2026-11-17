import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentBadge } from './AgentBadge';
import type { AgentBadge as AgentBadgeType } from '../../lib/types';

const base: AgentBadgeType = {
  agentId: 'workbuddy',
  agentName: 'WorkBuddy',
  rootId: 'agent:workbuddy:global',
  scope: 'global',
  state: 'available',
  mountType: null,
  targetPath: 'C:/Users/demo/.workbuddy/skills/weekly-menu',
  targetDisplay: '~/.workbuddy/skills/weekly-menu',
  authorized: true,
  rootExists: true,
  detail: null,
};

function renderBadge(badge: AgentBadgeType) {
  const onInstall = vi.fn();
  const onUninstall = vi.fn();
  const onReplace = vi.fn();
  render(
    <AgentBadge
      badge={badge}
      pending={false}
      onInstall={onInstall}
      onReplace={onReplace}
      onUninstall={onUninstall}
    />,
  );
  return { onInstall, onUninstall, onReplace };
}

describe('AgentBadge', () => {
  it('installs an available badge', async () => {
    const user = userEvent.setup();
    const { onInstall, onUninstall } = renderBadge(base);
    await user.click(screen.getByRole('button', { name: 'WorkBuddy：未安装' }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onUninstall).not.toHaveBeenCalled();
  });

  it('uninstalls an installed symlink badge', async () => {
    const user = userEvent.setup();
    const { onUninstall } = renderBadge({
      ...base,
      state: 'installed',
      mountType: 'symlink',
      detail: '符号链接安装',
    });
    await user.click(screen.getByRole('button', { name: 'WorkBuddy：已安装' }));
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before replacing a same-name entry', async () => {
    const user = userEvent.setup();
    const { onInstall, onUninstall, onReplace } = renderBadge({
      ...base,
      state: 'conflict',
      detail: '目标目录已存在同名项，可覆盖安装',
    });
    const button = screen.getByRole('button', { name: 'WorkBuddy：未安装' });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(screen.getByText('即将覆盖同名 skill')).toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /覆盖安装/ }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onUninstall).not.toHaveBeenCalled();
  });

  it('keeps locked roots non-interactive', async () => {
    const user = userEvent.setup();
    const { onInstall, onReplace } = renderBadge({
      ...base,
      state: 'locked',
      detail: '目录未授权，暂不可分发',
    });
    const button = screen.getByRole('button', { name: 'WorkBuddy：未授权' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onInstall).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('shows a copy marker for copy mounts', () => {
    renderBadge({ ...base, state: 'installed', mountType: 'copy', detail: '副本安装' });
    const button = screen.getByRole('button', { name: 'WorkBuddy：已安装' });
    expect(button).toHaveAttribute('title', expect.stringContaining('副本'));
  });
});
