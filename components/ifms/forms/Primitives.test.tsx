import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../../../store';
import type { User } from '../../../types';
import {
  FieldError,
  FieldHint,
  FieldRow,
  FormErrorBanner,
  FormGrid,
  FormSection,
  FormShell,
  FormSubmitState,
  PermissionGuard,
  RequiredMark,
  UnsavedChangesGuard,
} from './Primitives';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const logoutMock = vi.fn();
const hydrateAuthMock = vi.fn();

function makeUser(permissions: string[]): User {
  return {
    id: 'user-1',
    name: 'IFMS User',
    email: 'ifms@example.test',
    role: 'manager',
    permissions,
  };
}

beforeEach(() => {
  useAuthStore.setState({
    user: makeUser(['setup:write', 'reports:read']),
    isAuthenticated: true,
    isAuthReady: true,
    hydrateAuth: hydrateAuthMock,
    logout: logoutMock,
  });
});

describe('FormShell', () => {
  test('renders description, actions, width variant, and all status branches', () => {
    const { container, rerender } = render(
      <FormShell
        title="Tank Setup"
        description="Configure storage"
        status="loading"
        actions={<button type="button">Save</button>}
        wide
      >
        <span>Shell body</span>
      </FormShell>,
    );

    expect(screen.getByText('Tank Setup')).toBeInTheDocument();
    expect(screen.getByText('Configure storage')).toBeInTheDocument();
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(container.querySelector('.max-w-6xl')).not.toBeNull();

    rerender(
      <FormShell title="Tank Setup" status="success">
        <span>Shell body</span>
      </FormShell>,
    );
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.queryByText('Configure storage')).not.toBeInTheDocument();
    expect(container.querySelector('.max-w-5xl')).not.toBeNull();

    rerender(
      <FormShell title="Tank Setup" status="error">
        <span>Shell body</span>
      </FormShell>,
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();

    rerender(
      <FormShell title="Tank Setup" status="idle">
        <span>Shell body</span>
      </FormShell>,
    );
    expect(screen.queryByText('Syncing...')).not.toBeInTheDocument();
    expect(screen.queryByText('Committed')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });
});

describe('layout primitives', () => {
  test('renders section descriptions, grid spans, row columns, hints, errors, and required mark', () => {
    render(
      <FormSection title="Details" description="Capture required setup values">
        <FormGrid fullWidth>
          <span>Wide field</span>
        </FormGrid>
        <FormGrid>
          <span>Narrow field</span>
        </FormGrid>
        <FieldRow cols={3}>
          <span>Column field</span>
        </FieldRow>
        <FieldRow>
          <span>Default columns</span>
        </FieldRow>
        <FieldHint>Helpful hint</FieldHint>
        <FieldError message="Inline error" />
        <FieldError />
        <RequiredMark />
      </FormSection>,
    );

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Capture required setup values')).toBeInTheDocument();
    expect(screen.getByText('Wide field').closest('div')).toHaveClass('md:col-span-2');
    expect(screen.getByText('Narrow field').closest('div')).not.toHaveClass('md:col-span-2');
    expect(screen.getByText('Column field').closest('div')).toHaveClass('sm:grid-cols-3');
    expect(screen.getByText('Default columns').closest('div')).toHaveClass('sm:grid-cols-2');
    expect(screen.getByText('Helpful hint')).toBeInTheDocument();
    expect(screen.getByText('Inline error')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

describe('FormErrorBanner and FormSubmitState', () => {
  test('hides when show is false and renders default/custom messages when shown', () => {
    const { rerender } = render(<FormErrorBanner show={false} />);
    expect(screen.queryByText('Please fix the highlighted fields below.')).not.toBeInTheDocument();

    rerender(<FormErrorBanner show />);
    expect(screen.getByText('Please fix the highlighted fields below.')).toBeInTheDocument();

    rerender(<FormErrorBanner show message="Server validation failed" />);
    expect(screen.getByText('Server validation failed')).toBeInTheDocument();
  });

  test('switches submit label while loading', () => {
    const { rerender } = render(<FormSubmitState loading={false} label="Commit" />);
    expect(screen.getByText('Commit')).toBeInTheDocument();

    rerender(<FormSubmitState loading label="Commit" />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });
});

describe('PermissionGuard', () => {
  test('allows content when one required permission matches any mode', () => {
    render(
      <PermissionGuard permissions={['setup:write', 'audit:read']}>
        <button type="button">Edit</button>
      </PermissionGuard>,
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByTitle('Read-only access')).not.toBeInTheDocument();
  });

  test('allows content only when all permissions match all mode', () => {
    render(
      <PermissionGuard permissions={['setup:write', 'reports:read']} permissionMatch="all">
        <button type="button">Approve</button>
      </PermissionGuard>,
    );

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  test('blocks content, overlays read-only access, and renders fallback when permissions fail', () => {
    useAuthStore.setState({ user: makeUser(['reports:read']) });

    render(
      <PermissionGuard
        permissions={['setup:write', 'audit:write']}
        permissionMatch="all"
        fallback={<span>No write access</span>}
      >
        <button type="button">Restricted Save</button>
      </PermissionGuard>,
    );

    expect(screen.getByRole('button', { name: 'Restricted Save' })).toBeInTheDocument();
    expect(screen.getByTitle('Read-only access')).toBeInTheDocument();
    expect(screen.getByText('No write access')).toBeInTheDocument();
  });

  test('treats missing permissions as open access', () => {
    useAuthStore.setState({ user: null });

    render(
      <PermissionGuard>
        <span>Open content</span>
      </PermissionGuard>,
    );

    expect(screen.getByText('Open content')).toBeInTheDocument();
  });
});

function DirtyForm({ routeLinks = false }: { routeLinks?: boolean }) {
  const methods = useForm({ defaultValues: { note: '' } });
  return (
    <FormProvider {...methods}>
      <UnsavedChangesGuard />
      <input aria-label="Note" {...methods.register('note')} />
      {routeLinks && <Link to="/next">Next route</Link>}
    </FormProvider>
  );
}

describe('UnsavedChangesGuard', () => {
  test('does not block beforeunload while clean and blocks after the form becomes dirty', async () => {
    render(
      <MemoryRouter>
        <DirtyForm />
      </MemoryRouter>,
    );

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'changed' } });

    await waitFor(() => {
      const dirtyEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      expect(dirtyEvent.defaultPrevented).toBe(true);
    });
  });

  test('asks for confirmation on dirty route changes and restores previous path when rejected', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <MemoryRouter initialEntries={['/current']}>
        <Routes>
          <Route path="*" element={<DirtyForm routeLinks />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('link', { name: 'Next route' }));

    await waitFor(() =>
      expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave this page?'),
    );
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/current');
  });

  test('does not restore history when the dirty route change is accepted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <MemoryRouter initialEntries={['/current']}>
        <Routes>
          <Route path="*" element={<DirtyForm routeLinks />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('link', { name: 'Next route' }));

    await waitFor(() =>
      expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave this page?'),
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
  });
});
