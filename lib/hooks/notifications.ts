import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface Notification {
  id: string;
  notificationId: string;
  userId: string;
  status: string;
  readAt?: string;
  seenAt?: string;
  archivedAt?: string;
  deliveredVia: string;
  errorMessage?: string;
  notification: {
    id: string;
    type: string;
    severity: 'info' | 'success' | 'warning' | 'critical';
    title: string;
    body?: string;
    data?: Record<string, any>;
    actionUrl?: string;
    createdAt: string;
  };
}

export interface NotificationListResponse {
  deliveries: Notification[];
  total: number;
}

export interface NotificationFilters {
  status?: 'pending' | 'sent' | 'failed';
  unread?: boolean;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface NotificationPreferences {
  channels: {
    inapp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  severityMin: 'info' | 'warning' | 'critical';
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone?: string;
  };
  digestMode: 'none' | 'daily' | 'weekly';
}

// API functions
const notificationsApi = {
  getNotifications: async (filters: NotificationFilters = {}): Promise<NotificationListResponse> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    return await apiClient.get<NotificationListResponse>(`/notifications?${params.toString()}`);
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await apiClient.get<{ count: number }>('/notifications/unread-count');
    return response.count;
  },

  markSeen: async (deliveryId: string): Promise<void> => {
    await apiClient.post(`/notifications/${deliveryId}/seen`);
  },

  markRead: async (deliveryId: string): Promise<void> => {
    await apiClient.post(`/notifications/${deliveryId}/read`);
  },

  archive: async (deliveryId: string): Promise<void> => {
    await apiClient.post(`/notifications/${deliveryId}/archive`);
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.post('/notifications/mark-all-read');
  },

  getPreferences: async (): Promise<NotificationPreferences> => {
    return await apiClient.get<NotificationPreferences>('/notifications/preferences');
  },

  updatePreferences: async (preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> => {
    return await apiClient.patch<NotificationPreferences>('/notifications/preferences', preferences);
  },
};

// Hooks
export function useNotifications(filters: NotificationFilters = {}) {
  return useQuery<NotificationListResponse>({
    queryKey: ['notifications', filters],
    queryFn: () => notificationsApi.getNotifications(filters),
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount() {
  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.getUnreadCount,
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
}

export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const {
    data: preferences,
    isLoading,
    error,
  } = useQuery<NotificationPreferences>({
    queryKey: ['notifications', 'preferences'],
    queryFn: notificationsApi.getPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onSuccess: (newPreferences) => {
      queryClient.setQueryData(['notifications', 'preferences'], newPreferences);
    },
  });

  return {
    preferences,
    isLoading,
    error,
    updatePreferences: updatePreferencesMutation.mutate,
    isUpdating: updatePreferencesMutation.isPending,
  };
}

export function useMarkSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationsApi.markSeen,
    onSuccess: () => {
      // Invalidate notifications list and unread count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      // Invalidate notifications list and unread count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

export function useArchive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationsApi.archive,
    onSuccess: () => {
      // Invalidate notifications list and unread count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      // Invalidate notifications list and unread count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

// Optimistic update helpers
export function useOptimisticMarkRead() {
  const queryClient = useQueryClient();
  const markReadMutation = useMarkRead();

  const markReadOptimistic = (deliveryId: string) => {
    // Cancel any outgoing refetches
    queryClient.cancelQueries({ queryKey: ['notifications'] });

    // Snapshot the previous value
    const previousNotifications = queryClient.getQueryData(['notifications']);

    // Optimistically update to the new value
    queryClient.setQueryData(['notifications'], (old: NotificationListResponse | undefined) => {
      if (!old?.deliveries) return old;
      
      return {
        ...old,
        deliveries: old.deliveries.map((notification) =>
          notification.id === deliveryId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification
        ),
      };
    });

    // Return a context object with the snapshotted value
    const context = { previousNotifications };

    // Try to make the API call
    markReadMutation.mutate(deliveryId, {
      onError: (err, newTodo, context: { previousNotifications: NotificationListResponse | undefined }) => {
        // If the mutation fails, use the context returned from onMutate to roll back
        if (context?.previousNotifications) {
          queryClient.setQueryData(['notifications'], context.previousNotifications);
        }
      },
      onSettled: () => {
        // Always refetch after error or success
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      },
    });
  };

  return { markReadOptimistic, isPending: markReadMutation.isPending };
}

export function useOptimisticArchive() {
  const queryClient = useQueryClient();
  const archiveMutation = useArchive();

  const archiveOptimistic = (deliveryId: string) => {
    // Cancel any outgoing refetches
    queryClient.cancelQueries({ queryKey: ['notifications'] });

    // Snapshot the previous value
    const previousNotifications = queryClient.getQueryData(['notifications']);

    // Optimistically update to the new value
    queryClient.setQueryData(['notifications'], (old: NotificationListResponse | undefined) => {
      if (!old?.deliveries) return old;
      
      return {
        ...old,
        deliveries: old.deliveries.filter((notification) =>
          notification.id !== deliveryId
        ),
      };
    });

    // Return a context object with the snapshotted value
    const context = { previousNotifications };

    // Try to make the API call
    archiveMutation.mutate(deliveryId, {
      onError: (err, newTodo, context: { previousNotifications: NotificationListResponse | undefined }) => {
        // If the mutation fails, use the context returned from onMutate to roll back
        if (context?.previousNotifications) {
          queryClient.setQueryData(['notifications'], context.previousNotifications);
        }
      },
      onSettled: () => {
        // Always refetch after error or success
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      },
    });
  };

  return { archiveOptimistic, isPending: archiveMutation.isPending };
}
