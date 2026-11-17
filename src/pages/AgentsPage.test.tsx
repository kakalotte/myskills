import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AgentsPage } from './AgentsPage';
import { useAppStore } from '../store/app-store';
import type {
  AgentBadge,
  Bootstrap,
  MountOutcome,
  RootInfo,
  ScanResult,
  SkillView,
} from '../lib/types';

const claudeRoot: RootInfo = {
  id: 'agent:claude_code:global',
  agentId: 'claude_code',
  agentName: 'Claude Code',
  scope: 'global',
  projectId: null,
  projectName: null,
  path: '/demo/home/.claude/skills',
  displayPath: '~/.claude/skills',
  exists: true,
  authorized: true,
  skillCount: 0,
};

const workbuddyRoot: RootInfo = {
  ...claudeRoot,
  id: 'agent:workbuddy:global',
  agentId: 'workbuddy',
  agentName: 'WorkBuddy',
  path: '/demo/home/.workbuddy/skills',
  displayPath: '~/.workbuddy/skills',
};

const unauthorizedRoot: RootInfo = {
  ...claudeRoot,
  id: 'agent:cursor:global',
  agentId: 'cursor',
  agentName: 'Cursor',
  authorized: false,
};

const missingRoot: RootInfo = {
  ...claudeRoot,
  id: 'agent:codex:global',
  agentId: 'codex',
  agentName: 'Codex',
  exists: false,
};

function badgeFor(
  root: RootInfo,
  state: AgentBadge['state'] = 'available',
  mountType: AgentBadge['mountType'] = null,
): AgentBadge {
  return {
    agentId: root.agentId,
    agentName: root.agentName,
    rootId: root.id,
    scope: 'global',
    state,
    mountType,
    targetPath: `${root.path}/weekly-menu`,
    targetDisplay: `${root.displayPath}/weekly-menu`,
    authorized: root.authorized,
    rootExists: root.exists,
    detail: null,
  };
}

function skillWith(badges: AgentBadge[]): SkillView {
  return {
    id: 'weekly-menu',
    name: 'weekly-menu',
    dirName: 'weekly-menu',
    description: '生成一周家庭菜单并汇总采购清单。',
    source: 'builtin',
    version: null,
    path: '/demo/store/weekly-menu',
    displayPath: '~/.myskills/store/weekly-menu',
    isExternal: false,
    occurrences: [],
    badges,
  };
}

function scanWith(skills: SkillView[], roots: RootInfo[]): ScanResult {
  return {
    skills,
    roots,
    stats: {
      skillCount: skills.length,
      externalCount: 0,
      installedMounts: 0,
      conflictCount: 0,
      agentCount: roots.length,
      authorizedRootCount: 2,
      rootCount: roots.length,
    },
    diff: { firstScan: false, added: [], removed: [], changed: [] },
    centralStoreDisplay: '~/.myskills/store',
    scannedAt: '2026-11-15T05:00:00.000Z',
    scope: 'global',
    activeProjectId: null,
  };
}

const bootstrap: Bootstrap = {
  settings: {
    schemaVersion: 2,
    onboardingCompleted: true,
    theme: 'system',
    authorizedRoots: {},
    projects: [],
    activeScope: 'global',
    activeProjectId: null,
  },
  roots: [claudeRoot, workbuddyRoot, unauthorizedRoot, missingRoot],
  agents: [],
  centralStorePath: '/demo/.myskills/store',
  centralStoreDisplay: '~/.myskills/store',
  appVersion: '0.1.0',
};

function setup(skill: SkillView = skillWith([badgeFor(claudeRoot), badgeFor(workbuddyRoot)])) {
  const install = vi.fn<(payload: unknown, agentName: string) => Promise<MountOutcome>>();
  install.mockResolvedValue({
    skillName: 'weekly-menu',
    agentId: 'claude_code',
    action: 'install',
    mountType: 'symlink',
    targetDisplay: '~/.claude/skills/weekly-menu',
    alreadyInstalled: false,
    message: 'ok',
    replaced: false,
    replacedDisplay: null,
  });
  const uninstall = vi.fn<(payload: unknown, agentName: string) => Promise<MountOutcome>>();
  uninstall.mockResolvedValue({
    skillName: 'weekly-menu',
    agentId: 'claude_code',
    action: 'uninstall',
    mountType: 'symlink',
    targetDisplay: '~/.claude/skills/weekly-menu',
    alreadyInstalled: false,
    message: 'ok',
    replaced: false,
    replacedDisplay: null,
  });

  useAppStore.setState({
    bootstrap,
    globalScan: scanWith([skill], bootstrap.roots),
    globalScanning: false,
    globalScanError: null,
    install,
    uninstall,
    toasts: [],
  } as never);

  render(
    <MemoryRouter initialEntries={['/agents']}>
      <AgentsPage />
    </MemoryRouter>,
  );

  return { install, uninstall };
}

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({ bootstrap: null, globalScan: null, toasts: [] });
  });

  it('lists only authorized global Agents that exist on disk', () => {
    setup();

    expect(screen.getByRole('button', { name: /^Claude Code$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^WorkBuddy$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cursor$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Codex$/ })).not.toBeInTheDocument();
  });

  it('installs into the selected Agent from the card button', async () => {
    const user = userEvent.setup();
    const { install } = setup();

    await user.click(screen.getByRole('button', { name: 'Claude Code：安装' }));

    expect(install).toHaveBeenCalledWith(
      {
        skillName: 'weekly-menu',
        agentId: 'claude_code',
        scope: 'global',
        projectId: null,
        force: false,
      },
      'Claude Code',
    );
  });

  it('retargets the install button when another Agent is selected', async () => {
    const user = userEvent.setup();
    const { install } = setup();

    await user.click(screen.getByRole('button', { name: /^WorkBuddy$/ }));
    await user.click(screen.getByRole('button', { name: 'WorkBuddy：安装' }));

    expect(install).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'workbuddy', scope: 'global' }),
      'WorkBuddy',
    );
    expect(screen.queryByRole('button', { name: 'Claude Code：安装' })).not.toBeInTheDocument();
  });

  it('shows the active mount mode and uninstalls from the card button', async () => {
    const user = userEvent.setup();
    const { uninstall } = setup(
      skillWith([badgeFor(claudeRoot, 'installed', 'symlink'), badgeFor(workbuddyRoot)]),
    );

    const button = screen.getByRole('button', { name: 'Claude Code：已安装' });
    await user.click(button);

    expect(uninstall).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'claude_code', force: false }),
      'Claude Code',
    );
  });

  it('asks before replacing a same-name entry, then installs with force', async () => {
    const user = userEvent.setup();
    const { install } = setup(
      skillWith([badgeFor(claudeRoot, 'conflict'), badgeFor(workbuddyRoot)]),
    );

    await user.click(screen.getByRole('button', { name: 'Claude Code：安装' }));
    expect(install).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /覆盖安装/ }));

    expect(install).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'claude_code', force: true }),
      'Claude Code',
    );
  });

  it('cancelling the replace dialog keeps the target untouched', async () => {
    const user = userEvent.setup();
    const { install } = setup(
      skillWith([badgeFor(claudeRoot, 'conflict'), badgeFor(workbuddyRoot)]),
    );

    await user.click(screen.getByRole('button', { name: 'Claude Code：安装' }));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(install).not.toHaveBeenCalled();
    expect(screen.queryByText('即将覆盖同名 skill')).not.toBeInTheDocument();
  });
});
