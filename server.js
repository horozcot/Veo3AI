// UPDATED: server.js (with centralized config)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from './config/index.js';

// API route modules
import generateRoute from './api/routes/generate.js';
import generatePlusRoute from './api/routes/generate.plus.js';
import generateNewContRoute from './api/routes/generate.newcont.js';
import generateContinuationRoute from './api/routes/generateContinuation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const PORT = config.PORT;

// Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const ALLOWED_ORIGINS = config.CORS_ORIGINS
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return cb(null, ALLOWED_ORIGINS.includes(origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.options('*', (_req, res) => res.sendStatus(204));
app.use(express.json({ limit: '10mb' }));

// 🔧 Use API_ROUTE_TIMEOUT_MS from config
const API_ROUTE_TIMEOUT_MS = config.API_ROUTE_TIMEOUT_MS;

// 🔧 Apply timeout protection to all /api routes
app.use('/api', (req, res, next) => {
  req.setTimeout?.(API_ROUTE_TIMEOUT_MS + 5_000);
  res.setTimeout?.(API_ROUTE_TIMEOUT_MS + 5_000);

  const timer = setTimeout(() => {
    console.warn('[api] route_timeout', req.method, req.url);
    if (!res.headersSent) {
      res.status(504).json({ ok: false, error: 'route_timeout' });
    }
  }, API_ROUTE_TIMEOUT_MS);

  const clear = () => clearTimeout(timer);
  res.on('finish', clear);
  res.on('close', clear);

  console.log(`[api] timeout budget: ${API_ROUTE_TIMEOUT_MS}ms`);
  next();
});

// Routes
app.use('/api', generateRoute);
app.use('/api', generatePlusRoute);
app.use('/api', generateNewContRoute);
app.use('/api', generateContinuationRoute);

app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    environment: config.NODE_ENV,
    port: config.PORT,
    apiTimeout: config.API_ROUTE_TIMEOUT_MS,
    rateLimit: `${config.RATE_LIMIT_MAX_REQUESTS} requests per ${config.RATE_LIMIT_WINDOW_MS}ms`,
    corsOrigins: config.CORS_ORIGINS,
    hasOpenAIKey: !!config.OPENAI_API_KEY
  });
});

// SPA fallback
const ROOT_BUILD_DIR = path.join(__dirname, 'build');
const CLIENT_BUILD_DIR = path.join(__dirname, 'client', 'build');
const BUILD_DIR = fs.existsSync(path.join(ROOT_BUILD_DIR, 'index.html'))
  ? ROOT_BUILD_DIR
  : CLIENT_BUILD_DIR;

app.use(express.static(BUILD_DIR));

app.get('*', (req, res) => {
  const indexPath = path.join(BUILD_DIR, 'index.html');
  console.log(`Serving React app from: ${indexPath}`);
  res.sendFile(indexPath, err => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error('Global error handler:', err.stack || err);
  if (res.headersSent) return;
  res.status(500).json({
    error: 'Internal server error',
    message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ✅ Start server with proper timeouts
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Build directory: ${path.join(__dirname, 'build')}`);
  console.log('Has OPENAI_API_KEY?', !!config.OPENAI_API_KEY);
});

server.requestTimeout = API_ROUTE_TIMEOUT_MS + 5_000;
server.headersTimeout = API_ROUTE_TIMEOUT_MS + 10_000;
