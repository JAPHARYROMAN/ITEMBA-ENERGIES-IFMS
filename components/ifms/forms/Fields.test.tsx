import React from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useForm, FormProvider, type RegisterOptions } from 'react-hook-form';
import { TextField, NumberField, SelectField, TextareaField } from './Fields';

afterEach(cleanup);

/* ----------------------------------------------------------------
   Test harness — wraps fields in a FormProvider so useFormContext
   resolves. Exposes a submit button so RHF validation runs and
   surfaces errors into formState.
   ---------------------------------------------------------------- */

interface HarnessProps {
  children: React.ReactNode;
  defaultValues?: Record<string, unknown>;
  onValid?: (data: Record<string, unknown>) => void;
}

function TestForm({ children, defaultValues, onValid }: HarnessProps) {
  const methods = useForm({ defaultValues, mode: 'onSubmit' });
  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((d) => onValid?.(d))}>
        {children}
        <button type="submit">Submit</button>
      </form>
    </FormProvider>
  );
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

const requiredRule: RegisterOptions = { required: 'This field is required' };

describe('TextField', () => {
  test('renders label and an input wired by id/htmlFor', () => {
    render(
      <TestForm>
        <TextField name="fullName" label="Full Name" placeholder="Jane Doe" />
      </TestForm>,
    );
    const input = screen.getByLabelText('Full Name');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Jane Doe');
    expect(input).toHaveAttribute('type', 'text');
  });

  test('surfaces RHF validation error via rules on submit', async () => {
    render(
      <TestForm>
        <TextField name="fullName" label="Full Name" rules={requiredRule} />
      </TestForm>,
    );
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('This field is required');
  });

  test('honors disabled prop', () => {
    render(
      <TestForm>
        <TextField name="fullName" label="Full Name" disabled />
      </TestForm>,
    );
    expect(screen.getByLabelText('Full Name')).toBeDisabled();
  });

  test('honors inputClassName override', () => {
    render(
      <TestForm>
        <TextField name="fullName" label="Full Name" inputClassName="custom-class" />
      </TestForm>,
    );
    expect(screen.getByLabelText('Full Name')).toHaveClass('custom-class');
  });

  test('typed value is captured by RHF and submitted', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm onValid={(d) => (submitted = d)}>
        <TextField name="fullName" label="Full Name" />
      </TestForm>,
    );
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Acme Ltd' } });
    submit();
    await waitFor(() => expect(submitted).toEqual({ fullName: 'Acme Ltd' }));
  });
});

describe('NumberField', () => {
  test('renders a number input with default step', () => {
    render(
      <TestForm>
        <NumberField name="qty" label="Quantity" />
      </TestForm>,
    );
    const input = screen.getByLabelText('Quantity');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '1');
  });

  test('registers value as a number (valueAsNumber)', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm onValid={(d) => (submitted = d)}>
        <NumberField name="qty" label="Quantity" />
      </TestForm>,
    );
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '42' } });
    submit();
    await waitFor(() => expect(submitted).toEqual({ qty: 42 }));
  });

  test('surfaces min rule validation error', async () => {
    render(
      <TestForm>
        <NumberField name="qty" label="Quantity" rules={{ min: { value: 10, message: 'Too small' } }} />
      </TestForm>,
    );
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too small');
  });

  test('honors min/max/step and disabled', () => {
    render(
      <TestForm>
        <NumberField name="qty" label="Quantity" min={0} max={100} step="0.5" disabled />
      </TestForm>,
    );
    const input = screen.getByLabelText('Quantity');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveAttribute('step', '0.5');
    expect(input).toBeDisabled();
  });
});

describe('SelectField', () => {
  const options = [
    { label: 'Net 30', value: 'net30' },
    { label: 'Cash', value: 'cod' },
  ];

  test('renders label, placeholder option, and all options', () => {
    render(
      <TestForm>
        <SelectField name="terms" label="Payment Terms" options={options} placeholder="Pick one" />
      </TestForm>,
    );
    expect(screen.getByLabelText('Payment Terms')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pick one' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Net 30' })).toHaveValue('net30');
    expect(screen.getByRole('option', { name: 'Cash' })).toHaveValue('cod');
  });

  test('selecting an option updates RHF state', async () => {
    let submitted: Record<string, unknown> | undefined;
    render(
      <TestForm onValid={(d) => (submitted = d)}>
        <SelectField name="terms" label="Payment Terms" options={options} />
      </TestForm>,
    );
    fireEvent.change(screen.getByLabelText('Payment Terms'), { target: { value: 'cod' } });
    submit();
    await waitFor(() => expect(submitted).toEqual({ terms: 'cod' }));
  });

  test('surfaces required rule error and honors disabled', async () => {
    render(
      <TestForm>
        <SelectField name="terms" label="Payment Terms" options={options} rules={requiredRule} disabled />
      </TestForm>,
    );
    expect(screen.getByLabelText('Payment Terms')).toBeDisabled();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('This field is required');
  });
});

describe('TextareaField', () => {
  test('renders label and textarea with rows', () => {
    render(
      <TestForm>
        <TextareaField name="notes" label="Notes" rows={5} placeholder="Add notes" />
      </TestForm>,
    );
    const ta = screen.getByLabelText('Notes');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta).toHaveAttribute('rows', '5');
    expect(ta).toHaveAttribute('placeholder', 'Add notes');
  });

  test('surfaces validation error from rules', async () => {
    render(
      <TestForm>
        <TextareaField
          name="notes"
          label="Notes"
          rules={{ maxLength: { value: 3, message: 'Too long' } }}
        />
      </TestForm>,
    );
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'abcd' } });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too long');
  });

  test('renders hint when no error present', () => {
    render(
      <TestForm>
        <TextareaField name="notes" label="Notes" hint="Internal use only" />
      </TestForm>,
    );
    expect(screen.getByText('Internal use only')).toBeInTheDocument();
  });
});
