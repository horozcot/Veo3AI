// Centralized Configuration Management
import 'dotenv/config';
import devConfig from './env.development.js';
import testConfig from './env.test.js';
import prodConfig from './env.production.js';

// Get current environment
const NODE_ENV = process.env.NODE_ENV || 'development';

// Select configuration based on environment
let config;
switch (NODE_ENV) {
  case 'test':
    config = testConfig;
    break;
  case 'production':
    config = prodConfig;
    break;
  default:
    config = devConfig;
}

// Merge with environment variables (env vars take precedence)
const finalConfig = {
  ...config,
  // Override with actual environment variables if they exist
  NODE_ENV: process.env.NODE_ENV || config.NODE_ENV,
  PORT: process.env.PORT || config.PORT,
  API_ROUTE_TIMEOUT_MS: process.env.API_ROUTE_TIMEOUT_MS || config.API_ROUTE_TIMEOUT_MS,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || config.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || config.RATE_LIMIT_MAX_REQUESTS,
  CORS_ORIGINS: process.env.CORS_ORIGINS || config.CORS_ORIGINS,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  LOG_LEVEL: process.env.LOG_LEVEL || config.LOG_LEVEL,
};

// Validation
const requiredVars = ['OPENAI_API_KEY'];
const missingVars = requiredVars.filter(key => !finalConfig[key]);

if (missingVars.length > 0) {
  console.warn(`⚠️  Missing required environment variables: ${missingVars.join(', ')}`);
  if (NODE_ENV === 'production') {
    console.error('❌ Production environment requires all variables to be set');
    process.exit(1);
  }
}

// Log current configuration
console.log(`🔧 Environment: ${finalConfig.NODE_ENV}`);
console.log(`🔧 Port: ${finalConfig.PORT}`);
console.log(`🔧 API Timeout: ${finalConfig.API_ROUTE_TIMEOUT_MS}ms`);
console.log(`🔧 Rate Limit: ${finalConfig.RATE_LIMIT_MAX_REQUESTS} requests per ${finalConfig.RATE_LIMIT_WINDOW_MS}ms`);
console.log(`🔧 CORS Origins: ${finalConfig.CORS_ORIGINS}`);
console.log(`🔧 Log Level: ${finalConfig.LOG_LEVEL}`);
console.log(`🔧 Has OpenAI Key: ${!!finalConfig.OPENAI_API_KEY}`);

export default finalConfig;
