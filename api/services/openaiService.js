// api/services/openaiService.js
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- timeouts / concurrency ----------
const OPENAI_CALL_TIMEOUT =
  Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10) || 120_000;
const OPENAI_RETRIES =
  Number.parseInt(process.env.OPENAI_RETRIES || '', 10) || 2;
const OPENAI_SEGMENT_MODEL =
  process.env.OPENAI_SEGMENT_MODEL || 'gpt-4o-mini';
const SEGMENT_CONCURRENCY = 2;

// ---------- tiny helpers ----------
const withTimeout = (promise, ms, label = 'op') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
    ),
  ]);

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0, active = 0;
  return await new Promise((resolve, reject) => {
    const next = () => {
      if (index >= items.length && active === 0) return resolve(results);
      while (active < concurrency && index < items.length) {
        const i = index++;
        active++;
        Promise.resolve(worker(items[i], i))
          .then((r) => { results[i] = r; active--; next(); })
          .catch(reject);
      }
    };
    next();
  });
}

async function callOpenAIWithRetry(fn, label) {
  let attempt = 0, delay = 1000;
  const tries = 1 + OPENAI_RETRIES;
  while (attempt < tries) {
    try { return await fn(); }
    catch (err) {
      attempt++;
      const msg = String(err?.message || '');
      const isTimeout = msg.endsWith('_timeout') || /timeout/i.test(msg);
      const isTransient = /rate|overload|temporar/i.test(msg);
      if (attempt >= tries || (!isTimeout && !isTransient)) throw err;
      console.warn(`[OpenAI][retry] ${label} attempt ${attempt} failed (${msg}); backoff ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// ---------- JSON helpers ----------
function sliceToOuterBraces(str){ const a=str.indexOf('{'),b=str.lastIndexOf('}'); return (a===-1||b===-1||b<=a)?str:str.slice(a,b+1); }
function basicJsonCleanup(str){ let s=(str||'').replace(/\r/g,'').replace(/\u0000/g,''); s=s.replace(/```(?:json)?/gi,'').replace(/```/g,''); s=s.replace(/,\s*([}\]])/g,'$1'); return sliceToOuterBraces(s).trim(); }
function safeParseJSON(raw){ try{ return {ok:true,value:JSON.parse(raw)}; } catch{ try{ return {ok:true,value:JSON.parse(basicJsonCleanup(raw))}; } catch(e2){ return {ok:false,error:e2,raw}; } } }
async function repairJSONWithModel(openai, raw, maxTokens=2000){
  const repair = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role:'system', content:'Fix malformed JSON. Return ONLY one JSON object.' },
        { role:'user', content:`Repair this into valid JSON:\n${raw}` }
      ],
      response_format:{ type:'json_object' },
      temperature:0,
      max_tokens:maxTokens
    }),
    OPENAI_CALL_TIMEOUT,
    'openai_json_repair'
  );
  const repairedRaw = repair.choices?.[0]?.message?.content || '';
  const parsed = safeParseJSON(repairedRaw);
  if (!parsed.ok) throw new Error('json_repair_failed');
  return parsed.value;
}

// ======================================================
// SERVICE
// ======================================================
class OpenAIService {
  constructor(){ this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }

  async loadTemplate(format='standard'){
    const filename = (format==='enhanced')
      ? 'veo3-enhanced-continuity.md'
      : 'veo3-json-guidelines.md';
    const templatePath = path.join(__dirname, '../../instructions/', filename);
    console.log(`[OpenAI] Loading template: ${filename}`);
    return await fs.readFile(templatePath, 'utf8');
  }

  async generateSegments(params){
    console.log('[OpenAI] Starting OpenAI generation with:', {
      ageRange: params.ageRange, gender: params.gender, product: params.product,
      room: params.room, style: params.style, jsonFormat: params.jsonFormat || 'standard',
      continuationMode: !!params.continuationMode, settingMode: params.settingMode || 'single',
      scriptWords: params.script?.split(/\s+/).length || 0,
      maxSegments: params.maxSegments ?? null,
      sequential: params.sequential ?? null,
    });

    const template = await this.loadTemplate(params.jsonFormat);
    let scriptSegments = await this.splitScript(params.script);
    if (params?.maxSegments && Number.isFinite(+params.maxSegments)) {
      scriptSegments = scriptSegments.slice(0, +params.maxSegments);
    }
    console.log('[OpenAI] Script split into', scriptSegments.length, 'segments');

    // Force sequential for larger jobs or continuation
    const autoSequential =
      params.sequential === undefined
        ? (params.continuationMode ? true : scriptSegments.length >= 6)
        : !!params.sequential;

    const effectiveConcurrency = autoSequential ? 1 : SEGMENT_CONCURRENCY;

    // map locations length to segments
    let locations = [];
    if ((params.settingMode || 'single') === 'single') {
      locations = Array(scriptSegments.length).fill(params.room);
    } else {
      const src = Array.isArray(params.locations) ? params.locations : [];
      locations = Array.from({ length: scriptSegments.length }, (_, i) =>
        src[i] ?? src[src.length - 1] ?? 'living room'
      );
    }

    console.log('[OpenAI] Generating base descriptions...');
    const baseDescriptions = await callOpenAIWithRetry(
      () => withTimeout(this.generateBaseDescriptions(params, template),
                        OPENAI_CALL_TIMEOUT, 'openai_base'),
      'openai_base'
    );
    console.log('[OpenAI] Base descriptions parsed successfully');

    console.log(
      `[OpenAI] Generating individual segments with concurrency = ${effectiveConcurrency} (sequential=${autoSequential})`
    );

    const makeSegment = async (scriptPart, i, previousSegment) => {
      const idx = i + 1;
      console.log(`[OpenAI] >>> start segment ${idx}/${scriptSegments.length}`);
      console.time(`[seg ${idx}]`);
      try {
        const seg = await callOpenAIWithRetry(
          () => withTimeout(
            this.generateSegment({
              segmentNumber: idx,
              totalSegments: scriptSegments.length,
              scriptPart,
              baseDescriptions,
              previousSegment,
              template,
              currentLocation: locations[i],
              previousLocation: i > 0 ? locations[i - 1] : null,
              nextLocation: i < locations.length - 1 ? locations[i + 1] : null,
              ...params,
            }),
            OPENAI_CALL_TIMEOUT,
            `openai_segment_${idx}`
          ),
          `openai_segment_${idx}`
        );
        return seg;
      } finally {
        console.timeEnd(`[seg ${idx}]`);
        console.log(`[OpenAI] <<< end segment ${idx}/${scriptSegments.length}`);
      }
    };

    let segments = [];
    if (autoSequential) {
      for (let i = 0; i < scriptSegments.length; i++) {
        const prev = i > 0 ? segments[i - 1] : null;
        segments.push(await makeSegment(scriptSegments[i], i, prev));
      }
    } else {
      segments = await mapWithConcurrency(
        scriptSegments, effectiveConcurrency,
        async (scriptPart, i) => makeSegment(scriptPart, i, null)
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

  async splitScript(script){
    const wordsPerSecond = 150/60, min=15, target=20, max=22;
    console.log('[OpenAI] Script splitting parameters:', { minWords:min, targetWords:target, maxWords:max });

    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
    const raw = [];
    let cur = '', count = 0;

    for (let i=0;i<sentences.length;i++){
      const s = sentences[i].trim();
      const w = s.split(/\s+/).length;
      if (cur===''){ cur=s; count=w;
        while (count<min && i+1<sentences.length){
          i++;
          const nxt = sentences[i].trim();
          const wn = nxt.split(/\s+/).length;
          if (count+wn > max){ if (count<min){ cur+=' '+nxt; count+=wn; } else { i--; break; } }
          else { cur+=' '+nxt; count+=wn; }
        }
        raw.push(cur); cur=''; count=0;
      }
    }

    const final = [];
    for (let i=0;i<raw.length;i++){
      const seg = raw[i];
      const wc = seg.split(/\s+/).length;
      const dur = wc/wordsPerSecond;
      console.log(`[OpenAI] Raw segment ${i+1}: ${wc} words, ~${dur.toFixed(1)}s speaking time`);
      if (wc<min && i<raw.length-1){
        const next = raw[i+1];
        const nWords = next.split(/\s+/).length;
        if (nWords>min){
          const ns = next.match(/[^.!?]+[.!?]+/g) || [next];
          if (ns.length>1){
            const borrow = ns[0], bw = borrow.split(/\s+/).length;
            if (wc+bw <= max){ final.push(seg+' '+borrow); raw[i+1] = ns.slice(1).join(' '); continue; }
          }
        }
        const merged = seg+' '+raw[i+1];
        const mw = merged.split(/\s+/).length;
        if (mw <= 30){ final.push(merged); i++; continue; }
      }
      final.push(seg);
    }

    console.log('[OpenAI] Final segment distribution:');
    final.forEach((s,i)=> {
      const wc = s.split(/\s+/).length, dur = wc/wordsPerSecond;
      console.log(`  Segment ${i+1}: ${wc} words, ~${dur.toFixed(1)}s speaking time`);
      if (dur<6) console.warn(`  ⚠️  Segment ${i+1} is under 6 seconds!`);
    });

    return final;
  }

  async generateBaseDescriptions(params, template){
    console.log('[OpenAI] Calling API for base descriptions');
    const resp = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role:'system',
          content: `${template}\n\nGenerate the base descriptions that will remain IDENTICAL across all segments. Follow the exact word count requirements. Return ONLY valid JSON.`},
        { role:'user',
          content: `Create base descriptions for:
Age: ${params.ageRange}
Gender: ${params.gender}
Setting Mode: ${params.settingMode || 'single'}
${(params.settingMode||'single')==='single' ? `Room: ${params.room}` : `Locations: ${Array.isArray(params.locations)?params.locations.join(', '):'various'}`}
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
}` }
      ],
      response_format:{ type:'json_object' },
      temperature:0.3,
      max_tokens: 3500 // keep this generous; it’s the big block
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = safeParseJSON(raw);
    if (!parsed.ok) {
      console.warn('[OpenAI] Base JSON parse failed — attempting repair');
      parsed = { ok:true, value: await repairJSONWithModel(this.openai, raw, 1800) };
    }
    return parsed.value;
  }

  async generateSegment(params){
    const resp = await this.openai.chat.completions.create({
      model: OPENAI_SEGMENT_MODEL,
      messages: [
        { role:'system',
          content: `${params.template}\n\nGenerate a Veo 3 JSON segment following the exact structure. Use the provided base descriptions WORD-FOR-WORD.` },
        { role:'user',
          content: `Create segment ${params.segmentNumber} of ${params.totalSegments}:

Dialogue for this segment: "${params.scriptPart}"
Product: ${params.product}
Current Location: ${params.currentLocation}
${params.previousLocation && params.previousLocation!==params.currentLocation ? `Character just moved from: ${params.previousLocation}` : ''}
${params.nextLocation && params.nextLocation!==params.currentLocation ? `Character will move to: ${params.nextLocation}` : ''}

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
` }
      ],
      response_format:{ type:'json_object' },
      temperature:0.45,
      max_tokens: 2200 // a bit tighter to keep calls fast
    });

    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = safeParseJSON(raw);
    if (!parsed.ok) {
      console.warn('[OpenAI] Segment JSON parse failed — attempting repair');
      parsed = { ok:true, value: await repairJSONWithModel(this.openai, raw, 1800) };
    }
    return parsed.value;
  }

  generateCharacterId(params){
    return `${(params.avatarMode==='animal'?params.animal?.species:'human')}_${params.gender||'N/A'}_${params.ageRange||'N/A'}_${Date.now()}`.replace(/\s+/g,'_');
  }

  async generateContinuationStyleSegment(params){
    const template = await this.loadTemplate(params.jsonFormat || 'standard');
    const base = params.baseDescriptions || await withTimeout(
      this.generateBaseDescriptions(params, template),
      OPENAI_CALL_TIMEOUT,
      'openai_base_for_continuation'
    );

    const resp = await this.openai.chat.completions.create({
      model: OPENAI_SEGMENT_MODEL,
      messages: [
        { role:'system',
          content: `${template}\n\nGenerate a segment that maintains the EXACT same structure as standard segments, but with ENHANCED voice and behavior sections.` },
        { role:'user',
          content: `Create segment ${params.segmentNumber} of ${params.totalSegments}:

Dialogue for this segment: "${params.scriptPart}"
Product: ${params.product}
Current Location: ${params.currentLocation}
${params.previousLocation && params.previousLocation!==params.currentLocation ? `Character just moved from: ${params.previousLocation}` : ''}
${params.nextLocation && params.nextLocation!==params.currentLocation ? `Character will move to: ${params.nextLocation}` : ''}

Visual Settings:
- Camera Style: ${params.cameraStyle || 'static-handheld'}
- Time of Day: ${params.timeOfDay || 'morning'}
- Background Life: ${params.backgroundLife ? 'Include subtle background activity' : 'Focus only on character'}
- Energy Level: ${this.getEnergyLevel(params.energyArc, params.segmentNumber, params.totalSegments)}

Base Descriptions (USE EXACTLY AS PROVIDED):
Physical: ${base.physical}
Clothing: ${base.clothing}
Base Voice: ${base.voice}
General Environment: ${base.environment}
Product Handling: ${base.productHandling || 'Natural handling'}

Voice Profile to Maintain:
${JSON.stringify(params.voiceProfile || {}, null, 2)}
` }
      ],
      response_format:{ type:'json_object' },
      temperature:0.5,
      max_tokens: 2200
    });

    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = safeParseJSON(raw);
    if (!parsed.ok) {
      console.warn('[OpenAI] Continuation-style JSON parse failed — attempting repair');
      parsed = { ok:true, value: await repairJSONWithModel(this.openai, raw, 1800) };
    }
    return parsed.value;
  }

  async extractDetailedVoiceProfile(segment, params){
    console.log('[OpenAI] Extracting detailed voice profile');
    const resp = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role:'system', content:'Generate a detailed voice continuity profile for video consistency. Return ONLY JSON.' },
        { role:'user', content:`Create detailed voice profile for:
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
}` }
      ],
      response_format:{ type:'json_object' },
      temperature:0.3,
      max_tokens: 900
    });

    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = safeParseJSON(raw);
    if (!parsed.ok) {
      console.warn('[OpenAI] Voice profile JSON parse failed — attempting repair');
      parsed = { ok:true, value: await repairJSONWithModel(this.openai, raw, 1000) };
    }
    return parsed.value;
  }

  getEnergyLevel(energyArc, segmentNumber, totalSegments){
    const p = segmentNumber / totalSegments;
    switch (energyArc){
      case 'building': return `${Math.round(60 + 35*p)}% - Building from calm to excited`;
      case 'problem-solution': if (p < 0.3) return '70% - Concerned, explaining problem'; if (p < 0.7) return '60% - Working through solution'; return '90% - Excited about results';
      case 'discovery': return p < 0.5 ? '75% - Curious and exploring' : '85% - Convinced and enthusiastic';
      default: return '80% - Steady, engaging energy throughout';
    }
  }
}

export default new OpenAIService();