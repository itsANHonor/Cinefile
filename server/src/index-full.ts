import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { setupDatabase } from './database';
import { isDesktopMode } from './middleware/auth.middleware';

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

// CORS configuration - restrict to allowed origin for security
const corsOptions = {
  origin: isDesktopMode() ? true : (process.env.ALLOWED_ORIGIN || 'http://localhost:3005'), // Default to frontend URL
  credentials: false,
  optionsSuccessStatus: 200,
};

// Middleware
// Increase body size limit to 50MB for large CSV imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount MCP routes before restrictive browser CORS so MCP clients & preflights use MCP CORS headers
app.use('/api/mcp', mcpRoutes);
app.use('/mcp', mcpRoutes);

app.use(cors(corsOptions));

// Serve uploaded files statically (must be before API routes for proper handling)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

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
app.use('/api/media', mediaRoutes);
app.use('/api/physical-items', physicalItemsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/import-export', importExportRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/library', libraryRoutes);

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
