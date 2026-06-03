import React from 'react';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FieldInput, FieldTextarea, FieldSelect } from './RawFields';

afterEach(cleanup);

describe('FieldInput', () => {
  test('forwards value/onChange (controlled) and aria-label', () => {
    const onChange = vi.fn();
    render(<FieldInput value="hello" onChange={onChange} aria-label="Code" />);
    const input = screen.getByLabelText('Code');
    expect(input).toHaveValue('hello');
    fireEvent.change(input, { target: { value: 'hellox' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('forwards onKeyDown', () => {
    const onKeyDown = vi.fn();
    render(<FieldInput aria-label="Cell" onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByLabelText('Cell'), { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalled();
  });

  test('forwards arbitrary native props (type/step/className/disabled)', () => {
    render(
      <FieldInput
        aria-label="Amount"
        type="number"
        step="0.01"
        className="cell"
        disabled
      />,
    );
    const input = screen.getByLabelText('Amount');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '0.01');
    expect(input).toHaveClass('cell');
    expect(input).toBeDisabled();
  });

  test('forwards a ref to the underlying input element', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<FieldInput aria-label="Reffed" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(screen.getByLabelText('Reffed'));
  });
});

describe('FieldTextarea', () => {
  test('forwards value/onChange and rows', () => {
    const onChange = vi.fn();
    render(<FieldTextarea aria-label="Desc" value="note" onChange={onChange} rows={4} />);
    const ta = screen.getByLabelText('Desc');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta).toHaveValue('note');
    expect(ta).toHaveAttribute('rows', '4');
    fireEvent.change(ta, { target: { value: 'note!' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('forwards a ref to the underlying textarea element', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<FieldTextarea aria-label="Reffed" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});

describe('FieldSelect', () => {
  test('renders children options and forwards value/onChange', () => {
    const onChange = vi.fn();
    render(
      <FieldSelect aria-label="Reason" value="a" onChange={onChange}>
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </FieldSelect>,
    );
    const select = screen.getByLabelText('Reason');
    expect(select).toHaveValue('a');
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('forwards a ref to the underlying select element', () => {
    const ref = React.createRef<HTMLSelectElement>();
    render(
      <FieldSelect aria-label="Reffed" ref={ref}>
        <option value="x">X</option>
      </FieldSelect>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
