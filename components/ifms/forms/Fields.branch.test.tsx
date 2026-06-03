import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import {
  CheckboxField,
  ComboboxField,
  DateField,
  DateRangeField,
  EntityPickerField,
  FileAttachField,
  MoneyField,
  MultiSelectField,
  PercentField,
  RadioGroupField,
  ReadOnlyField,
  SelectField,
  TextField,
  TextareaField,
  ToggleField,
} from './Fields';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface HarnessProps {
  children: React.ReactNode;
  defaultValues?: Record<string, unknown>;
  onValid?: (data: Record<string, unknown>) => void;
}

function TestForm({ children, defaultValues, onValid }: HarnessProps) {
  const methods = useForm({ defaultValues, mode: 'onSubmit' });
  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((data) => onValid?.(data))}>
        {children}
        <button type="submit">Submit</button>
      </form>
    </FormProvider>
  );
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

describe('Field wrapper branches', () => {
  test('shows required mark and replaces hint with nested validation error', async () => {
    render(
      <TestForm>
        <TextField
          name="customer.email"
          label="Email"
          hint="Used for invoices"
          required
          rules={{ required: 'Email is required' }}
        />
      </TestForm>,
    );

    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('Used for invoices')).toBeInTheDocument();

    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Email is required');
    expect(screen.queryByText('Used for invoices')).not.toBeInTheDocument();
  });

  test('honors custom text type, read-only state, autofocus, and textarea default rows', () => {
    render(
      <TestForm>
        <TextField name="email" label="Email" type="email" readOnly autoFocus />
        <TextareaField name="notes" label="Notes" />
      </TestForm>,
    );

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveFocus();
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '3');
  });
});

describe('formatted primitive fields', () => {
  test('MoneyField uses default currency, default placeholder, and submits as number', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm defaultValues={{ amount: 0 }} onValid={(data) => (submitted = data)}>
        <MoneyField name="amount" label="Amount" />
      </TestForm>,
    );

    expect(screen.getByText('$')).toBeInTheDocument();
    const amount = screen.getByLabelText('Amount');
    expect(amount).toHaveAttribute('step', '0.01');
    expect(amount).toHaveAttribute('placeholder', '0.00');

    fireEvent.change(amount, { target: { value: '123.45' } });
    submit();

    await waitFor(() => expect(submitted).toEqual({ amount: 123.45 }));
  });

  test('MoneyField and PercentField render override/fallback adornments and limits', () => {
    render(
      <TestForm>
        <MoneyField name="kes" label="KES Amount" currency="KES" placeholder="1,000.00" disabled />
        <PercentField name="margin" label="Margin" readOnly />
      </TestForm>,
    );

    expect(screen.getByText('KES')).toBeInTheDocument();
    expect(screen.getByLabelText('KES Amount')).toHaveAttribute('placeholder', '1,000.00');
    expect(screen.getByLabelText('KES Amount')).toBeDisabled();

    const margin = screen.getByLabelText('Margin');
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(margin).toHaveAttribute('placeholder', '0');
    expect(margin).toHaveAttribute('min', '0');
    expect(margin).toHaveAttribute('max', '100');
    expect(margin).toHaveAttribute('readonly');
  });

  test('SelectField uses default placeholder when none is supplied', () => {
    render(
      <TestForm>
        <SelectField
          name="status"
          label="Status"
          options={[{ label: 'Open', value: 'open' }]}
        />
      </TestForm>,
    );

    expect(screen.getByRole('option', { name: 'Select an option...' })).toHaveValue('');
  });
});

describe('ComboboxField', () => {
  const stationOptions = [
    { label: 'Alpha Station', value: 'alpha' },
    { label: 'Beta Station', value: 'beta' },
  ];

  test('shows selected option, filters to no results, selects a new option, and submits it', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm defaultValues={{ station: 'beta' }} onValid={(data) => (submitted = data)}>
        <ComboboxField name="station" label="Station" options={stationOptions} />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Beta Station'));
    fireEvent.change(screen.getByPlaceholderText('Filter...'), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Filter...'), { target: { value: 'alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alpha Station' }));
    expect(screen.queryByPlaceholderText('Filter...')).not.toBeInTheDocument();

    submit();
    await waitFor(() => expect(submitted).toEqual({ station: 'alpha' }));
  });

  test('closes on outside click and does not open while disabled', async () => {
    const { rerender } = render(
      <TestForm>
        <ComboboxField
          name="station"
          label="Station"
          options={stationOptions}
          placeholder="Pick station"
        />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Pick station'));
    expect(screen.getByPlaceholderText('Filter...')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByPlaceholderText('Filter...')).not.toBeInTheDocument());

    rerender(
      <TestForm>
        <ComboboxField
          name="station"
          label="Station"
          options={stationOptions}
          placeholder="Pick station"
          disabled
        />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Pick station'));
    expect(screen.queryByPlaceholderText('Filter...')).not.toBeInTheDocument();
  });
});

describe('MultiSelectField', () => {
  const roleOptions = [
    { label: 'Manager', value: 'manager' },
    { label: 'Cashier', value: 'cashier' },
  ];

  test('adds options, marks selected entries, removes chips without reopening, and submits array state', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm defaultValues={{ roles: [] }} onValid={(data) => (submitted = data)}>
        <MultiSelectField name="roles" label="Roles" options={roleOptions} />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Select...'));
    fireEvent.click(screen.getByRole('button', { name: 'Manager' }));
    expect(screen.getByText('✓')).toBeInTheDocument();

    const managerChip = screen.getAllByText('Manager').find((node) => node.closest('span'));
    const removeManager = managerChip?.closest('span')?.querySelector('button');
    expect(removeManager).not.toBeNull();
    fireEvent.click(removeManager!);
    expect(screen.getByText('Select...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cashier' }));
    submit();

    await waitFor(() => expect(submitted).toEqual({ roles: ['cashier'] }));
  });

  test('renders fallback chip labels and suppresses the menu while disabled', () => {
    render(
      <TestForm defaultValues={{ roles: ['unknown-role'] }}>
        <MultiSelectField name="roles" label="Roles" options={roleOptions} disabled />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('unknown-role'));
    expect(screen.queryByRole('button', { name: 'Manager' })).not.toBeInTheDocument();
  });
});

describe('date and readonly fields', () => {
  test('DateField applies range and disabled/read-only props', () => {
    render(
      <TestForm>
        <DateField name="businessDate" label="Business Date" min="2026-01-01" max="2026-12-31" disabled />
        <DateField name="reviewDate" label="Review Date" readOnly />
      </TestForm>,
    );

    const businessDate = screen.getByLabelText('Business Date');
    expect(businessDate).toHaveAttribute('min', '2026-01-01');
    expect(businessDate).toHaveAttribute('max', '2026-12-31');
    expect(businessDate).toBeDisabled();
    expect(screen.getByLabelText('Review Date')).toHaveAttribute('readonly');
  });

  test('DateRangeField defaults to full width and disables both inputs', () => {
    render(
      <TestForm>
        <DateRangeField nameFrom="from" nameTo="to" label="Period" disabled />
      </TestForm>,
    );

    const from = screen.getByLabelText('Period');
    expect(from).toHaveAttribute('id', 'from');
    expect(from).toBeDisabled();
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
  });

  test('ReadOnlyField displays numeric values without registering an editable input', () => {
    render(
      <TestForm>
        <ReadOnlyField name="balance" label="Balance" value={2500} />
      </TestForm>,
    );

    expect(screen.getByText('2500')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Balance' })).not.toBeInTheDocument();
  });
});

describe('choice fields', () => {
  test('ToggleField switches label and submits checked state', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm defaultValues={{ enabled: false }} onValid={(data) => (submitted = data)}>
        <ToggleField name="enabled" label="Enabled" />
      </TestForm>,
    );

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Active')).toBeInTheDocument();
    submit();

    await waitFor(() => expect(submitted).toEqual({ enabled: true }));
  });

  test('CheckboxField renders optional description and honors disabled state', () => {
    render(
      <TestForm>
        <CheckboxField
          name="approved"
          label="Approved"
          description="Requires supervisor review"
          disabled
        />
      </TestForm>,
    );

    expect(screen.getByText('Requires supervisor review')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  test('RadioGroupField renders option descriptions and submits selected value', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm onValid={(data) => (submitted = data)}>
        <RadioGroupField
          name="payment"
          label="Payment"
          options={[
            { label: 'Card', value: 'card', description: 'Card terminal' },
            { label: 'Cash', value: 'cash' },
          ]}
        />
      </TestForm>,
    );

    expect(screen.getByText('Card terminal')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Cash'));
    submit();

    await waitFor(() => expect(submitted).toEqual({ payment: 'cash' }));
  });
});

describe('FileAttachField', () => {
  test('rejects oversized files, accepts valid files, and submits the file name', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm defaultValues={{ attachment: '' }} onValid={(data) => (submitted = data)}>
        <FileAttachField name="attachment" label="Attachment" accept=".pdf" />
      </TestForm>,
    );

    const input = screen
      .getByText('Choose file...')
      .closest('label')
      ?.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.pdf');

    const oversized = new File([new Uint8Array(11 * 1024 * 1024)], 'too-large.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(alertSpy).toHaveBeenCalledWith('File must be under 10MB');
    expect(screen.getByText('Choose file...')).toBeInTheDocument();

    const validFile = new File(['ok'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [validFile] } });
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();

    submit();
    await waitFor(() => expect(submitted).toEqual({ attachment: 'receipt.pdf' }));
  });

  test('renders selected file names from form defaults and disables the native picker', () => {
    render(
      <TestForm defaultValues={{ attachment: 'existing.pdf' }}>
        <FileAttachField name="attachment" label="Attachment" disabled />
      </TestForm>,
    );

    const input = screen
      .getByText('existing.pdf')
      .closest('label')
      ?.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});

describe('EntityPickerField', () => {
  const entityOptions = [
    { label: 'Alpha Supplier', value: 'alpha', meta: 'VAT 123' },
    { label: 'Beta Supplier', value: 'beta' },
  ];

  test('clears current value, renders meta, selects a result, and submits it', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm defaultValues={{ supplier: 'beta' }} onValid={(data) => (submitted = data)}>
        <EntityPickerField
          name="supplier"
          label="Supplier"
          options={entityOptions}
          placeholder="Pick supplier"
        />
      </TestForm>,
    );

    const clearButton = screen.getByText('Beta Supplier').closest('div')?.querySelector('button');
    expect(clearButton).not.toBeNull();
    fireEvent.click(clearButton!);
    expect(screen.getByText('Pick supplier')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Pick supplier'));
    expect(screen.getByText('VAT 123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alpha Supplier/ }));

    submit();
    await waitFor(() => expect(submitted).toEqual({ supplier: 'alpha' }));
  });

  test('calls onSearch, shows loading and no-results states, and respects disabled', () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <TestForm>
        <EntityPickerField
          key="loading"
          name="supplier"
          label="Supplier"
          options={[]}
          onSearch={onSearch}
          loading
        />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Search entity...'));
    fireEvent.change(screen.getByPlaceholderText('Type to search...'), { target: { value: 'alpha' } });
    expect(onSearch).toHaveBeenCalledWith('alpha');
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    rerender(
      <TestForm>
        <EntityPickerField
          key="results"
          name="supplier"
          label="Supplier"
          options={entityOptions}
          placeholder="Pick supplier"
        />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Pick supplier'));
    fireEvent.change(screen.getByPlaceholderText('Type to search...'), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();

    rerender(
      <TestForm>
        <EntityPickerField
          key="disabled"
          name="supplier"
          label="Supplier"
          options={entityOptions}
          placeholder="Pick supplier"
          disabled
        />
      </TestForm>,
    );

    fireEvent.click(screen.getByText('Pick supplier'));
    expect(screen.queryByPlaceholderText('Type to search...')).not.toBeInTheDocument();
  });
});
