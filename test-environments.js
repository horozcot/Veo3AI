// Test script to verify environment configurations
import config from './config/index.js';

console.log('🔧 Environment Configuration Test');
console.log('================================');
console.log(`Current Environment: ${config.NODE_ENV}`);
console.log(`Port: ${config.PORT}`);
console.log(`API Timeout: ${config.API_ROUTE_TIMEOUT_MS}ms`);
console.log(`Rate Limit: ${config.RATE_LIMIT_MAX_REQUESTS} requests per ${config.RATE_LIMIT_WINDOW_MS}ms`);
console.log(`CORS Origins: ${config.CORS_ORIGINS}`);
console.log(`Log Level: ${config.LOG_LEVEL}`);
console.log(`Has OpenAI Key: ${!!config.OPENAI_API_KEY}`);
console.log('================================');

// Test environment-specific values
if (config.NODE_ENV === 'development') {
  console.log('✅ Development environment detected');
  console.log(`   - Timeout: ${config.API_ROUTE_TIMEOUT_MS}ms (6 minutes)`);
} else if (config.NODE_ENV === 'test') {
  console.log('✅ Testing environment detected');
  console.log(`   - Timeout: ${config.API_ROUTE_TIMEOUT_MS}ms (15 minutes)`);
} else if (config.NODE_ENV === 'production') {
  console.log('✅ Production environment detected');
  console.log(`   - Timeout: ${config.API_ROUTE_TIMEOUT_MS}ms (15 minutes)`);
} else {
  console.log('⚠️  Unknown environment, using defaults');
}
