import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { useAppStore } from '../store';

const realtimeMocks = vi.hoisted(() => ({
  useRealtimeNotifications: vi.fn(),
}));

vi.mock('../lib/hooks/useRealtimeNotifications', () => realtimeMocks);
vi.mock('./Sidebar', async () => {
  const React = await import('react');
  return { default: () => React.createElement('span', null, 'Sidebar sentinel') };
});
vi.mock('./Header', async () => {
  const React = await import('react');
  return { default: () => React.createElement('span', null, 'Header sentinel') };
});
vi.mock('./AiCommandPanel', async () => {
  const React = await import('react');
  return { default: () => React.createElement('span', null, 'AI panel sentinel') };
});

afterEach(cleanup);

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/app/dashboard']}>
      <Routes>
        <Route path="/app" element={<Layout />}>
          <Route path="dashboard" element={<h1>Dashboard outlet</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ sidebarCollapsed: false });
});

describe('Layout', () => {
  test('renders the shell frame, outlet, command panel, and realtime hook', () => {
    renderLayout();

    expect(screen.getByText('Sidebar sentinel')).toBeInTheDocument();
    expect(screen.getByText('Header sentinel')).toBeInTheDocument();
    expect(screen.getByText('AI panel sentinel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard outlet' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(realtimeMocks.useRealtimeNotifications).toHaveBeenCalledTimes(1);
  });

  test('uses expanded and collapsed sidebar offsets from the app store', () => {
    const { unmount } = renderLayout();

    expect(screen.getByRole('main').parentElement).toHaveClass('ml-64');

    unmount();
    useAppStore.setState({ sidebarCollapsed: true });
    renderLayout();

    expect(screen.getByRole('main').parentElement).toHaveClass('ml-20');
  });
});
