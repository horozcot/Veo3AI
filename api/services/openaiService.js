// api/services/openaiService.js
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------
// Utility: withTimeout(labelled)
// -------------------------------
const withTimeout = (promise, ms, label = 'op') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
    ),
  ]);

// -------------------------------
// Config: timeouts & concurrency
// -------------------------------
const OPENAI_CALL_TIMEOUT =
  Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10) || 60_000; // 60s default

const SEGMENT_CONCURRENCY = 2; // keep pressure low to avoid guard timeouts

// simple map with concurrency control
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  let active = 0;

  return await new Promise((resolve, reject) => {
    const next = () => {
      if (index >= items.length && active === 0) return resolve(results);
      while (active < concurrency && index < items.length) {
        const i = index++;
        active++;
        Promise.resolve(worker(items[i], i))
          .then((r) => {
            results[i] = r;
            active--;
            next();
          })
          .catch((e) => reject(e));
      }
    };
    next();
  });
}

// -------------------------------
// JSON repair helpers
// -------------------------------
function sliceToOuterBraces(str) {
  const first = str.indexOf('{');
  const last = str.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return str;
  return str.slice(first, last + 1);
}

function basicJsonCleanup(str) {
  // normalize newlines & remove code fences / nulls
  let s = (str || '').replace(/\r/g, '').replace(/\u0000/g, '');
  s = s.replace(/```(?:json)?/gi, '').replace(/```/g, '');
  // remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  // keep the outermost object
  s = sliceToOuterBraces(s);
  return s.trim();
}

function safeParseJSON(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    try {
      const cleaned = basicJsonCleanup(raw);
      return { ok: true, value: JSON.parse(cleaned) };
    } catch (e2) {
      return { ok: false, error: e2, raw };
    }
  }
}

async function repairJSONWithModel(openai, raw, maxTokens = 3000) {
  const repair = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You fix malformed JSON. Return ONLY valid JSON (single JSON object). No commentary before or after.',
        },
        {
          role: 'user',
          content: `Fix this into valid JSON (object only). Keep keys/values intact:\n${raw}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: maxTokens,
    }),
    OPENAI_CALL_TIMEOUT,
    'openai_json_repair'
  );

  const repairedRaw = repair.choices?.[0]?.message?.content || '';
  const parsed = safeParseJSON(repairedRaw);
  if (!parsed.ok) throw new Error('json_repair_failed');
  return parsed.value;
}

// -------------------------------
// Service class
// -------------------------------
class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async loadTemplate(format = 'standard') {
    const filename =
      format === 'enhanced'
        ? 'veo3-enhanced-continuity.md'
        : 'veo3-json-guidelines.md';

    const templatePath = path.join(__dirname, '../../instructions/', filename);
    console.log(`[OpenAI] Loading template: ${filename}`);

    return await fs.readFile(templatePath, 'utf8');
  }

  async generateSegments(params) {
    console.log(
      '[OpenAI] Starting generation with format:',
      params.jsonFormat || 'standard'
    );
    console.log('[OpenAI] Setting mode:', params.settingMode || 'single');

    const template = await this.loadTemplate(params.jsonFormat);

    // Step 1: Analyze and split script
    let scriptSegments = await this.splitScript(params.script);

    // Optional cap from route/body for debugging/short runs
    if (params?.maxSegments && Number.isFinite(+params.maxSegments)) {
      scriptSegments = scriptSegments.slice(0, +params.maxSegments);
    }

    console.log('[OpenAI] Script split into', scriptSegments.length, 'segments');

    // Step 1b: decide strategy based on job size (safe defaults for long scripts)
    const autoSequential =
      params.sequential === undefined ? scriptSegments.length >= 8 : !!params.sequential;

    const effectiveConcurrency = autoSequential ? 1 : SEGMENT_CONCURRENCY;

    // Prepare location data mapped to segments length
    let locations = [];
    if (params.settingMode === 'single') {
      locations = Array(scriptSegments.length).fill(params.room);
    } else {
      const src = params.locations || [];
      locations = Array.from({ length: scriptSegments.length }, (_, i) => {
        return src[i] ?? src[src.length - 1] ?? 'living room';
      });
    }

    // Step 2: Base descriptions
    console.log('[OpenAI] Generating base descriptions...');
    const baseDescriptions = await withTimeout(
      this.generateBaseDescriptions(params, template),
      OPENAI_CALL_TIMEOUT,
      'openai_base'
    );
    console.log('[OpenAI] Base descriptions generated');

    console.log(
      `[OpenAI] Generating individual segments with concurrency = ${effectiveConcurrency} (sequential=${autoSequential})`
    );

    // Helper to build a single segment
    const makeSegment = async (scriptPart, i, previousSegment) => {
      const idx = i + 1;
      console.log(`[OpenAI] Generating segment ${idx}/${scriptSegments.length}`);
      const seg = await withTimeout(
        this.generateSegment({
          segmentNumber: idx,
          totalSegments: scriptSegments.length,
          scriptPart,
          baseDescriptions,
          previousSegment, // null in concurrent mode
          template,
          currentLocation: locations[i],
          previousLocation: i > 0 ? locations[i - 1] : null,
          nextLocation: i < locations.length - 1 ? locations[i + 1] : null,
          ...params,
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_segment_${idx}`
      );
      return seg;
    };

    // Step 3: Generate each segment
    let segments;

    if (autoSequential) {
      // Sequential mode: preserve previousSegment continuity
      segments = [];
      for (let i = 0; i < scriptSegments.length; i++) {
        const prev = i > 0 ? segments[i - 1] : null;
        segments.push(await makeSegment(scriptSegments[i], i, prev));
      }
    } else {
      // Concurrent mode: never read from segments[] inside the worker
      segments = await mapWithConcurrency(
        scriptSegments,
        effectiveConcurrency,
        async (scriptPart, i) => {
          // NO reference to segments[i-1] here
          return await makeSegment(scriptPart, i, null);
        }
      );
    }

    return {
      segments,
      metadata: {
        totalSegments: segments.length,
        estimatedDuration: segments.length * 8,
        characterId: this.generateCharacterId(params),
      },
    };
  }

  async splitScript(script) {
    const wordsPerSecond = 150 / 60; // 2.5 wps
    const minWordsFor6Seconds = 15;
    const targetWordsFor8Seconds = 20;
    const maxWordsFor8Seconds = 22;

    console.log('[OpenAI] Script splitting parameters:', {
      minWords: minWordsFor6Seconds,
      targetWords: targetWordsFor8Seconds,
      maxWords: maxWordsFor8Seconds,
    });

    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
    const rawSegments = [];
    let currentSegment = '';
    let currentWordCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const sentenceWords = sentence.split(/\s+/).length;

      if (currentSegment === '') {
        currentSegment = sentence;
        currentWordCount = sentenceWords;

        while (currentWordCount < minWordsFor6Seconds && i + 1 < sentences.length) {
          i++;
          const nextSentence = sentences[i].trim();
          const nextWords = nextSentence.split(/\s+/).length;

          if (currentWordCount + nextWords > maxWordsFor8Seconds) {
            if (currentWordCount < minWordsFor6Seconds) {
              currentSegment += ' ' + nextSentence;
              currentWordCount += nextWords;
            } else {
              i--;
              break;
            }
          } else {
            currentSegment += ' ' + nextSentence;
            currentWordCount += nextWords;
          }
        }

        rawSegments.push(currentSegment);
        currentSegment = '';
        currentWordCount = 0;
      }
    }

    const finalSegments = [];
    for (let i = 0; i < rawSegments.length; i++) {
      const segment = rawSegments[i];
      const wordCount = segment.split(/\s+/).length;
      const duration = wordCount / wordsPerSecond;

      console.log(
        `[OpenAI] Raw segment ${i + 1}: ${wordCount} words, ~${duration.toFixed(
          1
        )}s speaking time`
      );

      if (wordCount < minWordsFor6Seconds && i < rawSegments.length - 1) {
        const nextSegment = rawSegments[i + 1];
        const nextWords = nextSegment.split(/\s+/).length;

        if (nextWords > minWordsFor6Seconds) {
          const nextSentences =
            nextSegment.match(/[^.!?]+[.!?]+/g) || [nextSegment];
          if (nextSentences.length > 1) {
            const borrowedSentence = nextSentences[0];
            const borrowedWords = borrowedSentence.split(/\s+/).length;

            if (wordCount + borrowedWords <= maxWordsFor8Seconds) {
              finalSegments.push(segment + ' ' + borrowedSentence);
              rawSegments[i + 1] = nextSentences.slice(1).join(' ');
              continue;
            }
          }
        }

        if (i < rawSegments.length - 1) {
          const merged = segment + ' ' + rawSegments[i + 1];
          const mergedWords = merged.split(/\s+/).length;

          if (mergedWords <= 30) {
            finalSegments.push(merged);
            i++;
            continue;
          }
        }
      }

      finalSegments.push(segment);
    }

    console.log('[OpenAI] Final segment distribution:');
    finalSegments.forEach((segment, i) => {
      const wordCount = segment.split(/\s+/).length;
      const duration = wordCount / wordsPerSecond;
      console.log(
        `  Segment ${i + 1}: ${wordCount} words, ~${duration.toFixed(1)}s speaking time`
      );
      if (duration < 6) {
        console.warn(`  ⚠️  Segment ${i + 1} is under 6 seconds!`);
      }
    });

    return finalSegments;
  }

  async generateBaseDescriptions(params, template) {
    console.log('[OpenAI] Calling API for base descriptions');
    try {
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${template}\n\nGenerate the base descriptions that will remain IDENTICAL across all segments. Follow the exact word count requirements. Return ONLY valid JSON.`,
            },
            {
              role: 'user',
              content: `Create base descriptions for:
Age: ${params.ageRange}
Gender: ${params.gender}
Setting Mode: ${params.settingMode || 'single'}
${params.settingMode === 'single' ? `Room: ${params.room}` : `Locations: ${params.locations?.join(', ') || 'various'}`}
Style: ${params.style}
Product: ${params.product}
Camera Style: ${params.cameraStyle || 'static-handheld'}
Time of Day: ${params.timeOfDay || 'morning'}
Background Life: ${params.backgroundLife ? 'Yes' : 'No'}
Product Display: ${params.productStyle || 'natural'}
Energy Arc: ${params.energyArc || 'consistent'}
Narrative Style: ${params.narrativeStyle || 'direct-review'}

Return a JSON object with these exact keys:
{
  "physical": "[100+ words or 200+ if enhanced]",
  "clothing": "[100+ words or 150+ if enhanced]",
  "environment": "[150+ words or 250+ if enhanced]",
  "voice": "[50+ words or 100+ if enhanced]",
  "productHandling": "[50+ words]"
}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 4500,
        }),
        OPENAI_CALL_TIMEOUT,
        'openai_base'
      );

      const raw = response.choices?.[0]?.message?.content || '';
      let parsed = safeParseJSON(raw);
      if (!parsed.ok) {
        console.warn('[OpenAI] Base JSON parse failed — attempting repair');
        parsed = { ok: true, value: await repairJSONWithModel(this.openai, raw, 2000) };
      }
      console.log('[OpenAI] Base descriptions parsed successfully');
      return parsed.value;
    } catch (error) {
      console.error('[OpenAI] Error in generateBaseDescriptions:', error);
      throw error;
    }
  }

  async generateSegment(params) {
    try {
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${params.template}\n\nGenerate a Veo 3 JSON segment following the exact structure. Use the provided base descriptions WORD-FOR-WORD.`,
            },
            {
              role: 'user',
              content: `Create segment ${params.segmentNumber} of ${params.totalSegments}:

Dialogue for this segment: "${params.scriptPart}"
Product: ${params.product}
Current Location: ${params.currentLocation}
${params.previousLocation && params.previousLocation !== params.currentLocation ? `Character just moved from: ${params.previousLocation}` : ''}
${params.nextLocation && params.nextLocation !== params.currentLocation ? `Character will move to: ${params.nextLocation}` : ''}

Visual Settings:
- Camera Style: ${params.cameraStyle || 'static-handheld'}
- Time of Day: ${params.timeOfDay || 'morning'}
- Background Life: ${params.backgroundLife ? 'Include subtle background activity' : 'Focus only on character'}
- Energy Level: ${this.getEnergyLevel(params.energyArc, params.segmentNumber, params.totalSegments)}

Base Descriptions (USE EXACTLY AS PROVIDED):
Physical: ${params.baseDescriptions.physical}
Clothing: ${params.baseDescriptions.clothing}
Base Voice: ${params.baseDescriptions.voice}
General Environment: ${params.baseDescriptions.environment}
Product Handling: ${params.baseDescriptions.productHandling || 'Natural handling'}

${params.previousSegment ? `Previous segment ended with:
Position: ${params.previousSegment.action_timeline?.transition_prep || params.previousSegment.segment_info?.continuity_markers?.end_position || 'N/A'}` : 'This is the opening segment.'}
`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 3000, // tighter for speed
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_segment_${params.segmentNumber}`
      );

      const raw = response.choices?.[0]?.message?.content || '';
      let parsed = safeParseJSON(raw);
      if (!parsed.ok) {
        console.warn('[OpenAI] Segment JSON parse failed — attempting repair');
        parsed = { ok: true, value: await repairJSONWithModel(this.openai, raw, 3500) };
      }
      return parsed.value;
    } catch (error) {
      console.error('[OpenAI] Error in generateSegment:', error);
      throw error;
    }
  }

  generateCharacterId(params) {
    return `${(params.avatarMode === 'animal' ? params.animal?.species : 'human')}_${params.gender || 'N/A'}_${params.ageRange || 'N/A'}_${Date.now()}`.replace(
      /\s+/g,
      '_'
    );
  }

  // -------------------------------
  // Continuation-style segment (same schema, voice-focused)
  // -------------------------------
  async generateContinuationStyleSegment(params) {
    const template = await this.loadTemplate(params.jsonFormat || 'standard');
    try {
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${template}\n\nGenerate a segment that maintains the EXACT same structure as standard segments, but with ENHANCED voice and behavior sections.`,
            },
            {
              role: 'user',
              content: `Create segment ${params.segmentNumber} of ${params.totalSegments}:

Dialogue for this segment: "${params.scriptPart}"
Product: ${params.product}
Current Location: ${params.currentLocation}
${params.previousLocation && params.previousLocation !== params.currentLocation ? `Character just moved from: ${params.previousLocation}` : ''}
${params.nextLocation && params.nextLocation !== params.currentLocation ? `Character will move to: ${params.nextLocation}` : ''}

Base Descriptions (USE EXACTLY AS PROVIDED):
Physical: ${params.baseDescriptions.physical}
Clothing: ${params.baseDescriptions.clothing}
Base Voice: ${params.baseDescriptions.voice}
General Environment: ${params.baseDescriptions.environment}
Product Handling: ${params.baseDescriptions.productHandling || 'Natural handling'}

Voice Profile to Maintain:
${JSON.stringify(params.voiceProfile || {}, null, 2)}
`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 3000,
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_continuation_style_${params.segmentNumber}`
      );

      const raw = response.choices?.[0]?.message?.content || '';
      let parsed = safeParseJSON(raw);
      if (!parsed.ok) {
        console.warn('[OpenAI] Continuation-style JSON parse failed — attempting repair');
        parsed = { ok: true, value: await repairJSONWithModel(this.openai, raw, 3200) };
      }
      return parsed.value;
    } catch (error) {
      console.error('[OpenAI] Error in generateContinuationStyleSegment:', error);
      throw error;
    }
  }

  // -------------------------------
  // Continuation (image+voice minimal schema)
  // -------------------------------
  async generateContinuationSegment(params) {
    const templatePath = path.join(
      __dirname,
      '../../instructions/veo3-continuation-minimal.md'
    );
    const template = await fs.readFile(templatePath, 'utf8');

    try {
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${template}\n\nGenerate a continuation segment with MINIMAL description but DETAILED voice/behavior continuity. Return ONLY JSON.`,
            },
            {
              role: 'user',
              content: `Create a continuation segment:

Image Context: Character from screenshot at ${params.imageUrl}
Previous Dialogue: "${params.previousSegment?.action_timeline?.dialogue || 'N/A'}"
New Dialogue: "${params.script}"
Product: ${params.product}
Maintain Energy: ${params.maintainEnergy ? 'Yes' : 'No'}

Voice Profile to Match EXACTLY:
${JSON.stringify(params.voiceProfile || {}, null, 2)}
`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 2500,
        }),
        OPENAI_CALL_TIMEOUT,
        'openai_continuation_minimal'
      );

      const raw = response.choices?.[0]?.message?.content || '';
      let parsed = safeParseJSON(raw);
      if (!parsed.ok) {
        console.warn('[OpenAI] Continuation JSON parse failed — attempting repair');
        parsed = { ok: true, value: await repairJSONWithModel(this.openai, raw, 2500) };
      }
      return parsed.value;
    } catch (error) {
      console.error('[OpenAI] Error in generateContinuationSegment:', error);
      throw error;
    }
  }

  // -------------------------------
  // Voice profile extraction (JSON only)
  // -------------------------------
  async extractDetailedVoiceProfile(segment, params) {
    console.log('[OpenAI] Extracting detailed voice profile');
    try {
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'Generate a detailed voice continuity profile for video consistency. Return ONLY JSON.',
            },
            {
              role: 'user',
              content: `Create detailed voice profile for:
Age: ${params.ageRange}
Gender: ${params.gender}
Energy Level: ${params.energyLevel || '80'}%
Script Sample: "${segment?.action_timeline?.dialogue || params.script || ''}"

Return:
{
  "pitchRange": "...",
  "speakingRate": "...",
  "toneQualities": "...",
  "breathingPattern": "...",
  "emotionalInflections": { "excitement": "...", "emphasis": "...", "warmth": "..." },
  "uniqueMarkers": ["..."],
  "regionalAccent": "...",
  "vocalTexture": "..."
}
`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 1000,
        }),
        OPENAI_CALL_TIMEOUT,
        'openai_voice_profile'
      );

      const raw = response.choices?.[0]?.message?.content || '';
      let parsed = safeParseJSON(raw);
      if (!parsed.ok) {
        console.warn('[OpenAI] Voice profile JSON parse failed — attempting repair');
        parsed = { ok: true, value: await repairJSONWithModel(this.openai, raw, 1200) };
      }
      return parsed.value;
    } catch (error) {
      console.error('[OpenAI] Error enhancing voice profile:', error);
      // don’t throw here; allow pipeline to continue without enhanced profile
      return {
        pitchRange: '165-185 Hz',
        speakingRate: '145-150 wpm',
        toneQualities: 'warm, clear, friendly',
        breathingPattern: 'natural pauses between phrases',
        emotionalInflections: {
          excitement: 'slightly higher pitch',
          emphasis: 'slight volume increase on key words',
          warmth: 'softened attack, relaxed pace',
        },
        uniqueMarkers: [],
        regionalAccent: '',
        vocalTexture: 'smooth',
      };
    }
  }

  // -------------------------------
  // Full pipeline with voice profile (standard + continuity)
  // -------------------------------
  async generateSegmentsWithVoiceProfile(params) {
    // Always run sequentially for continuity
    const template = await this.loadTemplate('enhanced');

    // Split and optionally cap
    let scriptSegments = await this.splitScript(params.script);
    if (params?.maxSegments && Number.isFinite(+params.maxSegments)) {
      scriptSegments = scriptSegments.slice(0, +params.maxSegments);
    }

    // Locations
    let locations = [];
    if (params.settingMode === 'single') {
      locations = Array(scriptSegments.length).fill(params.room);
    } else {
      const src = params.locations || [];
      locations = Array.from({ length: scriptSegments.length }, (_, i) => {
        return src[i] ?? src[src.length - 1] ?? 'living room';
      });
    }

    // Base descriptions (enhanced)
    const baseDescriptions = await withTimeout(
      this.generateBaseDescriptions({ ...params, jsonFormat: 'enhanced' }, template),
      OPENAI_CALL_TIMEOUT,
      'openai_voice_base'
    );

    // First segment (enhanced) to seed voice
    const firstSegment = await withTimeout(
      this.generateSegment({
        segmentNumber: 1,
        totalSegments: scriptSegments.length,
        scriptPart: scriptSegments[0],
        baseDescriptions,
        previousSegment: null,
        template,
        currentLocation: locations[0],
        previousLocation: null,
        nextLocation: locations.length > 1 ? locations[1] : null,
        ...params,
        jsonFormat: 'enhanced',
      }),
      OPENAI_CALL_TIMEOUT,
      'openai_voice_first'
    );

    // Extract voice profile
    const voiceProfile = await this.extractDetailedVoiceProfile(firstSegment, {
      ...params,
      script: params.script,
    });

    // Remaining segments (sequential, continuation-style)
    const segments = [firstSegment];
    for (let i = 1; i < scriptSegments.length; i++) {
      const seg = await withTimeout(
        this.generateContinuationStyleSegment({
          segmentNumber: i + 1,
          totalSegments: scriptSegments.length,
          scriptPart: scriptSegments[i],
          baseDescriptions,
          previousSegment: segments[i - 1],
          voiceProfile,
          currentLocation: locations[i],
          previousLocation: i > 0 ? locations[i - 1] : null,
          nextLocation: i < locations.length - 1 ? locations[i + 1] : null,
          ...params,
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_voice_segment_${i + 1}`
      );
      segments.push(seg);
    }

    return {
      segments,
      metadata: {
        totalSegments: segments.length,
        estimatedDuration: segments.length * 8,
        characterId: this.generateCharacterId(params),
      },
      voiceProfile,
    };
  }

  getEnergyLevel(energyArc, segmentNumber, totalSegments) {
    const progress = segmentNumber / totalSegments;
    switch (energyArc) {
      case 'building':
        return `${Math.round(60 + 35 * progress)}% - Building from calm to excited`;
      case 'problem-solution':
        if (progress < 0.3) return '70% - Concerned, explaining problem';
        if (progress < 0.7) return '60% - Working through solution';
        return '90% - Excited about results';
      case 'discovery':
        if (progress < 0.5) return '75% - Curious and exploring';
        return '85% - Convinced and enthusiastic';
      case 'consistent':
      default:
        return '80% - Steady, engaging energy throughout';
    }
  }
}

export default new OpenAIService();