// Development Environment Configuration
export default {
  NODE_ENV: 'development',
  PORT: 3001,
  
  // API Configuration (same across all environments)
  API_ROUTE_TIMEOUT_MS: 360000,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 10,
  
  // CORS Configuration
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  
  // Logging
  LOG_LEVEL: 'debug'
};
