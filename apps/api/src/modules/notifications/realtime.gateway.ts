import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocketAuthGuard } from './guards/socket-auth.guard';

interface AuthenticatedSocket extends Socket {
  userId: string;
  permissions: string[];
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allowed?: boolean) => void,
    ) => {
      // Allow connections with no origin (native apps, server-to-server)
      if (!origin) return callback(null, true);
      const allowed = (process.env.FRONTEND_ORIGIN || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (allowed.length === 0 || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`WebSocket origin ${origin} not allowed`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly socketAuthGuard: SocketAuthGuard,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Realtime WebSocket gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Authenticate the socket connection
      const authResult = await this.socketAuthGuard.validateSocket(client);

      // Extend socket with user information
      const authenticatedClient = client as AuthenticatedSocket;
      authenticatedClient.userId = authResult.userId;
      authenticatedClient.permissions = authResult.permissions;

      // Join user-specific room
      await client.join(`user:${authResult.userId}`);

      // Join role-based rooms if needed (for future broadcasts)
      for (const permission of authResult.permissions) {
        await client.join(`role:${permission}`);
      }

      this.logger.log(`Client ${client.id} connected for user ${authResult.userId}`);

      // Send connection confirmation
      client.emit('connected', {
        userId: authResult.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(`Client ${client.id} authentication failed: ${error.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const authenticatedClient = client as AuthenticatedSocket;
    if (authenticatedClient.userId) {
      this.logger.log(`Client ${client.id} disconnected for user ${authenticatedClient.userId}`);
    } else {
      this.logger.log(`Client ${client.id} disconnected (unauthenticated)`);
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    try {
      // Validate room access - users can only join their own rooms or role-based rooms
      if (data.room.startsWith('user:') && data.room !== `user:${client.userId}`) {
        client.emit('error', { message: 'Cannot join other user rooms' });
        return;
      }

      if (data.room.startsWith('role:')) {
        const requiredPermission = data.room.replace('role:', '');
        if (!client.permissions.includes(requiredPermission)) {
          client.emit('error', { message: 'Insufficient permissions for role room' });
          return;
        }
      }

      await client.join(data.room);
      client.emit('joined-room', { room: data.room });
      this.logger.debug(`User ${client.userId} joined room ${data.room}`);
    } catch (error) {
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    try {
      await client.leave(data.room);
      client.emit('left-room', { room: data.room });
      this.logger.debug(`User ${client.userId} left room ${data.room}`);
    } catch (error) {
      client.emit('error', { message: 'Failed to leave room' });
    }
  }

  // Method to emit notifications to specific users
  async emitNotificationToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
    this.logger.debug(`Emitted ${event} to user ${userId}`);
  }

  // Method to emit to role-based rooms
  async emitToRole(role: string, event: string, payload: any) {
    this.server.to(`role:${role}`).emit(event, payload);
    this.logger.debug(`Emitted ${event} to role ${role}`);
  }

  // Method to broadcast to all connected clients
  async broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
    this.logger.debug(`Broadcasted ${event} to all clients`);
  }

  // Get connection statistics
  getConnectedUsers(): string[] {
    const connectedUsers = new Set<string>();

    this.server.sockets.sockets.forEach((socket) => {
      const authenticatedSocket = socket as AuthenticatedSocket;
      if (authenticatedSocket.userId) {
        connectedUsers.add(authenticatedSocket.userId);
      }
    });

    return Array.from(connectedUsers);
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    const userRoom = this.server.sockets.adapter.rooms.get(`user:${userId}`);
    return userRoom ? userRoom.size > 0 : false;
  }
}
