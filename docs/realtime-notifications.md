# IFMS Real-time Notifications Documentation

## Overview

The IFMS system provides real-time notification delivery using Socket.IO WebSockets. This enables instant delivery of in-app notifications to connected users without requiring polling.

## Architecture

### WebSocket Gateway
- **Namespace**: `/realtime`
- **Authentication**: JWT token validation
- **Room Management**: User-specific rooms (`user:{userId}`) and role-based rooms (`role:{permission}`)

### Connection Flow
1. Client connects to `/realtime` namespace
2. Gateway validates JWT token from handshake auth or query parameter
3. User joins their personal room (`user:{userId}`)
4. User optionally joins role-based rooms based on permissions
5. Connection confirmed with `connected` event

## Authentication

### Token Sources
The gateway accepts JWT tokens from:
1. **Handshake Auth**: `socket.handshake.auth.token`
2. **Query Parameter**: `socket.handshake.query.token`

### Token Format
```javascript
// Bearer token format
const token = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Or without Bearer prefix
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Client Connection Examples

#### JavaScript (Socket.IO Client)
```javascript
import { io } from 'socket.io-client';

const token = localStorage.getItem('jwt_token'); // Get from your auth storage

const socket = io('/realtime', {
  auth: {
    token: `Bearer ${token}`
  },
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Connected to real-time notifications');
});

socket.on('connected', (data) => {
  console.log('Authentication successful:', data);
});
```

#### Query Parameter Method
```javascript
const socket = io('/realtime', {
  query: {
    token: `Bearer ${token}`
  }
});
```

## Events

### Client-to-Server Events

#### `join-room`
Join a specific room (user rooms are auto-joined on connection).

```javascript
socket.emit('join-room', { room: 'role:notifications:admin' });
```

**Response:**
```javascript
// Success
socket.on('joined-room', (data) => {
  console.log('Joined room:', data.room);
});

// Error
socket.on('error', (data) => {
  console.error('Failed to join room:', data.message);
});
```

#### `leave-room`
Leave a specific room.

```javascript
socket.emit('leave-room', { room: 'role:notifications:admin' });
```

**Response:**
```javascript
socket.on('left-room', (data) => {
  console.log('Left room:', data.room);
});
```

### Server-to-Client Events

#### `connected`
Connection confirmation after successful authentication.

```javascript
socket.on('connected', (data) => {
  console.log('User authenticated:', data.userId);
  console.log('Connected at:', data.timestamp);
});
```

**Payload:**
```typescript
{
  userId: string;
  timestamp: string; // ISO 8601 timestamp
}
```

#### `notification:new`
New notification delivered to the user.

```javascript
socket.on('notification:new', (data) => {
  console.log('New notification:', data);
  
  // Update UI with new notification
  addNotificationToUI(data.notification);
  updateUnreadCount();
});
```

**Payload:**
```typescript
{
  delivery: {
    id: string;
    notificationId: string;
    userId: string;
    status: 'sent';
    deliveredVia: 'inapp';
  };
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
```

#### `notification:unreadCount`
Updated unread notification count.

```javascript
socket.on('notification:unreadCount', (data) => {
  console.log('Unread count:', data.count);
  updateUnreadCountBadge(data.count);
});
```

**Payload:**
```typescript
{
  count: number;
}
```

#### `error`
Error events for various operations.

```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
});
```

**Payload:**
```typescript
{
  message: string;
}
```

## Room Management

### Auto-Joined Rooms
- `user:{userId}` - Personal notification room (joined automatically)

### Role-Based Rooms
- `role:{permission}` - Permission-based rooms for broadcasts
- Examples: `role:notifications:admin`, `role:reports:read`

### Room Access Control
- Users can only join their own user rooms
- Role rooms require matching permissions
- Attempts to join unauthorized rooms result in error events

## Reconnection Handling

### Automatic Reconnection
Socket.IO client handles automatic reconnection with exponential backoff.

```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

### Connection State Management
```javascript
// Check connection status
if (socket.connected) {
  console.log('Socket is connected');
}

// Listen for connection changes
socket.on('connect', () => {
  console.log('Reconnected successfully');
  // Refresh notification count after reconnection
  refreshUnreadCount();
});
```

## Frontend Integration Example

### React Hook
```typescript
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface NotificationData {
  delivery: any;
  notification: any;
}

export const useRealtimeNotifications = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;

    const newSocket = io('/realtime', {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connected', (data) => {
      console.log('Real-time notifications connected');
    });

    newSocket.on('notification:new', (data: NotificationData) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    newSocket.on('notification:unreadCount', (data) => {
      setUnreadCount(data.count);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const markAsRead = (deliveryId: string) => {
    // Call API to mark as read
    // Socket will emit updated count automatically
    setNotifications(prev => 
      prev.map(n => 
        n.delivery.id === deliveryId 
          ? { ...n, delivery: { ...n.delivery, readAt: new Date() } }
          : n
      )
    );
  };

  return {
    socket,
    unreadCount,
    notifications,
    markAsRead,
    isConnected: socket?.connected || false
  };
};
```

### Component Usage
```typescript
import { useRealtimeNotifications } from './hooks/useRealtimeNotifications';

const NotificationCenter = () => {
  const { socket, unreadCount, notifications, markAsRead, isConnected } = useRealtimeNotifications();

  return (
    <div className="notification-center">
      <div className="notification-header">
        <h3>Notifications</h3>
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '🟢' : '🔴'}
        </span>
        <span className="unread-count">{unreadCount}</span>
      </div>
      
      <div className="notification-list">
        {notifications.map((item) => (
          <NotificationItem
            key={item.delivery.id}
            notification={item}
            onRead={() => markAsRead(item.delivery.id)}
          />
        ))}
      </div>
    </div>
  );
};
```

## Configuration

### Environment Variables
```bash
# WebSocket configuration
NOTIFICATION_OUTBOX_POLL_INTERVAL=30  # Seconds between outbox processing
JWT_SECRET=your-jwt-secret-key
```

### CORS Configuration
The gateway is configured with permissive CORS for development. For production, update the cors configuration:

```typescript
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: ['https://yourdomain.com'], // Production domains
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
```

## Monitoring and Debugging

### Connection Statistics
The gateway provides methods to monitor connections:

```typescript
// Get connected users
const connectedUsers = gateway.getConnectedUsers();
console.log('Connected users:', connectedUsers);

// Check if specific user is connected
const isUserOnline = gateway.isUserConnected('user-123');
console.log('User online:', isUserOnline);
```

### Logging
All socket events are logged with appropriate levels:
- Connection/disconnection events at INFO level
- Room management at DEBUG level
- Errors at WARN level

### Browser DevTools
Monitor WebSocket traffic in browser devTools:
1. Open Network tab
2. Filter by WS (WebSockets)
3. Inspect `/realtime` connection
4. View sent/received frames

## Security Considerations

1. **Token Validation**: All connections must present valid JWT tokens
2. **Room Isolation**: Users can only join authorized rooms
3. **Message Scoping**: Notifications are only sent to intended recipients
4. **CORS Configuration**: Restrict origins in production
5. **Rate Limiting**: Consider implementing connection rate limiting

## Troubleshooting

### Common Issues

#### Connection Failed
- Check JWT token validity
- Verify token format (Bearer prefix optional)
- Ensure CORS configuration allows your domain

#### No Notifications Received
- Verify user has notification preferences enabled
- Check outbox processing logs
- Confirm user is in correct room

#### Frequent Disconnections
- Check network stability
- Review server logs for authentication errors
- Consider increasing ping timeout

### Debug Mode
Enable debug logging for Socket.IO:

```javascript
// Client-side
localStorage.debug = 'socket.io-client:*';

// Server-side (environment variable)
DEBUG=socket.io:*
```

## Performance Considerations

1. **Connection Pooling**: Reuse connections across browser tabs
2. **Message Batching**: Batch multiple updates when possible
3. **Room Cleanup**: Implement room cleanup for inactive users
4. **Memory Management**: Monitor memory usage with many concurrent connections

## Future Enhancements

1. **Presence Indicators**: Show user online/offline status
2. **Typing Indicators**: Real-time typing status for collaborative features
3. **Message Acknowledgments**: Delivery confirmations for critical notifications
4. **Load Balancing**: Multiple gateway instances for horizontal scaling
