import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAiChat, type ChatMessage, type ResponseCard } from './useAiChat';

// --- Mock the API client. The hook only touches get/post. ---
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from '../api/client';

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>;
}

describe('useAiChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('starts empty and idle', () => {
    const { result } = renderHook(() => useAiChat(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.proactiveInsights).toEqual([]);
  });

  test('sendMessage appends the user message then the assistant response', async () => {
    const reply: ChatMessage = {
      role: 'assistant',
      content: 'Here is your report',
      cards: [{ type: 'table', title: 'Sales', content: [] } as ResponseCard],
    };
    mockedPost.mockResolvedValueOnce(reply);

    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('show sales');
    });

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'show sales' },
      reply,
    ]);
    expect(result.current.isLoading).toBe(false);
  });

  test('sendMessage posts to ai/chat with trimmed text, history and page context', async () => {
    mockedPost.mockResolvedValue({ role: 'assistant', content: 'ok' });

    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('  hello  ');
    });

    expect(mockedPost).toHaveBeenCalledWith('ai/chat', {
      message: 'hello',
      history: [],
      pageContext: '/dashboard',
    });
    // The trimmed text is what lands in the message list.
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'hello' });
  });

  test('sendMessage forwards prior messages as history (capped at last 20)', async () => {
    mockedPost.mockResolvedValue({ role: 'assistant', content: 'reply' });
    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('first');
    });
    await act(async () => {
      await result.current.sendMessage('second');
    });

    // On the second call history should contain the first exchange.
    const secondCall = mockedPost.mock.calls[1][1] as { history: ChatMessage[] };
    expect(secondCall.history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
    ]);
  });

  test('ignores empty / whitespace-only input', async () => {
    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    expect(mockedPost).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  test('on API error, appends an assistant error message containing the detail', async () => {
    mockedPost.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('break it');
    });

    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'break it' });
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toContain('boom');
    expect(result.current.isLoading).toBe(false);
  });

  test('fetchProactiveInsights stores returned cards', async () => {
    const cards: ResponseCard[] = [{ type: 'alert', title: 'Low stock', content: {} }];
    mockedGet.mockResolvedValueOnce(cards);

    const { result } = renderHook(() => useAiChat(), { wrapper });
    await act(async () => {
      await result.current.fetchProactiveInsights();
    });

    expect(mockedGet).toHaveBeenCalledWith('ai/insights/proactive');
    expect(result.current.proactiveInsights).toEqual(cards);
  });

  test('fetchProactiveInsights swallows errors (non-critical)', async () => {
    mockedGet.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.fetchProactiveInsights();
    });

    expect(result.current.proactiveInsights).toEqual([]);
  });

  test('clearConversation empties the message list', async () => {
    mockedPost.mockResolvedValue({ role: 'assistant', content: 'hi' });
    const { result } = renderHook(() => useAiChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('hello');
    });
    expect(result.current.messages.length).toBe(2);

    act(() => {
      result.current.clearConversation();
    });
    expect(result.current.messages).toEqual([]);
  });

  test('confirmWrite appends an assistant message on success', async () => {
    mockedPost.mockResolvedValueOnce({ success: true, message: 'Done', entityId: 'e1' });
    const { result } = renderHook(() => useAiChat(), { wrapper });

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.confirmWrite('create', { foo: 'bar' });
    });

    expect(mockedPost).toHaveBeenCalledWith('ai/confirm', {
      action: 'create',
      payload: { foo: 'bar' },
    });
    expect(res?.success).toBe(true);
    expect(result.current.messages).toEqual([{ role: 'assistant', content: 'Done' }]);
  });

  test('confirmWrite does NOT append a message when unsuccessful', async () => {
    mockedPost.mockResolvedValueOnce({ success: false, message: 'Rejected' });
    const { result } = renderHook(() => useAiChat(), { wrapper });

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.confirmWrite('delete', {});
    });

    expect(res?.success).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  test('aborts the in-flight request on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    // Keep the request pending so the controller is still live at unmount.
    mockedPost.mockReturnValueOnce(new Promise(() => {}));

    const { result, unmount } = renderHook(() => useAiChat(), { wrapper });
    act(() => {
      void result.current.sendMessage('pending');
    });

    unmount();
    await waitFor(() => expect(abortSpy).toHaveBeenCalled());
    abortSpy.mockRestore();
  });
});
