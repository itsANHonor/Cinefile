import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { setupDatabase } from './database';

// Import read-only routes
import mediaReadOnlyRoutes from './routes/media-readonly.routes';
import physicalItemsReadOnlyRoutes from './routes/physical-items-readonly.routes';
import settingsReadOnlyRoutes from './routes/settings-readonly.routes';
import seriesReadOnlyRoutes from './routes/series-readonly.routes';
import importExportReadOnlyRoutes from './routes/import-export-readonly.routes';
import statisticsRoutes from './routes/statistics.routes';
import libraryReadOnlyRoutes from './routes/library-readonly.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// CORS configuration - restrict to allowed origin or allow all for development
const corsOptions = {
  origin: process.env.ALLOWED_ORIGIN || '*', // Default to * for development, set to your domain in production
  credentials: false,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Limit URL-encoded payload size

// Initialize database
setupDatabase();

// Serve uploaded files statically with security options
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use(
  '/uploads',
  express.static(uploadDir, {
    dotfiles: 'deny', // Deny access to dotfiles
    index: false, // Disable directory indexing
    setHeaders: (res, filePath) => {
      // Set security headers for uploaded files
      res.set('X-Content-Type-Options', 'nosniff');
    },
  }),
);

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'Hello World from Cinefile API! (Read-Only Mode)' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'readonly',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.use('/api/media', mediaReadOnlyRoutes);
app.use('/api/physical-items', physicalItemsReadOnlyRoutes);
app.use('/api/settings', settingsReadOnlyRoutes);
app.use('/api/series', seriesReadOnlyRoutes);
app.use('/api/import-export', importExportReadOnlyRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/library', libraryReadOnlyRoutes);

// Serve static frontend files (React build)
// This must come AFTER API routes so API routes take precedence
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA fallback - serve index.html for all other routes
// This handles client-side routing for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Cinefile server running on port ${PORT} (Read-Only Mode)`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
});
