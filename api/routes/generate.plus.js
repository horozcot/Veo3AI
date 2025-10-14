// api/routes/generate.plus.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';
import archiver from 'archiver';

const router = express.Router();

// Rate limiting (proxy-friendly, same as generate.js)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.ip,
});
router.use(limiter);

// ============================
// Standard Plus (enhanced JSON)
// ============================
router.post('/generate-plus', async (req, res) => {
  const reqId = cryptoRandomId();
  const log = (msg, obj) =>
    console.log(`[GeneratePlus:${reqId}] ${msg}`, obj ?? '');

  log('Request received:', {
    bodyKeys: Object.keys(req.body || {}),
    scriptLength: req.body?.script?.length || 0,
  });

  try {
    const {
      script,
      ageRange,
      gender,
      product,
      room,
      style,
      // Force enhanced for Plus unless caller overrides intentionally
      jsonFormat = 'enhanced',

      // Optional Plus controls
      maxSegments = null,       // e.g. 2
      sequential = null,        // true/false (currently not changing behavior here)

      // Shared optional fields
      voiceType,
      energyLevel,
      settingMode = 'single',
      locations = [],
      cameraStyle,
      timeOfDay,
      backgroundLife,
      productStyle,
      energyArc,
      narrativeStyle,
      ethnicity,
      characterFeatures,
      clothingDetails,
      accentRegion,
      // ad agency framework fields
      persona,
      coreDesire,
      awareness,
      promise,
      patternBreaker,
      headlinePattern,
      headline,
      creativeType,
    } = req.body || {};

    // Validation
    if (!script || script.trim().length < 50) {
      log('Validation failed: Script too short');
      return res.status(400).json({
        error: 'Script must be at least 50 characters long',
      });
    }

    log('Starting OpenAI generation with:', {
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat,
      settingMode,
      scriptWords: script.trim().split(/\s+/).length,
      maxSegments,
      sequential,
    });

    const params = {
      script: script.trim(),
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat, // important: 'enhanced' for Plus
      voiceType,
      energyLevel,
      settingMode,
      locations,
      cameraStyle,
      timeOfDay,
      backgroundLife,
      productStyle,
      energyArc,
      narrativeStyle,
      ethnicity,
      characterFeatures,
      clothingDetails,
      accentRegion,
      persona,
      coreDesire,
      awareness,
      promise,
      patternBreaker,
      headlinePattern,
      headline,
      creativeType,
    };

    // Use the same hardened service as Standard
    const result = await OpenAIService.generateSegments(params);

    // If caller asked to cap number of segments, enforce here
    let out = result;
    if (maxSegments && Number.isFinite(+maxSegments)) {
      const n = Math.max(1, +maxSegments);
      out = {
        ...result,
        segments: result.segments.slice(0, n),
        metadata: {
          ...result.metadata,
          totalSegments: Math.min(result.metadata.totalSegments || result.segments.length, n),
          estimatedDuration: n * 8,
        },
      };
      log(`Applied maxSegments=${n}`);
    }

    log('Success:', {
      segments: out.segments.length,
      characterId: out.metadata.characterId,
    });

    if (res.headersSent) {
      console.warn('[GeneratePlus] Response already sent (likely guard timeout). Skipping success send.');
      return;
    }

    return res.json({
      success: true,
      segments: out.segments,
      metadata: out.metadata,
    });
  } catch (error) {
    console.error(`[GeneratePlus:${reqId}] Error:`, {
      message: error?.message,
      stack: error?.stack,
      response: error?.response?.data,
    });

    if (res.headersSent) {
      console.error('[GeneratePlus] Response already sent; skipping error response');
      return;
    }

    const code = error?.message?.endsWith('_timeout') ? 504 : 500;
    return res.status(code).json({
      error: 'Failed to generate segments (plus)',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

// Optional: ZIP download for Plus (same as generate.js, provided for parity)
router.post('/download-plus', async (req, res) => {
  try {
    const { segments } = req.body || {};
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=veo3-segments-plus.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    (segments || []).forEach((segment, index) => {
      archive.append(JSON.stringify(segment, null, 2), {
        name: `segment_${String(index + 1).padStart(2, '0')}.json`,
      });
    });

    archive.append(
      'Instructions for Veo 3 (Plus):\n1. Upload each JSON in order\n2. Generate 8-second clips\n3. Edit together with overlaps',
      { name: 'README.txt' }
    );

    archive.finalize();
  } catch (error) {
    console.error('[DownloadPlus] Error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create download (plus)' });
  }
});

export default router;

// tiny id helper for log correlation
function cryptoRandomId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    // eslint-disable-next-line no-mixed-operators
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
