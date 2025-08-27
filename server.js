// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// API route modules
import generateRoute from './api/routes/generate.js';
import generateContinuationRoute from './api/routes/generateContinuation.js';
import generatePlusRoute from './api/routes/generate.plus.js';
import generateNewContRoute from './api/routes/generate.newcont.js';

// --- ES module __dirname shim ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App / Port ---
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// =========================
// Middleware (top-level)
// =========================

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// CORS (allow your dev + prod origins)
// You can also set CORS_ORIGINS="https://yourapp.onrender.com,https://yourdomain.com"
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  // add your Render URL(s) here:
  // 'https://YOUR-RENDER-APP.onrender.com',
  // 'https://YOUR-CUSTOM-DOMAIN',
];

const ALLOWED_ORIGINS = envOrigins.length ? envOrigins : DEFAULT_ORIGINS;

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin or tools (like curl/postman with no origin)
    if (!origin) return cb(null, true);
    return cb(null, ALLOWED_ORIGINS.includes(origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// Preflight
app.options('*', (_req, res) => res.sendStatus(204));

// JSON body parsing
app.use(express.json({ limit: '10mb' }));

// ====================================
// API guard: hard timeout for all /api
// ====================================
app.use('/api', (req, res, next) => {
  const HARD_TIMEOUT_MS = 55_000; // keep under host limits

  req.setTimeout?.(HARD_TIMEOUT_MS + 2_000);
  res.setTimeout?.(HARD_TIMEOUT_MS + 2_000);

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.error('[api] route_timeout', req.method, req.url);
      res.status(504).json({ ok: false, error: 'route_timeout' });
    }
  }, HARD_TIMEOUT_MS);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));

  next();
});

// =========================
// API Routes (mounted here)
// =========================
app.use('/api', generateRoute);
app.use('/api', generateContinuationRoute);
app.use('/api', generatePlusRoute);
app.use('/api', generateNewContRoute);

// =========================
// Health check
// =========================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
  });
});

// =========================
// Static React build + SPA
// =========================
app.use(express.static(path.join(__dirname, 'build')));

// Catch-all → send React index.html
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'build', 'index.html');
  console.log(`Serving React app from: ${indexPath}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
});

// =========================
// Global error handler
// =========================
app.use((err, _req, res, _next) => {
  console.error('Global error handler:', err.stack || err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// =========================
// Start server (Render-safe)
// =========================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Build directory: ${path.join(__dirname, 'build')}`);
  console.log('Has OPENAI_API_KEY?', !!process.env.OPENAI_API_KEY);
});

// Optional: bump Node timeouts a bit
server.headersTimeout = 75_000;
server.requestTimeout = 70_000;
