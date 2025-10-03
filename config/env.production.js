// Production Environment Configuration
export default {
  NODE_ENV: 'production',
  PORT: 3001,
  
  // API Configuration (same as current production settings)
  API_ROUTE_TIMEOUT_MS: 900000,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 10,
  
  // CORS Configuration (production URLs)
  CORS_ORIGINS: 'https://ugc-script-splitter.onrender.com,https://your-domain.com',
  
  // Logging (minimal for production)
  LOG_LEVEL: 'info'
};
