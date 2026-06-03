import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api/auth-token';
import { frontendEnv } from '@/lib/env.client';
import type { Notification } from '@/lib/hooks/notifications';

interface RealtimeNotification extends Notification {
  isRealtime?: boolean;
}

interface NotificationNewPayload {
  delivery: Omit<Notification, 'notification'>;
  notification: Notification['notification'];
}

interface UnreadCountPayload {
  count: number;
}

interface UseRealtimeNotificationsReturn {
  socket: Socket | null;
  isConnected: boolean;
  realtimeNotifications: RealtimeNotification[];
  clearRealtimeNotifications: () => void;
  connectionError: string | null;
}

export function useRealtimeNotifications(): UseRealtimeNotificationsReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeNotifications, setRealtimeNotifications] = useState<RealtimeNotification[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const clearRealtimeNotifications = useCallback(() => {
    setRealtimeNotifications([]);
  }, []);

  useEffect(() => {
    let socketInstance: Socket | null = null;

    const connectSocket = () => {
      try {
        const token = getAccessToken();
        if (!token) {
          setConnectionError('No authentication token available');
          return;
        }

        // Create socket connection
        socketInstance = io(`${frontendEnv.apiBaseUrl}/realtime`, {
          auth: {
            token: `Bearer ${token}`,
          },
          transports: ['websocket', 'polling'],
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 20000,
        });

        // Connection events
        socketInstance.on('connect', () => {
          setIsConnected(true);
          setConnectionError(null);
        });

        socketInstance.on('disconnect', (reason) => {
          setIsConnected(false);

          if (reason === 'io server disconnect') {
            // Server disconnected, try to reconnect manually
            reconnectTimeoutRef.current = setTimeout(() => {
              socketInstance?.connect();
            }, 1000);
          }
        });

        socketInstance.on('connect_error', (error) => {
          console.error('Real-time connection error:', error);
          setConnectionError(error.message || 'Connection failed');
          setIsConnected(false);
        });

        socketInstance.on('reconnect', () => {
          setIsConnected(true);
          setConnectionError(null);
        });

        socketInstance.on('reconnect_error', (error) => {
          console.error('Real-time reconnection failed:', error);
          setConnectionError('Reconnection failed');
        });

        // Notification events
        socketInstance.on('notification:new', (payload: NotificationNewPayload) => {
          const notification: RealtimeNotification = {
            ...payload.delivery,
            notification: payload.notification,
            isRealtime: true,
          };

          setRealtimeNotifications(prev => [notification, ...prev]);
        });

        socketInstance.on('notification:unreadCount', (_payload: UnreadCountPayload) => {
          // This will be handled by the query cache invalidation
        });

        // Error handling
        socketInstance.on('error', (error) => {
          console.error('Real-time socket error:', error);
          setConnectionError(error.message || 'Socket error');
        });

        setSocket(socketInstance);

      } catch (error) {
        console.error('Failed to initialize real-time connection:', error);
        setConnectionError('Failed to initialize connection');
      }
    };

    connectSocket();

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (socketInstance) {
        socketInstance.off(); // Remove all listeners
        socketInstance.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, []);

  // Handle authentication changes
  useEffect(() => {
    // Listen for auth logout events
    const handleLogout = () => {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      setRealtimeNotifications([]);
    };

    window.addEventListener('ifms:auth-logout', handleLogout);

    return () => {
      window.removeEventListener('ifms:auth-logout', handleLogout);
    };
  }, [socket]);

  return {
    socket,
    isConnected,
    realtimeNotifications,
    clearRealtimeNotifications,
    connectionError,
  };
}
