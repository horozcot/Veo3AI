import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';
import Veo3Service from '../services/veo3Service.js';
import archiver from 'archiver';
import crypto from 'crypto';

const router = express.Router();

// Rate limiting (proxy-friendly)
const limiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 10,                     // 10 req/min/ip
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // avoid strict XFF check on Render
  keyGenerator: (req) => req.ip,            // uses trust proxy (set in server.js)
});
router.use(limiter);

// Small helper to classify errors -> HTTP status
function statusFromError(err) {
  const msg = String(err?.message || '');
  if (msg.endsWith('_timeout') || msg.includes('route_timeout')) return 504;
  if (msg.startsWith('json_parse_error_') || msg.includes('json_repair_failed')) return 502;
  return 500;
}

// ============================
// Generate segments endpoint
// ============================
router.post('/generate', async (req, res) => {
  // Per-request id for better tracing
  const reqId = crypto.randomUUID();
  res.setHeader('X-Request-Id', reqId);

  console.log(`[Generate:${reqId}] Request received:`, {
    bodyKeys: Object.keys(req.body),
    scriptLength: req.body.script?.length || 0
  });

  try {
    const { 
      script, 
      ageRange, 
      gender, 
      product, 
      room, 
      style, 
      jsonFormat = 'standard',
      continuationMode = false,
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
      // optional knobs (harmless if service ignores them)
      maxSegments,
      sequential
    } = req.body;

    // Validation
    if (!script || script.trim().length < 50) {
      console.log(`[Generate:${reqId}] Validation failed: Script too short`);
      return res.status(400).json({ 
        error: 'Script must be at least 50 characters long' 
      });
    }

    console.log(`[Generate:${reqId}] Starting OpenAI generation with:`, {
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat,
      continuationMode,
      settingMode,
      scriptWords: script.trim().split(/\s+/).length,
      maxSegments: maxSegments ?? null,
      sequential: sequential ?? null
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
      // pass-through optional knobs
      maxSegments,
      sequential
    };

    const result = continuationMode 
      ? await OpenAIService.generateSegmentsWithVoiceProfile(params)
      : await OpenAIService.generateSegments(params);

    console.log(`[Generate:${reqId}] Success:`, {
      segments: result.segments.length,
      characterId: result.metadata.characterId,
      hasVoiceProfile: !!result.voiceProfile
    });

    if (res.headersSent) {
      console.warn(`[Generate:${reqId}] Response already sent (likely guard timeout). Skipping success send.`);
      return;
    }

    return res.json({
      success: true,
      segments: result.segments,
      metadata: result.metadata,
      voiceProfile: result.voiceProfile,
      requestId: reqId
    });

  } catch (error) {
    console.error(`[Generate:${reqId}] Error:`, {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });

    if (res.headersSent) {
      console.error(`[Generate:${reqId}] Response already sent; skipping error response`);
      return;
    }

    const code = statusFromError(error);
    return res.status(code).json({ 
      error: 'Failed to generate segments',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined,
      requestId: reqId
    });
  }
});

// ============================
// Download segments as ZIP
// ============================
router.post('/download', async (req, res) => {
  const reqId = crypto.randomUUID();
  res.setHeader('X-Request-Id', reqId);
  try {
    const { segments } = req.body;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=veo3-segments.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    segments.forEach((segment, index) => {
      archive.append(JSON.stringify(segment, null, 2), {
        name: `segment_${(index + 1).toString().padStart(2, '0')}.json`
      });
    });

    archive.append(
      'Instructions for Veo 3:\n1. Upload each JSON in order\n2. Generate 8-second clips\n3. Edit together with overlaps',
      { name: 'README.txt' }
    );

    archive.finalize();
  } catch (error) {
    console.error(`[Download:${reqId}] Error:`, error);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Failed to create download', requestId: reqId });
  }
});

// ============================
// Generate videos from segments
// ============================
router.post('/generate-videos', async (req, res) => {
  const reqId = crypto.randomUUID();
  res.setHeader('X-Request-Id', reqId);
  console.log(`[Generate Videos:${reqId}] Request received`);

  try {
    const { segments } = req.body;
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'No segments provided for video generation', requestId: reqId });
    }

    console.log(`[Generate Videos:${reqId}] Processing ${segments.length} segments`);
    const result = await Veo3Service.generateVideosForAllSegments(segments);

    console.log(`[Generate Videos:${reqId}] Success:`, {
      totalVideos: result.videos.length,
      status: result.videos[0]?.status
    });

    if (res.headersSent) {
      console.warn(`[Generate Videos:${reqId}] Response already sent. Skipping success send.`);
      return;
    }

    return res.json({
      success: true,
      videos: result.videos,
      service: 'gemini',
      message: result.message || 'Video generation initiated successfully',
      requestId: reqId
    });

  } catch (error) {
    console.error(`[Generate Videos:${reqId}] Error:`, error);
    if (res.headersSent) return;
    res.status(500).json({ 
      error: 'Failed to generate videos',
      message: error.message,
      requestId: reqId
    });
  }
});

export default router;
