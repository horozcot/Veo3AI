import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAIService from '../services/openaiService.js';
import Veo3Service from '../services/veo3Service.js';
import archiver from 'archiver';

const router = express.Router();

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10 // limit each IP to 10 requests per minute
});
router.use(limiter);

// Utility: ensure any async call resolves within ms or throws "<label>_timeout"
const withTimeout = (promise, ms, label = 'op') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
    )
  ]);

// Generate segments endpoint
router.post('/generate', async (req, res) => {
  console.log('[Generate] Request received:', {
    bodyKeys: Object.keys(req.body),
    scriptLength: req.body.script?.length || 0
  });

  const CALL_TIMEOUT = 35_000; // 20s per upstream call

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
      // Advanced character details
      ethnicity,
      characterFeatures,
      clothingDetails,
      accentRegion
    } = req.body;
    
    // Validation
    if (!script || script.trim().length < 50) {
      console.log('[Generate] Validation failed: Script too short');
      return res.status(400).json({ 
        error: 'Script must be at least 50 characters long' 
      });
    }
    
    console.log('[Generate] Starting OpenAI generation with:', {
      ageRange,
      gender,
      product,
      room,
      style,
      jsonFormat,
      continuationMode,
      settingMode,
      scriptWords: script.trim().split(/\s+/).length
    });
    
    // Prepare parameters
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
      accentRegion
    };
    
    // Generate segments using OpenAI with timeout
    const result = continuationMode 
      ? await withTimeout(
          OpenAIService.generateSegmentsWithVoiceProfile(params),
          CALL_TIMEOUT,
          'openai_voiceProfile'
        )
      : await withTimeout(
          OpenAIService.generateSegments(params),
          CALL_TIMEOUT,
          'openai_segments'
        );
    
    console.log('[Generate] Success:', {
      segments: result.segments.length,
      characterId: result.metadata.characterId,
      hasVoiceProfile: !!result.voiceProfile
    });
    
    res.json({
      success: true,
      segments: result.segments,
      metadata: result.metadata,
      voiceProfile: result.voiceProfile
    });
    
  } catch (error) {
    console.error('[Generate] Error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    const code = error.message?.endsWith('_timeout') ? 504 : 500;
    res.status(code).json({ 
      error: 'Failed to generate segments',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
    });
  }
});

// Download segments as ZIP
router.post('/download', async (req, res) => {
  try {
    const { segments } = req.body;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=veo3-segments.zip');
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    // Add each segment as a JSON file
    segments.forEach((segment, index) => {
      archive.append(JSON.stringify(segment, null, 2), {
        name: `segment_${(index + 1).toString().padStart(2, '0')}.json`
      });
    });
    
    // Add instructions file
    archive.append('Instructions for Veo 3:\n1. Upload each JSON in order\n2. Generate 8-second clips\n3. Edit together with overlaps', {
      name: 'README.txt'
    });
    
    archive.finalize();
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to create download' });
  }
});

// Generate videos from segments endpoint
router.post('/generate-videos', async (req, res) => {
  console.log('[Generate Videos] Request received');
  
  try {
    const { segments } = req.body;
    
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ 
        error: 'No segments provided for video generation' 
      });
    }
    
    console.log(`[Generate Videos] Processing ${segments.length} segments`);
    
    // Use Gemini/Vertex AI for video descriptions
    const result = await withTimeout(
      Veo3Service.generateVideosForAllSegments(segments),
      CALL_TIMEOUT,
      'veo3_videos'
    );
    
    console.log('[Generate Videos] Success:', {
      totalVideos: result.videos.length,
      status: result.videos[0]?.status
    });
    
    res.json({
      success: true,
      videos: result.videos,
      service: 'gemini',
      message: result.message || 'Video generation initiated successfully'
    });
    
  } catch (error) {
    console.error('[Generate Videos] Error:', error);
    const code = error.message?.endsWith('_timeout') ? 504 : 500;
    res.status(code).json({ 
      error: 'Failed to generate videos',
      message: error.message
    });
  }
});

export default router;
