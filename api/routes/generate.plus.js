// api/routes/generate.plus.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';
import archiver from 'archiver';

const router = express.Router();

// Rate limiting (proxy-friendly)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.ip,
});
router.use(limiter);

// helper id
function rid() {
  return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

// ============================
// Standard Plus (enhanced)
// ============================
router.post('/generate-plus', async (req, res) => {
  const id = rid();
  console.log(`[Generate+:${id}] Request received:`, {
    bodyKeys: Object.keys(req.body),
    scriptLength: req.body.script?.length || 0,
  });

  try {
    const {
      script,
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat = 'enhanced', // Plus defaults to enhanced
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
      // Controls
      maxSegments = null,
      sequential = null,
    } = req.body;

    if (!script || script.trim().length < 50) {
      console.log(`[Generate+:${id}] Validation failed: Script too short`);
      return res.status(400).json({ error: 'Script must be at least 50 characters long' });
    }

    console.log(`[Generate+:${id}] Starting with:`, {
      ageRange, gender, product, room, style, jsonFormat, settingMode,
      scriptWords: script.trim().split(/\s+/).length, maxSegments, sequential
    });

    const params = {
      script: script.trim(),
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat,
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
      maxSegments,
      sequential,
    };

    const result = await OpenAIService.generateSegments(params);

    console.log(`[Generate+:${id}] Success:`, {
      segments: result.segments.length,
      characterId: result.metadata.characterId,
    });

    if (res.headersSent) {
      console.warn(`[Generate+:${id}] Response already sent. Skipping success send.`);
      return;
    }
    return res.json({
      success: true,
      segments: result.segments,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error(`[Generate+:${id}] Error:`, {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });
    if (res.headersSent) return;
    const code = error.message?.endsWith('_timeout') ? 504 : 500;
    return res.status(code).json({
      error: 'Failed to generate enhanced segments',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined,
    });
  }
});

// Optional ZIP (mirrors /download)
router.post('/download-plus', async (req, res) => {
  const id = rid();
  try {
    const { segments } = req.body;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=veo3-segments-plus.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    segments.forEach((segment, index) => {
      archive.append(JSON.stringify(segment, null, 2), {
        name: `segment_${(index + 1).toString().padStart(2, '0')}.json`,
      });
    });

    archive.append(
      'Instructions for Veo 3 (Enhanced):\n1. Upload each JSON in order\n2. Generate 8-second clips\n3. Edit together with overlaps',
      { name: 'README.txt' }
    );

    archive.finalize();
  } catch (error) {
    console.error(`[Download+:${id}] Error:`, error);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Failed to create download' });
  }
});

export default router;
