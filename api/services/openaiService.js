import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utility: ensures any async call resolves within ms or throws "<label>_timeout"
const withTimeout = (promise, ms, label = 'op') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
    )
  ]);

// Per-call timeout (env override allowed)
const OPENAI_CALL_TIMEOUT =
  Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10) || 45000; // 45s default

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.templateInstructions = null;
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
    const scriptSegments = await this.splitScript(params.script);
    console.log('[OpenAI] Script split into', scriptSegments.length, 'segments');

    // Prepare location data for mixed settings
    let locations = [];
    if (params.settingMode === 'single') {
      locations = Array(scriptSegments.length).fill(params.room);
    } else {
      locations = params.locations || [];
      while (locations.length < scriptSegments.length) {
        locations.push(locations[locations.length - 1] || 'living room');
      }
    }

    // Step 2: Generate base descriptions (used across all segments)
    console.log('[OpenAI] Generating base descriptions...');
    const baseDescriptions = await withTimeout(
      this.generateBaseDescriptions(params, template),
      OPENAI_CALL_TIMEOUT,
      'openai_base'
    );
    console.log('[OpenAI] Base descriptions generated');

    // Step 3: Generate each segment
    const segments = [];
    console.log('[OpenAI] Generating individual segments...');
    for (let i = 0; i < scriptSegments.length; i++) {
      console.log(`[OpenAI] Generating segment ${i + 1}/${scriptSegments.length}`);
      const segment = await withTimeout(
        this.generateSegment({
          segmentNumber: i + 1,
          totalSegments: scriptSegments.length,
          scriptPart: scriptSegments[i],
          baseDescriptions,
          previousSegment: segments[i - 1] || null,
          template,
          currentLocation: locations[i],
          previousLocation: i > 0 ? locations[i - 1] : null,
          nextLocation: i < locations.length - 1 ? locations[i + 1] : null,
          ...params,
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_segment_${i + 1}`
      );
      segments.push(segment);
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
    const wordsPerSecond = 150 / 60; // 2.5 words per second (150 wpm)
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
      const isEnhanced = params.jsonFormat === 'enhanced';
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${template}\n\nGenerate the base descriptions ...`,
            },
            {
              role: 'user',
              content: `Create base descriptions for:\nAge: ${params.ageRange}\nGender: ${params.gender}\n...`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 4500,
        }),
        OPENAI_CALL_TIMEOUT,
        'openai_base'
      );

      console.log('[OpenAI] API response received');
      const parsed = JSON.parse(response.choices[0].message.content);
      console.log('[OpenAI] Base descriptions parsed successfully');
      return parsed;
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
              content: `${params.template}\n\nGenerate a Veo 3 JSON segment ...`,
            },
            {
              role: 'user',
              content: `Create segment ${params.segmentNumber} of ${params.totalSegments}:\nDialogue: "${params.scriptPart}" ...`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 4500,
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_segment_${params.segmentNumber}`
      );

      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed;
    } catch (error) {
      console.error('[OpenAI] Error in generateSegment:', error);
      throw error;
    }
  }

  generateCharacterId(params) {
    return `${params.gender || 'N/A'}_${params.ageRange || 'N/A'}_${Date.now()}`.replace(
      /\s+/g,
      '_'
    );
  }

  async generateSegmentsWithVoiceProfile(params) {
    console.log('[OpenAI] Generating ALL segments with voice profile focus');
    const firstSegmentParams = { ...params, jsonFormat: 'enhanced' };
    const template = await this.loadTemplate('enhanced');

    const scriptSegments = await this.splitScript(params.script);
    console.log('[OpenAI] Script split into', scriptSegments.length, 'segments');

    let locations = [];
    if (params.settingMode === 'single') {
      locations = Array(scriptSegments.length).fill(params.room);
    } else {
      locations = params.locations || [];
      while (locations.length < scriptSegments.length) {
        locations.push(locations[locations.length - 1] || 'living room');
      }
    }

    console.log('[OpenAI] Generating base descriptions...');
    const baseDescriptions = await withTimeout(
      this.generateBaseDescriptions(firstSegmentParams, template),
      OPENAI_CALL_TIMEOUT,
      'openai_voice_base'
    );

    console.log('[OpenAI] Generating first segment with full detail...');
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
        ...firstSegmentParams,
      }),
      OPENAI_CALL_TIMEOUT,
      'openai_voice_first'
    );

    const voiceProfile = await this.extractDetailedVoiceProfile(
      firstSegment,
      params
    );

    const segments = [firstSegment];
    console.log('[OpenAI] Generating remaining segments with voice/behavior focus...');
    for (let i = 1; i < scriptSegments.length; i++) {
      console.log(`[OpenAI] Generating segment ${i + 1}/${scriptSegments.length}`);
      const segment = await withTimeout(
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
      segments.push(segment);
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
                'Generate detailed voice continuity profile for video consistency...',
            },
            {
              role: 'user',
              content: `Create detailed voice profile for: Age: ${params.ageRange}\nGender: ${params.gender}\n...`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 1000,
        }),
        OPENAI_CALL_TIMEOUT,
        'openai_voice_profile'
      );

      const enhancedProfile = JSON.parse(response.choices[0].message.content);
      return enhancedProfile;
    } catch (error) {
      console.error('[OpenAI] Error enhancing voice profile:', error);
      throw error;
    }
  }

  async generateContinuationSegment(params) {
    console.log('[OpenAI] Generating continuation segment');
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
              content: `${template}\n\nGenerate a continuation segment...`,
            },
            {
              role: 'user',
              content: `Create a continuation segment:\nDialogue: "${params.script}" ...`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 3000,
        }),
        OPENAI_CALL_TIMEOUT,
        'openai_continuation'
      );

      const segment = JSON.parse(response.choices[0].message.content);
      return segment;
    } catch (error) {
      console.error('[OpenAI] Error in generateContinuationSegment:', error);
      throw error;
    }
  }

  async generateContinuationStyleSegment(params) {
    console.log('[OpenAI] Generating continuation-style segment');
    const template = await this.loadTemplate(params.jsonFormat || 'standard');

    try {
      const response = await withTimeout(
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `${template}\n\nGenerate a segment with enhanced voice and behavior sections...`,
            },
            {
              role: 'user',
              content: `Create segment ${params.segmentNumber} of ${params.totalSegments}:\nDialogue: "${params.scriptPart}" ...`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 4000,
        }),
        OPENAI_CALL_TIMEOUT,
        `openai_continuation_style_${params.segmentNumber}`
      );

      const segment = JSON.parse(response.choices[0].message.content);
      return segment;
    } catch (error) {
      console.error('[OpenAI] Error in generateContinuationStyleSegment:', error);
      throw error;
    }
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
