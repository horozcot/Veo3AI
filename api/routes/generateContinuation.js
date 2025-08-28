// api/routes/generateContinuation.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';

const router = express.Router();

// -------- Rate limiting (proxy-friendly) --------
const limiter = rateLimit({
  windowMs: 60 * 1000,                 // 1 minute
  max: 10,                             // 10 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Render sets XFF; don't hard-fail
  keyGenerator: (req) => req.ip,            // honors app.set('trust proxy', 1)
});
router.use(limiter);

// ================================
// POST /api/generate-continuation
// ================================
router.post('/generate-continuation', async (req, res) => {
  const requestId = cryptoRandomId();
  const log = (msg, extra = {}) =>
    console.log(`[Continuation:${requestId}] ${msg}`, extra);

  log('Request received', {
    bodyKeys: Object.keys(req.body || {}),
  });

  try {
    const {
      imageUrl,
      script,
      voiceProfile,
      previousSegment,
      maintainEnergy,
      product,

      // Optional context (future use)
      ageRange,
      gender,
      style,
      cameraStyle,
      timeOfDay,
      backgroundLife,
    } = req.body || {};

    // ---- Validation ----
    const missing = [];
    if (!imageUrl) missing.push('imageUrl');
    if (!script || typeof script !== 'string' || script.trim().length < 10)
      missing.push('script(>=10 chars)');
    if (!voiceProfile) missing.push('voiceProfile');
    if (!product) missing.push('product');

    if (missing.length) {
      log('Validation failed', { missing });
      return res.status(400).json({
        error: 'Missing or invalid required fields',
        missing,
      });
    }

    log('Generating continuation with params', {
      imageUrl,
      scriptLen: script.trim().length,
      hasPrev: !!previousSegment,
      maintainEnergy: !!maintainEnergy,
      product,
    });

    // ---- Generate continuation segment ----
    const segment = await OpenAIService.generateContinuationSegment({
      imageUrl,
      script: script.trim(),
      voiceProfile,
      previousSegment: previousSegment || null,
      maintainEnergy: !!maintainEnergy,
      product,

      // pass-through (non-breaking)
      ageRange,
      gender,
      style,
      cameraStyle,
      timeOfDay,
      backgroundLife,
    });

    log('Success');

    if (res.headersSent) {
      console.warn(
        `[Continuation:${requestId}] Response already sent; skipping success body.`
      );
      return;
    }

    return res.json({
      success: true,
      segment,
      requestId,
    });
  } catch (error) {
    console.error(`[Continuation:${requestId}] Error`, {
      message: error?.message,
      stack: error?.stack,
      response: error?.response?.data,
    });

    if (res.headersSent) {
      console.error(
        `[Continuation:${requestId}] Response already sent; skipping error body.`
      );
      return;
    }

    const isTimeout = typeof error?.message === 'string' && error.message.endsWith('_timeout');
    return res.status(isTimeout ? 504 : 500).json({
      error: 'Failed to generate continuation',
      message: isTimeout ? 'openai_timeout' : 'internal_error',
      requestId,
    });
  }
});

export default router;

// -------- helpers --------
function cryptoRandomId() {
  // Small, dependency-free request id (good enough for logs)
  return Math.random().toString(36).slice(2, 10);
}
