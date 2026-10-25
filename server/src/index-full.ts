import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { setupDatabase } from './database';
import { isDesktopMode, requirePublicCollectionOrAuth } from './middleware/auth.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import mediaRoutes from './routes/media.routes';
import physicalItemsRoutes from './routes/physical-items.routes';
import settingsRoutes from './routes/settings.routes';
import searchRoutes from './routes/search.routes';
import seriesRoutes from './routes/series.routes';
import importExportRoutes from './routes/import-export.routes';
import statisticsRoutes from './routes/statistics.routes';
import libraryRoutes from './routes/library.routes';
import mcpRoutes from './routes/mcp.routes';

if (!isDesktopMode() && !process.env.SESSION_SECRET?.trim()) {
  console.error('FATAL: SESSION_SECRET must be set (signs admin JWTs). See server/env.example.');
  process.exit(1);
}

export const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3001;

app.disable('x-powered-by');

if (process.env.TRUST_PROXY) {
  const proxyVal =
    process.env.TRUST_PROXY === 'true'
      ? 1
      : process.env.TRUST_PROXY === 'false'
        ? false
        : Number.isNaN(Number(process.env.TRUST_PROXY))
          ? process.env.TRUST_PROXY
          : Number(process.env.TRUST_PROXY);
  app.set('trust proxy', proxyVal);
}

// Baseline HTTP security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS configuration - restrict to allowed origin for security;
// in Desktop Mode disable cross-origin browser access (frontend is served from same 127.0.0.1 origin)
const corsOptions = {
  origin: isDesktopMode() ? false : (process.env.ALLOWED_ORIGIN || 'http://localhost:3005'),
  credentials: false,
  optionsSuccessStatus: 200,
};

// Apply 50MB body limit specifically to CSV import/export routes
app.use('/api/import-export', express.json({ limit: '50mb' }));
app.use('/api/import-export', express.urlencoded({ extended: true, limit: '50mb' }));

// Default body size limit for all other routes
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Mount MCP routes before restrictive browser CORS so MCP clients & preflights use MCP CORS headers
app.use('/api/mcp', mcpRoutes);
app.use('/mcp', mcpRoutes);

app.use(cors(corsOptions));

// Serve uploaded files statically with security options (must be before API routes)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use(
  '/uploads',
  express.static(uploadDir, {
    dotfiles: 'deny',
    index: false,
    setHeaders: (res) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    },
  }),
);

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'Hello World from Cinefile API! (Full Mode)' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'full',
    desktop: isDesktopMode(),
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/import-export', importExportRoutes);
app.use('/api/media', requirePublicCollectionOrAuth, mediaRoutes);
app.use('/api/physical-items', requirePublicCollectionOrAuth, physicalItemsRoutes);
app.use('/api/series', requirePublicCollectionOrAuth, seriesRoutes);
app.use('/api/statistics', requirePublicCollectionOrAuth, statisticsRoutes);
app.use('/api/library', requirePublicCollectionOrAuth, libraryRoutes);

// Serve static frontend files (React build)
// This must come AFTER API routes so API routes take precedence
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA fallback - serve index.html for all other routes
// This handles client-side routing for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

export interface StartServerOptions {
  port?: number;
  host?: string;
}

export async function startFullServer(options: StartServerOptions = {}): Promise<http.Server> {
  await setupDatabase();

  const port = options.port !== undefined ? options.port : DEFAULT_PORT;
  const host = options.host;

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      reject(err);
    };

    const server = host
      ? app.listen(port, host, () => {
          server.removeListener('error', onError);
          const address = server.address();
          const boundPort = typeof address === 'object' && address ? address.port : port;
          console.log(`🎬 Cinefile server running on http://${host}:${boundPort} (Full Mode${isDesktopMode() ? ', Desktop' : ''})`);
          resolve(server);
        })
      : app.listen(port, () => {
          server.removeListener('error', onError);
          console.log(`🎬 Cinefile server running on port ${port} (Full Mode)`);
          console.log(`📱 API available at http://localhost:${port}/api`);
          resolve(server);
        });

    server.once('error', onError);
  });
}

if (require.main === module) {
  startFullServer().catch((err) => {
    console.error('❌ Failed to start Cinefile server:', err);
    process.exit(1);
  });
}
