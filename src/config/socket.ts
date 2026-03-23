import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
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

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Use polling as fallback for Railway (no sticky sessions needed with polling)
    transports: ['websocket', 'polling'],
  });

  // ── JWT Auth Middleware ────────────────────────────────────────────────────
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Accept token from headers (Authorization: Bearer <token>) or auth object
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

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialised — call initSocket() first');
  return io;
}
