// Testing Environment Configuration
export default {
  NODE_ENV: 'test',
  PORT: 3001,
  
  // API Configuration (same as production)
  API_ROUTE_TIMEOUT_MS: 900000,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 10,
  
  // CORS Configuration (testing URLs)
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001,https://your-app-staging.onrender.com',
  
  // Logging (more verbose for testing)
  LOG_LEVEL: 'debug'
};
