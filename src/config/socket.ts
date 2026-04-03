import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket, Namespace } from 'socket.io';
import { jwtService } from '../shared/services/jwt.service';
import { env } from './env';

export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    role: string;
    jti: string;
  };
}

let io: SocketServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messagingNs: Namespace<any, any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let callsNs: Namespace<any, any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAuthMiddleware(ns: Namespace<any, any, any, any>) {
  ns.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        (socket.handshake.headers.authorization as string)?.split(' ')[1] ??
        (socket.handshake.auth?.token as string);

      if (!token) return next(new Error('Authentication required'));

      const payload = jwtService.verifyAccessToken(token);

      const blocked = await jwtService.isBlocked(payload.jti);
      if (blocked) return next(new Error('Token has been revoked'));

      socket.data = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        jti: payload.jti,
      };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });
}

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  messagingNs = io.of('/messaging');
  callsNs = io.of('/calls');

  applyAuthMiddleware(messagingNs);
  applyAuthMiddleware(callsNs);

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialised — call initSocket() first');
  return io;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMessagingNamespace(): Namespace<any, any, any, any> {
  if (!messagingNs) throw new Error('Messaging namespace not initialised');
  return messagingNs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCallsNamespace(): Namespace<any, any, any, any> {
  if (!callsNs) throw new Error('Calls namespace not initialised');
  return callsNs;
}
