import { useEffect } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { BrandMark } from './components/layout/BrandMark';
import { Toaster } from './components/ui/Toaster';
import { Button } from './components/ui/Button';
import { Icon } from './components/ui/Icon';
import { AgentsPage } from './pages/AgentsPage';
import { BundleEditPage } from './pages/BundleEditPage';
import { BundleNewPage } from './pages/BundleNewPage';
import { BundlePage } from './pages/BundlePage';
import { HomePage } from './pages/HomePage';

import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsAboutPage } from './pages/settings/SettingsAboutPage';
import { SettingsAppearancePage } from './pages/settings/SettingsAppearancePage';
import { SettingsBackupPage } from './pages/settings/SettingsBackupPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsRootsPage } from './pages/settings/SettingsRootsPage';
import { SkillDetailPage } from './pages/SkillDetailPage';
import { SkillEditPage } from './pages/SkillEditPage';
import { SkillNewPage } from './pages/SkillNewPage';
import { useAppStore } from './store/app-store';

export function App() {
  const initialize = useAppStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<ProtectedLayout />}>
          <Route index element={<HomePage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="bundles" element={<BundlePage />} />
          <Route path="bundles/new" element={<BundleNewPage />} />
          <Route path="bundles/:bundleId/edit" element={<BundleEditPage />} />
          <Route path="bundles/:bundleId/distribute" element={<Navigate to="/bundles" replace />} />
          <Route path="backup" element={<Navigate to="/settings/backup" replace />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectsPage />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="roots" replace />} />
            <Route path="appearance" element={<SettingsAppearancePage />} />
            <Route path="roots" element={<SettingsRootsPage />} />
            <Route path="backup" element={<SettingsBackupPage />} />
            <Route path="about" element={<SettingsAboutPage />} />
          </Route>
          <Route path="skills/new" element={<SkillNewPage />} />
          <Route path="skills/:skillName" element={<SkillDetailPage />} />
          <Route path="skills/:skillName/edit" element={<SkillEditPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </HashRouter>
  );
}

function ProtectedLayout() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const loading = useAppStore((state) => state.loading);
  const fatal = useAppStore((state) => state.fatal);

  if (loading) return <BootSplash />;
  if (fatal) return <FatalScreen />;
  if (!bootstrap) return <BootSplash />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function BootSplash() {
  return (
    <div className="surface-grid flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={48} />
        <p className="text-body-md font-medium text-on-surface">本地管理个人 Skills，快捷部署到每个 Agent</p>
        <p className="flex items-center gap-1.5 font-mono text-[10px] text-on-surface-variant">
          <Icon name="progress_activity" size={12} className="animate-spin" />
          正在读取应用数据
        </p>
      </div>
    </div>
  );
}

function FatalScreen() {
  const fatal = useAppStore((state) => state.fatal);
  const initialize = useAppStore((state) => state.initialize);

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-card border border-error/25 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-container text-error">
            <Icon name="error" size={20} filled />
          </span>
          <div>
            <h1 className="text-headline-md font-semibold text-on-surface">无法启动本地服务</h1>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              {fatal?.message ?? '应用数据目录不可访问'}
            </p>
            {fatal?.detail ? (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-error-container/40 px-2 py-1 font-mono text-[10px] text-on-error-container">
                {fatal.detail}
              </pre>
            ) : null}
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
              请确认 ~/.myskills 可读写。浏览器预览请使用
              <span className="font-mono"> ?demo=1 </span>
              ，开发调试请运行
              <span className="font-mono"> npm run tauri:dev</span>。
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" icon="refresh" onClick={() => void initialize()}>
            重试
          </Button>
        </div>
      </div>
    </div>
  );
}
