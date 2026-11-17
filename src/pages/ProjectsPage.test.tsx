import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProjectsPage } from './ProjectsPage';
import { pickDirectory } from '../lib/platform';
import { useAppStore } from '../store/app-store';
import type { Bootstrap, Project, RootInfo } from '../lib/types';

vi.mock('../lib/platform', () => ({
  pickDirectory: vi.fn(),
}));

const project: Project = {
  id: 'proj-1',
  name: '演示项目',
  path: 'C:/projects/demo',
  addedAt: '2026-01-01T00:00:00.000Z',
};

const root: RootInfo = {
  id: 'project:proj-1:workbuddy',
  agentId: 'workbuddy',
  agentName: 'WorkBuddy',
  scope: 'project',
  projectId: project.id,
  projectName: project.name,
  path: 'C:/projects/demo/.workbuddy/skills',
  displayPath: 'C:/projects/demo/.workbuddy/skills',
  exists: true,
  authorized: true,
  skillCount: 2,
};

function bootstrapWith(projects: Project[], options: { roots?: RootInfo[] } = {}): Bootstrap {
  return {
    settings: {
      schemaVersion: 2,
      onboardingCompleted: true,
      theme: 'system',
      authorizedRoots: {},
      projects,
      activeScope: 'global',
      activeProjectId: null,
    },
    roots: options.roots ?? [],
    agents: [],
    centralStorePath: '/tmp/.myskills/store',
    centralStoreDisplay: '~/.myskills/store',
    appVersion: '0.1.0',
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function setup(projects: Project[] = [], options: Parameters<typeof bootstrapWith>[1] = {}) {
  const addProject = vi.fn<(name: string | undefined, path: string) => Promise<Project>>();
  addProject.mockImplementation(async () => {
    const current = useAppStore.getState().bootstrap;
    if (current) {
      useAppStore.setState({
        bootstrap: {
          ...current,
          settings: { ...current.settings, projects: [...current.settings.projects, project] },
        },
      } as never);
    }
    return project;
  });
  const removeProject = vi.fn<(projectId: string) => Promise<void>>();
  removeProject.mockImplementation(async (projectId) => {
    const current = useAppStore.getState().bootstrap;
    if (current) {
      useAppStore.setState({
        bootstrap: {
          ...current,
          settings: {
            ...current.settings,
            projects: current.settings.projects.filter((item) => item.id !== projectId),
          },
        },
      } as never);
    }
  });
  const refreshProject = vi.fn().mockResolvedValue(null);

  useAppStore.setState({
    bootstrap: bootstrapWith(projects, options),
    projectScans: {},
    projectScanning: {},
    projectScanErrors: {},
    refreshProject,
    addProject,
    removeProject,
    toasts: [],
  } as never);

  render(
    <MemoryRouter initialEntries={['/projects']}>
      <LocationProbe />
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return { addProject, removeProject, refreshProject };
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.mocked(pickDirectory).mockReset();
    vi.restoreAllMocks();
    useAppStore.setState({ bootstrap: null, toasts: [], projectScans: {}, projectScanning: {}, projectScanErrors: {} } as never);
  });

  it('registers the picked directory and selects the project module', async () => {
    const user = userEvent.setup();
    const { addProject } = setup();
    vi.mocked(pickDirectory).mockResolvedValue('C:/projects/demo');

    await user.click(screen.getByRole('button', { name: '添加项目' }));

    expect(pickDirectory).toHaveBeenCalledWith('选择项目根目录');
    expect(addProject).toHaveBeenCalledWith(undefined, 'C:/projects/demo');
    expect(screen.getByRole('heading', { name: '演示项目' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/projects/${encodeURIComponent(project.id)}`);
  });

  it('does nothing when the directory picker is cancelled', async () => {
    const user = userEvent.setup();
    const { addProject } = setup();
    vi.mocked(pickDirectory).mockResolvedValue(null);

    await user.click(screen.getByRole('button', { name: '添加项目' }));

    expect(addProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');
  });

  it('shows an error toast when registration fails', async () => {
    const user = userEvent.setup();
    const { addProject } = setup();
    vi.mocked(pickDirectory).mockResolvedValue('C:/projects/demo');
    addProject.mockRejectedValue(new Error('目录不可访问'));

    await user.click(screen.getByRole('button', { name: '添加项目' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/projects');
    expect(useAppStore.getState().toasts[0]).toMatchObject({
      tone: 'error',
      title: '添加项目失败',
      description: '目录不可访问',
    });
  });

  it('lists registered projects with their agent directory count', () => {
    setup([project], { roots: [root] });

    expect(screen.getAllByText('演示项目').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C:/projects/demo').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 个 Agent 目录/)).toBeInTheDocument();
  });

  it('selects a listed project and syncs route', async () => {
    const user = userEvent.setup();
    setup([project]);

    await user.click(screen.getByRole('button', { name: /演示项目/ }));

    expect(screen.getByTestId('location')).toHaveTextContent(`/projects/${encodeURIComponent(project.id)}`);
  });

  it('removes a project after confirmation', async () => {
    const user = userEvent.setup();
    const { removeProject } = setup([project]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await user.click(screen.getByRole('button', { name: '删除' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(removeProject).toHaveBeenCalledWith(project.id);
  });

  it('keeps the project when removal is cancelled', async () => {
    const user = userEvent.setup();
    const { removeProject } = setup([project]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await user.click(screen.getByRole('button', { name: '删除' }));

    expect(removeProject).not.toHaveBeenCalled();
  });
});
