import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AuthBrandPanel } from './AuthBrandPanel';
import { AuthCard } from './AuthCard';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';

afterEach(cleanup);

describe('auth shell components', () => {
  test('places brand and form panels inside labelled authentication landmarks', () => {
    render(
      <AuthShell
        brandPanel={<div>Brand content</div>}
        formPanel={<form aria-label="Sign in form">Form content</form>}
      />,
    );

    expect(screen.getByRole('main', { name: 'Authentication' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Product information panel' })).toHaveTextContent(
      'Brand content',
    );
    expect(screen.getByRole('region', { name: 'Authentication form panel' })).toHaveTextContent(
      'Form content',
    );
  });

  test('renders brand capabilities and only shows the demo banner in demo mode', () => {
    const { rerender } = render(<AuthBrandPanel />);

    expect(screen.getByText('ITEMBA-ENERGIES IFMS')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Platform capabilities' })).toBeInTheDocument();
    expect(screen.getByText('Shift reconciliation & variance control')).toBeInTheDocument();
    expect(screen.queryByText(/DEMO MODE/)).not.toBeInTheDocument();

    rerender(<AuthBrandPanel demoMode />);

    expect(screen.getByText(/DEMO MODE/)).toHaveTextContent('sandbox environment');
  });

  test('renders an auth card with title, subtitle, body, and optional footer', () => {
    render(
      <AuthCard
        title="Sign in"
        subtitle="Use your corporate account"
        footer={<a href="/forgot-password">Forgot password?</a>}
      >
        <button type="button">Continue</button>
      </AuthCard>,
    );

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Use your corporate account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
  });
});

function PasswordHarness({
  error,
  onChange = vi.fn(),
}: {
  error?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState('hunter2');
  return (
    <>
      <p id="password-help">At least 8 characters.</p>
      <PasswordField
        id="admin-password"
        label="Admin password"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        placeholder="Enter password"
        required
        minLength={8}
        autoComplete="new-password"
        describedBy="password-help"
        error={error}
      />
    </>
  );
}

describe('PasswordField', () => {
  test('wires labelling, validation metadata, and controlled changes', () => {
    const onChange = vi.fn();
    render(<PasswordHarness error="Password is too short." onChange={onChange} />);

    const input = screen.getByLabelText('Admin password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('minlength', '8');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'At least 8 characters. Password is too short.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Password is too short.');

    fireEvent.change(input, { target: { value: 'Sup3rSecret!' } });

    expect(onChange).toHaveBeenCalledWith('Sup3rSecret!');
    expect(input).toHaveValue('Sup3rSecret!');
  });

  test('toggles password visibility and pressed state', () => {
    render(<PasswordHarness />);

    const input = screen.getByLabelText('Admin password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    fireEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));

    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
