import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import { setupDatabase } from './database';

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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
// Increase body size limit to 50MB for large CSV imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize database
setupDatabase();

// Serve uploaded files statically (must be before API routes for proper handling)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadDir));

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'Hello World from Cinefile API! (Full Mode)' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'full',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
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
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA fallback - serve index.html for all other routes
// This handles client-side routing for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Cinefile server running on port ${PORT} (Full Mode)`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
});
