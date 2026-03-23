import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './config/env';
import { globalRateLimiter } from './shared/middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import discoverRoutes from './modules/discover/discover.routes';
import postRoutes from './modules/posts/posts.routes';
import feedRoutes from './modules/feed/feed.routes';
import storyRoutes from './modules/stories/stories.routes';
import reelRoutes from './modules/reels/reels.routes';
import messagingRoutes from './modules/messaging/messaging.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import marketplaceRoutes from './modules/marketplace/marketplace.routes';
import callRoutes from './modules/calls/calls.routes';
import opportunityRoutes from './modules/opportunities/opportunities.routes';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes';
import adminRoutes from './modules/admin/admin.routes';

const app = express();

// ── Trust Proxy (required for Railway / any reverse-proxy host) ───────────────
// Railway sits behind a load balancer that sets X-Forwarded-For.
// Without this, express-rate-limit cannot identify real client IPs.
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      if (env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Parsing & Compression ─────────────────────────────────────────────────────
// Capture raw body for Paystack webhook HMAC verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as import('express').Request).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ── Logging ───────────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// ── Global Rate Limit ─────────────────────────────────────────────────────────
app.use('/api', globalRateLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Corpers Connect API',
    version: '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/discover', discoverRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/feed', feedRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/reels', reelRoutes);
app.use('/api/v1/conversations', messagingRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/marketplace', marketplaceRoutes);
app.use('/api/v1/calls', callRoutes);
app.use('/api/v1/opportunities', opportunityRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/admin', adminRoutes);

// ── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
