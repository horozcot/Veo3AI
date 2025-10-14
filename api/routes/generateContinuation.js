// api/routes/generateContinuation.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';

const router = express.Router();

// proxy-friendly rate limit (same as /generate)
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 10),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.ip,
});
router.use(limiter);

// tiny id helper for logs
function randomId() {
  return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

// POST /api/generate-continuation
router.post('/generate-continuation', async (req, res) => {
  const requestId = randomId();
  const log = (msg, extra = {}) =>
    console.log(`[Continuation:${requestId}] ${msg}`, extra);

  try {
    const {
      // required
      script,
      product,
      voiceProfile,
      // optional scene/character knobs (defaults mirror Standard)
      ageRange,
      gender,
      style,
      jsonFormat = 'enhanced',
      settingMode = 'single',
      room = 'living room',
      locations = [],
      cameraStyle,
      timeOfDay,
      backgroundLife,
      productStyle,
      energyArc,
      narrativeStyle,
      // advanced character details
      ethnicity,
      characterFeatures,
      clothingDetails,
      accentRegion,
      // ad agency framework fields
      awareness,
      promise,
      patternBreaker,
      headlinePattern,
      headline,
      creativeType,
      // continuity inputs
      previousSegment = null,
    } = req.body || {};

    // basic validation
    if (!script || script.trim().length < 50) {
      return res.status(400).json({ error: 'Script must be at least 50 characters long' });
    }
    // product is optional (talking-only scripts allowed)
    if (!voiceProfile || typeof voiceProfile !== 'object') {
      return res.status(400).json({ error: 'voiceProfile (object) is required' });
    }

    log('input accepted', {
      scriptLength: script.length,
      hasPrev: !!previousSegment,
      jsonFormat,
    });

    // 1) load template & base descriptions (same base as Standard)
    const template = await OpenAIService.loadTemplate(jsonFormat);
    const baseDescriptions = await OpenAIService.generateBaseDescriptions(
      {
        ageRange,
        gender,
        product,
        room,
        style,
        jsonFormat,
        settingMode,
        locations,
        cameraStyle,
        timeOfDay,
        backgroundLife,
        productStyle,
        energyArc,
        narrativeStyle,
      },
      template
    );

    // 2) generate multiple segments like standard mode
    log('Calling OpenAIService.generateSegments with params:', {
      scriptLength: script.length,
      product,
      ageRange,
      gender,
      jsonFormat
    });
    
    const result = await OpenAIService.generateSegments({
      script,
      product,
      ageRange,
      gender,
      room,
      style,
      jsonFormat,
      settingMode,
      locations,
      cameraStyle,
      timeOfDay,
      backgroundLife,
      productStyle,
      energyArc,
      narrativeStyle,
      voiceType: voiceProfile.voiceType,
      energyLevel: voiceProfile.energyLevel,
      accentRegion: voiceProfile.accentRegion,
      ethnicity,
      characterFeatures,
      clothingDetails,
      // ad agency framework fields
      awareness,
      promise,
      patternBreaker,
      headlinePattern,
      headline,
      creativeType,
      template,
      baseDescriptions,
      characterId: OpenAIService.generateCharacterId({
        ageRange,
        gender,
        voiceType: voiceProfile.voiceType,
        energyLevel: voiceProfile.energyLevel,
        accentRegion: voiceProfile.accentRegion,
        ethnicity,
        characterFeatures,
        clothingDetails
      }),
      voiceProfile: null // could be added later via extractDetailedVoiceProfile
    });

    log('OpenAIService.generateSegments result:', {
      hasSegments: !!result.segments,
      segmentsCount: result.segments?.length,
      hasMetadata: !!result.metadata
    });

  if (res.headersSent) {
    log('response already sent; skipping success send');
    return;
  }
  return res.json({
    success: true,
    segments: result.segments,
    metadata: result.metadata,
    voiceProfile: result.voiceProfile,
  });
  } catch (err) {
    console.error('[Continuation] error:', err);
    if (!res.headersSent) {
      const code = err?.message?.endsWith('_timeout') ? 504 : 500;
      return res.status(code).json({ error: 'Failed to generate continuation', message: err.message });
    }
  }
});

export default router;