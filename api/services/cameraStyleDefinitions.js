// Centralized camera style definitions and prompt guidance

/**
 * Map of camera style keys to human-readable label and concise guidance
 * suitable for inclusion in model prompts. Keep guidance short, concrete,
 * and production-friendly.
 */
export const CAMERA_STYLES = {
  'static-handheld': {
    label: 'Static Handheld',
    guidance:
      'Hold phone at eye level, arms steady. Minimal sway only. Framing stays consistent; no deliberate moves. Natural micro-movements are acceptable.'
  },
  'slow-push': {
    label: 'Slow Push In',
    guidance:
      'Begin at medium shot and gently move closer 2–6 inches over the segment. Speed is slow and continuous. Keep subject centered and in focus.'
  },
  orbit: {
    label: 'Subtle Orbit Movement',
    guidance:
      'Small circular arc around subject (10–20° total). Keep distance constant. Movement is smooth and slow; maintain eye-level framing.'
  },
  dynamic: {
    label: 'Dynamic Handheld',
    guidance:
      'Noticeable handheld energy: quick micro-reframes, slight tilts, minimal parallax steps. Never whip-pan; keep subject readable at all times.'
  },
  'pov-selfie': {
    label: 'POV Selfie (phone-in-hand)',
    guidance:
      'Front camera. Arm-length distance. Slight arm bends and natural hand jitters. Face occupies upper-middle frame; look into lens; device visible only if natural.'
  },
  'smooth-movement': {
    label: 'Smooth Movement',
    guidance:
      'Glide-like motion on a single axis (forward/back/side). No abrupt stops. Keep horizon level; maintain consistent speed and framing.'
  },
  'dynamic-cuts': {
    label: 'Dynamic Cuts',
    guidance:
      'Plan for quick, clear beats suitable for jump cuts between lines. Each beat has a distinct micro-reframe or angle to support cutting points.'
  },
  'documentary-style': {
    label: 'Documentary Style',
    guidance:
      'Observational handheld with gentle reframing to follow subject attention. Occasional micro-zooms; prioritize clarity and authenticity.'
  },
  'ai-inspired': {
    label: "AI Inspired (director's choice)",
    guidance:
      'Select the most fitting style per segment from the available set, balancing visual variety with clarity. Avoid extreme motions.'
  }
};

export function getCameraStyleGuidance(styleKey) {
  const key = String(styleKey || '').toLowerCase();
  return CAMERA_STYLES[key]?.guidance || CAMERA_STYLES['static-handheld'].guidance;
}

export function getCameraStyleLabel(styleKey) {
  const key = String(styleKey || '').toLowerCase();
  return CAMERA_STYLES[key]?.label || 'Static Handheld';
}


