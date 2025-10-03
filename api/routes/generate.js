// api/routes/generate.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';
import Veo3Service from '../services/veo3Service.js';
import archiver from 'archiver';

const router = express.Router();

// Rate limiting (proxy-friendly)
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 10),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.ip,
});
router.use(limiter);

// ============================
// Generate segments endpoint
// ============================
router.post('/generate', async (req, res) => {
  const requestId = cryptoRandomId();
  const log = (msg, extra = {}) =>
    console.log(`[Generate:${requestId}] ${msg}`, extra);

  log('Request received:', {
    bodyKeys: Object.keys(req.body),
    scriptLength: req.body.script?.length || 0,
  });

  try {
    const {
      // core
      script,
      ageRange,
      gender,
      product,
      room,
      style,
      // knobs
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
      // advanced character details
      ethnicity,
      characterFeatures,
      clothingDetails,
      accentRegion,
      // optional run controls
      maxSegments = null,
      sequential = null,
    } = req.body;

    if (!script || script.trim().length < 50) {
      log('Validation failed: script too short');
      return res.status(400).json({ error: 'Script must be at least 50 characters long' });
    }

    log('Starting OpenAI generation with:', {
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat,
      continuationMode,
      settingMode,
      scriptWords: script.trim().split(/\s+/).length,
      maxSegments,
      sequential,
    });

    // Shared params object
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

    // -------- Continuation Mode --------
    if (continuationMode) {
      // 1) split script up-front (so we can run strictly sequential)
      let scriptSegments = await OpenAIService.splitScript(params.script);
      if (maxSegments && Number.isFinite(+maxSegments)) {
        scriptSegments = scriptSegments.slice(0, +maxSegments);
      }

      // 2) load template + generate base once (pass down to each segment)
      const template = await OpenAIService.loadTemplate(jsonFormat);
      const baseDescriptions = await OpenAIService.generateBaseDescriptions(params, template);

      // 3) derive locations of same length
      let locs = [];
      if (settingMode === 'single') {
        locs = Array(scriptSegments.length).fill(room);
      } else {
        const src = locations || [];
        locs = Array.from({ length: scriptSegments.length }, (_, i) => {
          return src[i] ?? src[src.length - 1] ?? 'living room';
        });
      }

      // 4) sequentially build segments so we can pass previousSegment
      const segments = [];
      for (let i = 0; i < scriptSegments.length; i++) {
        const segmentNumber = i + 1;
        console.log(`[OpenAI] >>> start segment ${segmentNumber}/${scriptSegments.length}`);
        console.time(`[seg ${segmentNumber}]`);
        
        const seg = await OpenAIService.generateContinuationStyleSegment({
          segmentNumber,
          totalSegments: scriptSegments.length,
          scriptPart: scriptSegments[i],
          baseDescriptions,            // <— reuse!
          template,
          currentLocation: locs[i],
          previousLocation: i > 0 ? locs[i - 1] : null,
          nextLocation: i < locs.length - 1 ? locs[i + 1] : null,
          previousSegment: i > 0 ? segments[i - 1] : null,
          ...params,
        });
        
        console.timeEnd(`[seg ${segmentNumber}]`);
        console.log(`[OpenAI] <<< end segment ${segmentNumber}/${scriptSegments.length}`);
        segments.push(seg);
      }

      const responsePayload = {
        success: true,
        segments,
        metadata: {
          totalSegments: segments.length,
          estimatedDuration: segments.length * 8,
          characterId: OpenAIService.generateCharacterId(params),
          mode: 'continuation',
        },
        voiceProfile: null, // could be added later via extractDetailedVoiceProfile
      };

      if (res.headersSent) {
        log('response already sent; skipping success send');
        return;
      }
      return res.json(responsePayload);
    }

    // -------- Standard Generation --------
    const result = await OpenAIService.generateSegments(params);

    log('Success:', {
      segments: result.segments.length,
      characterId: result.metadata.characterId,
      hasVoiceProfile: !!result.voiceProfile,
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
    log('Error:', {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
    });
    if (res.headersSent) {
      log('response already sent; skipping error send');
      return;
    }
    const code = err.message?.endsWith('_timeout') ? 504 : 500;
    return res.status(code).json({
      error: 'Failed to generate segments',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.response?.data : undefined,
    });
  }
});

// ============================
// Download segments as ZIP
// ============================
router.post('/download', async (req, res) => {
  try {
    const { segments } = req.body;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=veo3-segments.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    (segments || []).forEach((segment, index) => {
      archive.append(JSON.stringify(segment, null, 2), {
        name: `segment_${(index + 1).toString().padStart(2, '0')}.json`,
      });
    });

    archive.append(
      'Instructions for Veo 3:\n1. Upload each JSON in order\n2. Generate 8-second clips\n3. Edit together with overlaps',
      { name: 'README.txt' }
    );

    archive.finalize();
  } catch (error) {
    console.error('[Download] Error:', error);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Failed to create download' });
  }
});

// ============================
// Generate videos from segments
// ============================
router.post('/generate-videos', async (req, res) => {
  const requestId = cryptoRandomId();
  const log = (msg, extra = {}) =>
    console.log(`[GenerateVideos:${requestId}] ${msg}`, extra);

  log('Request received');

  try {
    const { segments } = req.body;
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'No segments provided for video generation' });
    }

    log(`Processing ${segments.length} segments`);
    const result = await Veo3Service.generateVideosForAllSegments(segments);

    log('Success:', {
      totalVideos: result.videos.length,
      status: result.videos[0]?.status,
    });

    if (res.headersSent) {
      log('response already sent; skipping success send');
      return;
    }

    return res.json({
      success: true,
      videos: result.videos,
      service: 'gemini',
      message: result.message || 'Video generation initiated successfully',
    });
  } catch (error) {
    console.error('[Generate Videos] Error:', error);
    if (res.headersSent) return;
    res.status(500).json({
      error: 'Failed to generate videos',
      message: error.message,
    });
  }
});

export default router;

// small helper
function cryptoRandomId() {
  // avoid Node:crypto import just for an id
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}