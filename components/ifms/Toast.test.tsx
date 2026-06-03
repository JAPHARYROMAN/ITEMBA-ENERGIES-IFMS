import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastContainer } from './Toast';
import { useAppStore } from '../../store';

describe('ToastContainer', () => {
  beforeEach(() => {
    useAppStore.setState({
      toasts: [],
      removeToast: vi.fn((id: string) =>
        useAppStore.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
      ),
    });
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({ toasts: [] });
  });

  test('renders typed toast messages with action links', () => {
    useAppStore.setState({
      toasts: [
        {
          id: 'toast-1',
          message: 'Export ready',
          type: 'success',
          actionLabel: 'Verify Report',
          actionHref: '/verify/token',
        },
        { id: 'toast-2', message: 'Sync failed', type: 'error' },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByText('Export ready')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verify Report' })).toHaveAttribute('href', '/verify/token');
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
  });

  test('removes a toast when its close button is clicked', () => {
    useAppStore.setState({
      toasts: [{ id: 'toast-close', message: 'Dismiss me', type: 'info' }],
    });

    const { container } = render(<ToastContainer />);

    act(() => {
      fireEvent.click(container.querySelector('button')!);
    });

    expect(useAppStore.getState().removeToast).toHaveBeenCalledWith('toast-close');
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });
});
