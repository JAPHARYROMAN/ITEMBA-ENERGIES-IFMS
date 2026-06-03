import React from 'react';
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DipForm } from './DipForm';
import { ReconciliationForm } from './ReconciliationForm';
import { TankToTankTransferForm } from './TankToTankTransferForm';
import { StationToStationTransferForm } from './StationToStationTransferForm';
import { AdjustmentForm } from './AdjustmentForm';
import { ExpenseCategoryForm } from './ExpenseCategoryForm';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('../../lib/api/client', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('../../store', async (importActual) => {
  const actual = await importActual<typeof import('../../store')>();
  return {
    ...actual,
    useAppStore: () => ({ addToast: mocks.addToast }),
  };
});

function renderForm(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function byName(name: string) {
  const field = document.querySelector(`[name="${name}"]`);
  if (!field) throw new Error(`Could not find form field "${name}"`);
  return field as HTMLElement;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe('DipForm', () => {
  test('requires tank and volume before submitting', async () => {
    renderForm(<DipForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Record Dip/i }));

    await waitFor(() => expect(screen.getAllByText('Required')).toHaveLength(2));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  test('posts numeric dip measurements and handles cancel', async () => {
    const onSuccess = vi.fn();
    const onCancel = vi.fn();
    renderForm(<DipForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-1' } });
    fireEvent.change(byName('volume'), { target: { value: '1250.5' } });
    fireEvent.change(byName('waterLevel'), { target: { value: '4.2' } });
    fireEvent.change(byName('temperature'), { target: { value: '24.5' } });

    fireEvent.click(screen.getByRole('button', { name: /Record Dip/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('inventory/dips', {
        method: 'POST',
        body: {
          tankId: 'tank-1',
          volume: 1250.5,
          waterLevel: 4.2,
          temperature: 24.5,
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('posts a dip with blank optional measurements as undefined', async () => {
    renderForm(<DipForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-2' } });
    fireEvent.change(byName('volume'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Dip/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('inventory/dips', {
        method: 'POST',
        body: {
          tankId: 'tank-2',
          volume: 900,
          waterLevel: undefined,
          temperature: undefined,
        },
      }),
    );
  });

  test('shows pending and error states while recording dips', async () => {
    const pending = deferred<{ ok: boolean }>();
    mocks.apiFetch.mockReturnValueOnce(pending.promise);
    renderForm(<DipForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-3' } });
    fireEvent.change(byName('volume'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Dip/i }));

    expect(await screen.findByRole('button', { name: /Saving/i })).toBeDisabled();
    pending.resolve({ ok: true });
    await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith('Dip recorded successfully', 'success'));

    cleanup();
    mocks.apiFetch.mockRejectedValueOnce('offline');
    renderForm(<DipForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-4' } });
    fireEvent.change(byName('volume'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Dip/i }));

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith('Failed to record dip', 'error'),
    );
  });
});

describe('ReconciliationForm', () => {
  test('posts reconciliation with optional fields normalized', async () => {
    const onSuccess = vi.fn();
    renderForm(<ReconciliationForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Shift UUID/i), {
      target: { value: 'shift-1' },
    });
    fireEvent.change(byName('expectedVolume'), {
      target: { value: '1000' },
    });
    fireEvent.change(byName('actualVolume'), {
      target: { value: '995.5' },
    });
    fireEvent.change(byName('notes'), {
      target: { value: 'Calibration variance' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Reconciliation/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('inventory/reconciliations', {
        method: 'POST',
        body: {
          shiftId: 'shift-1',
          expectedVolume: 1000,
          actualVolume: 995.5,
          notes: 'Calibration variance',
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('posts reconciliation with optional shift and notes omitted', async () => {
    renderForm(<ReconciliationForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(byName('expectedVolume'), {
      target: { value: '500' },
    });
    fireEvent.change(byName('actualVolume'), {
      target: { value: '505' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Reconciliation/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('inventory/reconciliations', {
        method: 'POST',
        body: {
          shiftId: undefined,
          expectedVolume: 500,
          actualVolume: 505,
          notes: undefined,
        },
      }),
    );
  });
});

describe('transfer forms', () => {
  test('TankToTankTransferForm validates positive quantity and posts transfer', async () => {
    const onSuccess = vi.fn();
    renderForm(<TankToTankTransferForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/From Tank UUID/i), {
      target: { value: 'tank-a' },
    });
    fireEvent.change(screen.getByPlaceholderText(/To Tank UUID/i), {
      target: { value: 'tank-b' },
    });
    fireEvent.change(byName('quantity'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /^Transfer$/i }));

    expect(await screen.findByText(/Must be positive/i)).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    fireEvent.change(byName('quantity'), { target: { value: '50.25' } });
    fireEvent.click(screen.getByRole('button', { name: /^Transfer$/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('transfers/tank-to-tank', {
        method: 'POST',
        body: { fromTankId: 'tank-a', toTankId: 'tank-b', quantity: 50.25 },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('StationToStationTransferForm posts station transfer payload', async () => {
    const onSuccess = vi.fn();
    renderForm(<StationToStationTransferForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/From Tank UUID/i), {
      target: { value: 'station-a-tank' },
    });
    fireEvent.change(screen.getByPlaceholderText(/To Tank UUID/i), {
      target: { value: 'station-b-tank' },
    });
    fireEvent.change(byName('quantity'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /^Transfer$/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('transfers/station-to-station', {
        method: 'POST',
        body: { fromTankId: 'station-a-tank', toTankId: 'station-b-tank', quantity: 80 },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('transfer forms expose required validation and pending states', async () => {
    renderForm(<StationToStationTransferForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Transfer$/i }));
    await waitFor(() => expect(screen.getAllByText('Required')).toHaveLength(3));
    cleanup();

    const pending = deferred<{ ok: boolean }>();
    mocks.apiFetch.mockReturnValueOnce(pending.promise);
    renderForm(<TankToTankTransferForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/From Tank UUID/i), {
      target: { value: 'tank-a' },
    });
    fireEvent.change(screen.getByPlaceholderText(/To Tank UUID/i), {
      target: { value: 'tank-b' },
    });
    fireEvent.change(byName('quantity'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Transfer$/i }));

    expect(await screen.findByRole('button', { name: /Transferring/i })).toBeDisabled();
    pending.resolve({ ok: true });
    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith('Tank-to-tank transfer completed', 'success'),
    );
  });
});

describe('simple accounting forms', () => {
  test('AdjustmentForm posts normalized adjustment payload', async () => {
    const onSuccess = vi.fn();
    renderForm(<AdjustmentForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-1' } });
    fireEvent.change(byName('volumeDelta'), { target: { value: '-12.5' } });
    fireEvent.change(byName('reason'), { target: { value: 'spillage' } });
    fireEvent.change(byName('notes'), { target: { value: 'Observed spill at bay one' } });

    fireEvent.click(screen.getByRole('button', { name: /Submit Adjustment/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('adjustments', {
        method: 'POST',
        body: {
          tankId: 'tank-1',
          volumeDelta: -12.5,
          reason: 'spillage',
          notes: 'Observed spill at bay one',
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('ExpenseCategoryForm posts optional description as undefined when blank', async () => {
    const onSuccess = vi.fn();
    renderForm(<ExpenseCategoryForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(byName('code'), { target: { value: 'UTIL' } });
    fireEvent.change(byName('name'), {
      target: { value: 'Utilities' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('expense-categories', {
        method: 'POST',
        body: {
          code: 'UTIL',
          name: 'Utilities',
          description: undefined,
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('AdjustmentForm posts blank notes as undefined and surfaces API errors', async () => {
    renderForm(<AdjustmentForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-2' } });
    fireEvent.change(byName('volumeDelta'), { target: { value: '10' } });
    fireEvent.change(byName('reason'), { target: { value: 'other' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Adjustment/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('adjustments', {
        method: 'POST',
        body: {
          tankId: 'tank-2',
          volumeDelta: 10,
          reason: 'other',
          notes: undefined,
        },
      }),
    );

    cleanup();
    mocks.apiFetch.mockRejectedValueOnce(new Error('Adjustment approval queue unavailable'));
    renderForm(<AdjustmentForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Tank UUID/i), { target: { value: 'tank-3' } });
    fireEvent.change(byName('volumeDelta'), { target: { value: '-3' } });
    fireEvent.change(byName('reason'), { target: { value: 'meter_error' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Adjustment/i }));

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith(
        'Adjustment approval queue unavailable',
        'error',
      ),
    );
  });

  test('ExpenseCategoryForm validates required fields and posts descriptions when provided', async () => {
    const onSuccess = vi.fn();
    renderForm(<ExpenseCategoryForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));
    await waitFor(() => expect(screen.getAllByText('Required')).toHaveLength(2));
    expect(mocks.apiFetch).not.toHaveBeenCalled();

    fireEvent.change(byName('code'), { target: { value: 'SEC' } });
    fireEvent.change(byName('name'), { target: { value: 'Security' } });
    fireEvent.change(byName('description'), {
      target: { value: 'Guard and alarm monitoring costs' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Category/i }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith('expense-categories', {
        method: 'POST',
        body: {
          code: 'SEC',
          name: 'Security',
          description: 'Guard and alarm monitoring costs',
        },
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
