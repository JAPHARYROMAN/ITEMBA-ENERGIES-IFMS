import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import type { SocketAuthGuard } from './guards/socket-auth.guard';

describe('RealtimeGateway', () => {
  let guard: jest.Mocked<Pick<SocketAuthGuard, 'validateSocket'>>;
  let gateway: RealtimeGateway;
  let server: any;

  const makeClient = () =>
    ({
      id: 'socket-1',
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    }) as any;

  beforeEach(() => {
    guard = { validateSocket: jest.fn() } as any;
    gateway = new RealtimeGateway(
      guard as unknown as SocketAuthGuard,
      {} as ConfigService,
    );
    server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
      sockets: {
        sockets: new Map(),
        adapter: { rooms: new Map() },
      },
    };
    gateway.server = server;
  });

  it('authenticates clients, attaches auth context, joins rooms and emits confirmation', async () => {
    const client = makeClient();
    guard.validateSocket.mockResolvedValue({
      userId: 'user-1',
      permissions: ['Manager', 'notifications:admin'],
    });

    await gateway.handleConnection(client);

    expect(client.userId).toBe('user-1');
    expect(client.permissions).toEqual(['Manager', 'notifications:admin']);
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.join).toHaveBeenCalledWith('role:Manager');
    expect(client.join).toHaveBeenCalledWith('role:notifications:admin');
    expect(client.emit).toHaveBeenCalledWith('connected', {
      userId: 'user-1',
      timestamp: expect.any(String),
    });
  });

  it('disconnects clients when socket authentication fails', async () => {
    const client = makeClient();
    guard.validateSocket.mockRejectedValue(new Error('bad token'));

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('logs authenticated and unauthenticated disconnects without throwing', () => {
    expect(() => gateway.handleDisconnect({ id: 's1', userId: 'u1' } as any)).not.toThrow();
    expect(() => gateway.handleDisconnect({ id: 's2' } as any)).not.toThrow();
  });

  it('allows users to join their own user room and permitted role rooms', async () => {
    const client = {
      ...makeClient(),
      userId: 'user-1',
      permissions: ['Manager'],
    };

    await gateway.handleJoinRoom(client, { room: 'user:user-1' });
    await gateway.handleJoinRoom(client, { room: 'role:Manager' });

    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.join).toHaveBeenCalledWith('role:Manager');
    expect(client.emit).toHaveBeenCalledWith('joined-room', { room: 'user:user-1' });
    expect(client.emit).toHaveBeenCalledWith('joined-room', { room: 'role:Manager' });
  });

  it('rejects attempts to join other users or unauthorized role rooms', async () => {
    const client = {
      ...makeClient(),
      userId: 'user-1',
      permissions: ['Cashier'],
    };

    await gateway.handleJoinRoom(client, { room: 'user:user-2' });
    await gateway.handleJoinRoom(client, { room: 'role:Manager' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Cannot join other user rooms',
    });
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Insufficient permissions for role room',
    });
  });

  it('emits join and leave errors when socket room operations fail', async () => {
    const client = {
      ...makeClient(),
      userId: 'user-1',
      permissions: [],
      join: jest.fn().mockRejectedValue(new Error('join failed')),
      leave: jest.fn().mockRejectedValue(new Error('leave failed')),
    };

    await gateway.handleJoinRoom(client, { room: 'public' });
    await gateway.handleLeaveRoom(client, { room: 'public' });

    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Failed to join room',
    });
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Failed to leave room',
    });
  });

  it('leaves rooms successfully', async () => {
    const client = { ...makeClient(), userId: 'user-1' };

    await gateway.handleLeaveRoom(client, { room: 'role:Manager' });

    expect(client.leave).toHaveBeenCalledWith('role:Manager');
    expect(client.emit).toHaveBeenCalledWith('left-room', { room: 'role:Manager' });
  });

  it('emits to user, role and broadcast channels', async () => {
    const userEmitter = { emit: jest.fn() };
    const roleEmitter = { emit: jest.fn() };
    server.to.mockReturnValueOnce(userEmitter).mockReturnValueOnce(roleEmitter);

    await gateway.emitNotificationToUser('user-1', 'notification:new', { id: 'n1' });
    await gateway.emitToRole('Manager', 'notification:new', { id: 'n2' });
    await gateway.broadcast('system:status', { ok: true });

    expect(server.to).toHaveBeenNthCalledWith(1, 'user:user-1');
    expect(userEmitter.emit).toHaveBeenCalledWith('notification:new', { id: 'n1' });
    expect(server.to).toHaveBeenNthCalledWith(2, 'role:Manager');
    expect(roleEmitter.emit).toHaveBeenCalledWith('notification:new', { id: 'n2' });
    expect(server.emit).toHaveBeenCalledWith('system:status', { ok: true });
  });

  it('returns unique connected user IDs and checks user room presence', () => {
    server.sockets.sockets = new Map([
      ['s1', { userId: 'u1' }],
      ['s2', { userId: 'u1' }],
      ['s3', { userId: 'u2' }],
      ['s4', {}],
    ]);
    server.sockets.adapter.rooms = new Map([
      ['user:u1', new Set(['s1', 's2'])],
      ['user:u3', new Set()],
    ]);

    expect(gateway.getConnectedUsers()).toEqual(['u1', 'u2']);
    expect(gateway.isUserConnected('u1')).toBe(true);
    expect(gateway.isUserConnected('u2')).toBe(false);
    expect(gateway.isUserConnected('u3')).toBe(false);
  });
});
