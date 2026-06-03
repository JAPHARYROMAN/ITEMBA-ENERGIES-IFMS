import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormFooterMeta } from './FormFooterMeta';

afterEach(cleanup);

describe('FormFooterMeta', () => {
  test('renders default creation metadata and omits update metadata by default', () => {
    render(<FormFooterMeta />);

    expect(screen.getByText('Created On')).toBeInTheDocument();
    expect(screen.getByText(/by System Admin$/)).toBeInTheDocument();
    expect(screen.queryByText('Last Modified')).not.toBeInTheDocument();
  });

  test('renders explicit created and updated metadata', () => {
    const createdAt = '2026-06-03T06:00:00.000Z';
    const updatedAt = '2026-06-03T09:30:00.000Z';

    render(
      <FormFooterMeta
        createdAt={createdAt}
        createdBy="Alex Manager"
        updatedAt={updatedAt}
        updatedBy="Nia Auditor"
      />,
    );

    expect(screen.getByText(`${new Date(createdAt).toLocaleString()} by Alex Manager`)).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
    expect(screen.getByText(`${new Date(updatedAt).toLocaleString()} by Nia Auditor`)).toBeInTheDocument();
  });

  test('renders updated timestamp even when updatedBy is omitted', () => {
    const updatedAt = '2026-06-03T12:00:00.000Z';

    render(<FormFooterMeta updatedAt={updatedAt} />);

    expect(screen.getByText('Last Modified')).toBeInTheDocument();
    expect(screen.getByText(`${new Date(updatedAt).toLocaleString()} by`)).toBeInTheDocument();
  });
});
