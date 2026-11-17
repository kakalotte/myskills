import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAppStore } from '../../store/app-store';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function Layout() {
  return (
    <>
      <Sidebar />
      <Outlet />
    </>
  );
}

function setup(initialEntry = '/') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>技能库页面</div>} />
          <Route path="/agents" element={<div>Agent页面</div>} />
          <Route path="/bundles" element={<div>组合页面</div>} />
          <Route path="/projects" element={<div>项目页面</div>} />
          <Route path="/settings/roots" element={<div>设置页面</div>} />
          <Route path="/settings/policy" element={<div>设置页面</div>} />
          <Route path="/settings/audit" element={<div>设置页面</div>} />
          <Route path="/settings/backup" element={<div>设置页面</div>} />
          <Route path="/settings/about" element={<div>设置页面</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Sidebar navigation', () => {
  beforeEach(() => {
    useAppStore.setState({ bootstrap: null, toasts: [] });
  });

  it('marks the library item active on the root route', () => {
    setup('/');
    expect(screen.getByRole('link', { name: '技能库' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Agent' })).not.toHaveAttribute('aria-current');
  });

  it('navigates to agents module', async () => {
    const user = userEvent.setup();
    setup('/');
    await user.click(screen.getByRole('link', { name: 'Agent' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/agents');
    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to projects module', async () => {
    const user = userEvent.setup();
    setup('/');
    await user.click(screen.getByRole('link', { name: '项目' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');
    expect(screen.getByRole('link', { name: '项目' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to bundles', async () => {
    const user = userEvent.setup();
    setup('/');
    await user.click(screen.getByRole('link', { name: '组合' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/bundles');
    expect(screen.getByRole('link', { name: '组合' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to settings', async () => {
    const user = userEvent.setup();
    setup('/');
    await user.click(screen.getByRole('link', { name: '设置' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/roots');
  });
});
