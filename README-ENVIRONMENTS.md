# Environment Configuration Guide

This project now supports multiple environments with the same timeouts and rate limits across all environments.

## Available Environments

### 1. Development Environment
- **Command**: `npm run dev` or `npm run dev:watch`
- **Environment**: `NODE_ENV=development`
- **Port**: 3001
- **API Timeout**: 360,000ms (6 minutes)
- **Rate Limit**: 10 requests per 60 seconds
- **CORS**: localhost:3000, localhost:3001
- **Logging**: Debug level

### 2. Testing Environment
- **Command**: `npm run test:env`
- **Environment**: `NODE_ENV=test`
- **Port**: 3001
- **API Timeout**: 900,000ms (15 minutes) - same as production
- **Rate Limit**: 10 requests per 60 seconds - same as production
- **CORS**: localhost:3000, localhost:3001 + staging URL
- **Logging**: Debug level

### 3. Production Environment
- **Command**: `npm run prod:env` or `npm start`
- **Environment**: `NODE_ENV=production`
- **Port**: 3001
- **API Timeout**: 900,000ms (15 minutes)
- **Rate Limit**: 10 requests per 60 seconds
- **CORS**: Production URLs only
- **Logging**: Info level

## Configuration Files

The configuration is managed through:
- `config/index.js` - Centralized config loader
- `config/env.development.js` - Development settings
- `config/env.test.js` - Testing settings
- `config/env.production.js` - Production settings

## Environment Variables

All environments use the same timeout and rate limit values as requested:

```bash
# API Configuration (same across all environments)
API_ROUTE_TIMEOUT_MS=900000  # 15 minutes for test/prod, 6 minutes for dev
RATE_LIMIT_WINDOW_MS=60000   # 60 seconds
RATE_LIMIT_MAX_REQUESTS=10   # 10 requests per window

# Required API Keys
OPENAI_API_KEY=your_key_here
```

## Deployment

### Staging Deployment (Testing)
- Use `render.staging.yaml` for staging deployment
- Deploys to: `https://ugc-script-splitter-staging.onrender.com`
- Uses testing environment configuration

### Production Deployment
- Use `render.yaml` for production deployment
- Uses production environment configuration
- Deploys to your main production URL

## Usage Examples

```bash
# Development with hot reload
npm run dev:watch

# Testing environment
npm run test:env

# Production environment
npm run prod:env

# Build only
npm run build
```

## Environment Detection

The application automatically detects the environment based on `NODE_ENV`:
- `development` → Development config
- `test` → Testing config  
- `production` → Production config
- Default → Development config

## Key Features

✅ **Same timeouts and rate limits** across all environments  
✅ **Environment-specific CORS** configuration  
✅ **Centralized configuration** management  
✅ **Automatic environment detection**  
✅ **Validation** for required variables  
✅ **Clear logging** of active configuration  
