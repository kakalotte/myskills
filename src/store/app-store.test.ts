import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/bridge';
import type { Bootstrap, MountOutcome, ScanResult } from '../lib/types';

vi.mock('../lib/bridge', async () => {
  const actual = await vi.importActual<typeof import('../lib/bridge')>('../lib/bridge');
  return {
    ...actual,
    api: {
      bootstrap: vi.fn(),
      authorizeRoot: vi.fn(),
      registerProject: vi.fn(),
      removeProject: vi.fn(),
      scanSkills: vi.fn(),
      previewSkill: vi.fn(),
      installSkill: vi.fn(),
      uninstallSkill: vi.fn(),
      importSkill: vi.fn(),
    },
  };
});

import { useAppStore } from './app-store';

const bootstrap: Bootstrap = {
  settings: {
    schemaVersion: 2,
    onboardingCompleted: true,
    theme: 'system',
    authorizedRoots: { 'agent:workbuddy:global': true },
    projects: [],
    customAgents: [],
    activeScope: 'global',
    activeProjectId: null,
  },
  roots: [
    {
      id: 'agent:workbuddy:global',
      agentId: 'workbuddy',
      agentName: 'WorkBuddy',
      scope: 'global',
      projectId: null,
      projectName: null,
      path: 'C:/Users/demo/.workbuddy/skills',
      displayPath: '~/.workbuddy/skills',
      exists: true,
      authorized: true,
      skillCount: 0,
      isCustom: false,
      iconSrc: null,
    },
  ],
  agents: [{ id: 'workbuddy', name: 'WorkBuddy', icon: 'robot', accent: 'secondary' }],
  centralStorePath: 'C:/Users/demo/.myskills/store',
  centralStoreDisplay: '~/.myskills/store',
  appVersion: '0.1.0',
};

const scan: ScanResult = {
  skills: [],
  roots: bootstrap.roots,
  stats: {
    skillCount: 0,
    externalCount: 0,
    installedMounts: 0,
    conflictCount: 0,
    agentCount: 1,
    authorizedRootCount: 1,
    rootCount: 1,
  },
  diff: { firstScan: false, added: [], removed: [], changed: [] },
  centralStoreDisplay: '~/.myskills/store',
  scannedAt: '2026-11-09T10:00:00Z',
  scope: 'global',
  activeProjectId: null,
};

const mountOutcome: MountOutcome = {
  skillName: 'weekly-menu',
  agentId: 'workbuddy',
  action: 'install',
  mountType: 'copy',
  targetDisplay: '~/.workbuddy/skills/weekly-menu',
  alreadyInstalled: false,
  message: '系统未允许创建符号链接，已自动降级为副本',
  replaced: false,
  replacedDisplay: null,
};

describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({
      bootstrap: null,
      loading: true,
      fatal: null,
      globalScan: null,
      globalScanning: false,
      globalScanError: null,
      projectScans: {},
      projectScanning: {},
      projectScanErrors: {},
      toasts: [],
    });
    vi.mocked(api.bootstrap).mockResolvedValue(bootstrap);
    vi.mocked(api.scanSkills).mockResolvedValue(scan);
  });

  it('initializes with real bootstrap data and scans global automatically', async () => {
    await useAppStore.getState().initialize();
    const state = useAppStore.getState();
    expect(state.bootstrap?.centralStoreDisplay).toBe('~/.myskills/store');
    expect(state.globalScan?.stats.skillCount).toBe(0);
    expect(state.loading).toBe(false);
    expect(api.scanSkills).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('surfaces a fatal error when the desktop bridge is unavailable', async () => {
    vi.mocked(api.bootstrap).mockRejectedValue({
      code: 'NO_BRIDGE',
      message: '无法连接本地服务',
    });
    await useAppStore.getState().initialize();
    expect(useAppStore.getState().fatal?.code).toBe('NO_BRIDGE');
    expect(useAppStore.getState().loading).toBe(false);
  });

  it('announces copy fallback after an install and rescans context', async () => {
    useAppStore.setState({ bootstrap, loading: false });
    vi.mocked(api.installSkill).mockResolvedValue(mountOutcome);
    const outcome = await useAppStore
      .getState()
      .install({ skillName: 'weekly-menu', agentId: 'workbuddy', scope: 'global' }, 'WorkBuddy');
    expect(outcome.mountType).toBe('copy');
    expect(api.installSkill).toHaveBeenCalledWith({
      skillName: 'weekly-menu',
      agentId: 'workbuddy',
      scope: 'global',
    });
    expect(api.scanSkills).toHaveBeenCalledWith({ scope: 'global' });
    const toasts = useAppStore.getState().toasts;
    expect(toasts.at(-1)?.title).toContain('副本');
    expect(toasts.at(-1)?.tone).toBe('warning');
  });

  it('rejects with COPY_MODIFIED so the card can ask for confirmation', async () => {
    useAppStore.setState({ bootstrap, loading: false });
    vi.mocked(api.uninstallSkill).mockRejectedValue({
      code: 'COPY_MODIFIED',
      message: '副本内容已被外部修改',
    });
    await expect(
      useAppStore
        .getState()
        .uninstall(
          { skillName: 'weekly-menu', agentId: 'workbuddy', scope: 'global', force: false },
          'WorkBuddy',
        ),
    ).rejects.toMatchObject({ code: 'COPY_MODIFIED' });
    expect(api.uninstallSkill).toHaveBeenCalledWith({
      skillName: 'weekly-menu',
      agentId: 'workbuddy',
      scope: 'global',
      force: false,
    });
  });
});
