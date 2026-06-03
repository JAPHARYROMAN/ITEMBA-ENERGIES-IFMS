import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

describe('Tabs', () => {
  afterEach(() => {
    cleanup();
  });

  test('passes active state to direct trigger children and renders only matching content', () => {
    render(
      <Tabs value="overview" onValueChange={vi.fn()}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="audit">Audit panel</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('button', { name: 'Audit' })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByText('Overview panel')).toBeInTheDocument();
    expect(screen.queryByText('Audit panel')).not.toBeInTheDocument();
  });

  test('calls onValueChange when a trigger is selected', () => {
    const onValueChange = vi.fn();
    render(
      <Tabs value="overview" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Audit' }));
    expect(onValueChange).toHaveBeenCalledWith('audit');
  });
});
