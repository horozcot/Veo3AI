import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// API route modules
import generateRoute from './api/routes/generate.js';
import generatePlusRoute from './api/routes/generate.plus.js';
import generateNewContRoute from './api/routes/generate.newcont.js';

// --- ES module __dirname shim ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App / Port ---
const app = express();
app.set('trust proxy', 1); // behind Render's proxy
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
    if (!origin) return cb(null, true); // allow curl/postman
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
  // Allow overriding via env; make local very generous
  const API_ROUTE_TIMEOUT_MS =
    Number.parseInt(process.env.API_ROUTE_TIMEOUT_MS || '', 10) || 360_000; // 6 min

  req.setTimeout?.(API_ROUTE_TIMEOUT_MS + 2_000);
  res.setTimeout?.(API_ROUTE_TIMEOUT_MS + 2_000);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    console.warn('[api] route_timeout', req.method, req.url);
    if (!res.headersSent) {
      res.status(504).json({ ok: false, error: 'route_timeout' });
    }
  }, API_ROUTE_TIMEOUT_MS);

  const clear = () => clearTimeout(timer);
  res.on('finish', clear);
  res.on('close', clear);

  // Helpful log so we see the budget per request
  console.log(`[api] timeout budget: ${API_ROUTE_TIMEOUT_MS}ms`);
  next();
});

// =========================
// API Routes
// =========================
app.use('/api', generateRoute);
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
  if (res.headersSent) return;
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

// bump Node HTTP timeouts just above guard
server.headersTimeout = 370_000;
server.requestTimeout = 365_000;
