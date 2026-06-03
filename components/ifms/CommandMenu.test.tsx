import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandMenu } from './CommandMenu';
import { useAppStore } from '../../store';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

describe('CommandMenu', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useAppStore.setState({ isSearchOpen: false });
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({ isSearchOpen: false });
  });

  test('stays hidden until the global shortcut opens it', async () => {
    render(<CommandMenu />);

    expect(screen.queryByPlaceholderText('Type a module or report name...')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(await screen.findByPlaceholderText('Type a module or report name...')).toBeInTheDocument();
    expect(screen.getByText('Enterprise Command Palette')).toBeInTheDocument();
  });

  test('filters modules and navigates to the selected result', async () => {
    useAppStore.setState({ isSearchOpen: true });
    render(<CommandMenu />);

    const input = screen.getByPlaceholderText('Type a module or report name...');
    fireEvent.change(input, { target: { value: 'station' } });

    const stationResult = screen.getByRole('button', { name: /Stations System Setup/i });
    fireEvent.click(stationResult);

    expect(navigateMock).toHaveBeenCalledWith('/app/setup/stations');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Type a module or report name...')).not.toBeInTheDocument();
    });
  });

  test('shows an empty state for unmatched queries and closes on Escape', () => {
    useAppStore.setState({ isSearchOpen: true });
    render(<CommandMenu />);

    fireEvent.change(screen.getByPlaceholderText('Type a module or report name...'), {
      target: { value: 'no-such-module' },
    });

    expect(screen.getByText('No matching modules found')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('No matching modules found')).not.toBeInTheDocument();
  });
});
