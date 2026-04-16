import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';

export interface ResponseCard {
  type: 'table' | 'data' | 'alert' | 'download' | 'confirmation' | 'forecast';
  title: string;
  content: unknown;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  cards?: ResponseCard[];
}

interface ConfirmResult {
  success: boolean;
  message: string;
  entityId?: string;
}

interface UseAiChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  proactiveInsights: ResponseCard[];
  sendMessage: (text: string) => Promise<void>;
  fetchProactiveInsights: () => Promise<void>;
  clearConversation: () => void;
  confirmWrite: (action: string, payload: Record<string, unknown>) => Promise<ConfirmResult>;
}

export function useAiChat(): UseAiChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [proactiveInsights, setProactiveInsights] = useState<ResponseCard[]>([]);
  const location = useLocation();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        abortRef.current = new AbortController();
        const response = await apiClient.post<ChatMessage>('ai/chat', {
          message: trimmed,
          history: messages.slice(-20),
          pageContext: location.pathname,
        });
        setMessages((prev) => [...prev, response]);
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : 'Unknown error';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Sorry, I encountered an error. ${detail}`,
          },
        ]);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [messages, isLoading, location.pathname],
  );

  const fetchProactiveInsights = useCallback(async () => {
    try {
      const cards = await apiClient.get<ResponseCard[]>('ai/insights/proactive');
      setProactiveInsights(cards);
    } catch {
      // Silently fail — proactive insights are non-critical
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
  }, []);

  const confirmWrite = useCallback(
    async (action: string, payload: Record<string, unknown>): Promise<ConfirmResult> => {
      const result = await apiClient.post<ConfirmResult>('ai/confirm', { action, payload });
      if (result.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: result.message }]);
      }
      return result;
    },
    [],
  );

  return {
    messages,
    isLoading,
    proactiveInsights,
    sendMessage,
    fetchProactiveInsights,
    clearConversation,
    confirmWrite,
  };
}
