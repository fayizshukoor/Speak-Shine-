/**
 * Pre-submit validation for video upload / recording.
 * Used by API pre-check and confirm endpoints for consistent gating.
 */

export const GATE_FRAME_MIN = 8;
export const GATE_FRAME_IDEAL = 16;

/** @typedef {"pass"|"warn"|"fail"} GateStatus */

/**
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isWeeklyReflection?: boolean, isStorySummary?: boolean }} flags
 */
export function getDurationLimits(flags = {}) {
  const maxSeconds = flags.isMonthlyReflection || flags.isMonthlyGoals
    ? 600
    : flags.isWeeklyReflection
      ? 420
      : flags.isStorySummary
      ? 180
      : 300;
  return { minSeconds: 60, maxSeconds, minLabel: "1 min", maxLabel: formatMaxLabel(maxSeconds) };
}

function formatMaxLabel(sec) {
  if (sec >= 600) return "10 min";
  if (sec >= 420) return "7 min";
  if (sec >= 300) return "5 min";
  return "3 min";
}

function fmtDuration(sec) {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * @param {object} input
 * @param {number|null} input.durationSeconds
 * @param {number|null} input.fileSizeBytes
 * @param {number|null} input.frameCount
 * @param {boolean} input.hasAudioTrack - optional hint from client
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isWeeklyReflection?: boolean, isStorySummary?: boolean }} input.flags
 */
export function evaluateSubmitGate(input) {
  const { minSeconds, maxSeconds, minLabel, maxLabel } = getDurationLimits(input.flags || {});
  /** @type {{ id: string, label: string, status: GateStatus, message: string }[]} */
  const checks = [];

  const duration = typeof input.durationSeconds === "number" && input.durationSeconds > 0
    ? input.durationSeconds
    : null;

  if (duration == null) {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "warn",
      message: "Could not read length — analysis may take longer.",
    });
  } else if (duration < minSeconds) {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "fail",
      message: `Too short (${fmtDuration(duration)}). Minimum is ${minLabel}.`,
    });
  } else if (duration > maxSeconds + 5) {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "fail",
      message: `Too long (${fmtDuration(duration)}). Maximum is ${maxLabel}.`,
    });
  } else {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "pass",
      message: `${fmtDuration(duration)} — within ${minLabel}–${maxLabel}.`,
    });
  }

  const size = input.fileSizeBytes;
  const maxBytes = 110 * 1024 * 1024;
  if (size != null && size > 0) {
    const mb = (size / 1024 / 1024).toFixed(1);
    if (size > maxBytes) {
      checks.push({
        id: "size",
        label: "File size",
        status: "fail",
        message: `${mb} MB exceeds 110 MB limit.`,
      });
    } else if (size > 80 * 1024 * 1024) {
      checks.push({
        id: "size",
        label: "File size",
        status: "warn",
        message: `${mb} MB — large file; upload may be slow.`,
      });
    } else {
      checks.push({
        id: "size",
        label: "File size",
        status: "pass",
        message: `${mb} MB — OK.`,
      });
    }
  }

  const frames = input.frameCount;
  if (frames != null) {
    if (frames < GATE_FRAME_MIN) {
      checks.push({
        id: "frames",
        label: "Preview frames",
        status: "warn",
        message: `Only ${frames} frames captured — visual scores may be less accurate.`,
      });
    } else {
      checks.push({
        id: "frames",
        label: "Preview frames",
        status: "pass",
        message: `${frames} frames ready for AI (faster analysis).`,
      });
    }
  } else {
    checks.push({
      id: "frames",
      label: "Preview frames",
      status: "warn",
      message: "No browser frames — server will extract (slower).",
    });
  }

  // Estimated speaking time: assume ~40% of video is speech at 130 wpm minimum bar
  if (duration != null && duration >= minSeconds) {
    const minWords = Math.max(80, Math.round((duration / 60) * 50));
    checks.push({
      id: "speech",
      label: "Speaking content",
      status: "pass",
      message: `Aim for at least ~${minWords} words of clear speech on today's question.`,
    });
  }

  const failed = checks.some((c) => c.status === "fail");
  const passed = !failed;

  return {
    passed,
    readyToSubmit: passed,
    checks,
    limits: { minSeconds, maxSeconds, minLabel, maxLabel },
  };
}

/**
 * Calculate the 100-point composite score for a video submission.
 *
 * Regular days (4 parts):
 *   Part 1 — Effective speaking time : (duration × speechRatio / maxDuration) × 33.33 → max 33.33
 *   Part 2 — Vocabulary used         : (wordsUsed / totalWords) × 33.33              → max 33.33
 *   Part 3 — Topic relevance         : (topicRelevance / 10) × 16.67                 → max 16.67
 *   Part 4 — Communication           : (commAvg / 10) × 16.67                        → max 16.67
 *
 * Special days (weekly/monthly — no topicRelevance, 3 parts):
 *   Part 1 — Effective speaking time : same formula                                   → max 33.33
 *   Part 2 — Vocabulary used         : same formula                                   → max 33.33
 *   Part 3 — Communication           : (commAvg / 10) × 33.34                        → max 33.34
 *
 * speechRatio (0–100): % of video time the person was actually speaking (from Whisper).
 * A silent video gets ~0 pts on duration even if it's long.
 * If speechRatio is unavailable, falls back to wpm-based estimate.
 *
 * @param {object} params
 * @param {number}   params.durationSeconds     - actual video duration
 * @param {number}   params.maxDurationSeconds  - max allowed duration for this day type
 * @param {string[]} params.vocabularyUsed      - words from today's list found in transcript
 * @param {number}   params.totalVocabWords     - total words in today's list
 * @param {number|null} params.topicRelevance   - AI score 0–10, null on special days
 * @param {object}   params.analysis            - full analysis object for comm scores + speech stats
 * @returns {{ score: number, breakdown: object }}
 */
export function calculateCompositeScore({
  durationSeconds,
  maxDurationSeconds,
  vocabularyUsed = [],
  totalVocabWords = 3,
  topicRelevance = null,
  analysis = {},
}) {
  const isSpecialDay = topicRelevance == null;

  // ── Part 1: Effective speaking time ─────────────────────────────────────
  // speechRatio: % of video time actually speaking (0–100), from Whisper timestamps.
  // If not available, estimate from wpm (words per minute from transcription).
  // A silent or mostly-silent video gets near-zero duration pts even if long.
  // Note: analyzeSpeech stores stats under analysis.stats (not analysis._stats)
  const statsObj = analysis._stats || analysis.stats || {};
  const rawSpeechRatio = statsObj?.rhythm?.speechRatio; // 0–100 or null
  const wpm = statsObj?.wpm; // words per minute or null

  let speechMultiplier;
  if (typeof rawSpeechRatio === "number" && rawSpeechRatio >= 0) {
    // Direct measurement from Whisper: 0% = total silence, 100% = constant speech
    // Apply a minimum floor of 20% so partial credit isn't wiped out for natural pauses
    // Curve: 0%→0, 30%→0.25, 60%→0.7, 75%→0.88, 85%→1.0 (full multiplier)
    const r = rawSpeechRatio / 100;
    speechMultiplier = r >= 0.85 ? 1.0
      : r <= 0     ? 0
      : Math.min(1, r / 0.85); // linear scale to 85% being "full"
  } else if (typeof wpm === "number" && wpm > 0) {
    // Fallback: estimate from wpm — if someone spoke 50+ wpm they were talking
    // 0 wpm = 0, 50 wpm = 0.5, 100+ wpm = 1.0
    speechMultiplier = Math.min(1, wpm / 100);
  } else {
    // No speech data available (no transcript) — give 0 on duration
    // This catches truly silent/no-audio videos
    speechMultiplier = 0;
  }

  const maxDur = maxDurationSeconds || 300;
  const minDur = 60;
  const actualDur = Math.min(durationSeconds || 0, maxDur);
  const rangeScore = maxDur > minDur
    ? Math.max(0, (actualDur - minDur) / (maxDur - minDur))
    : 1;
  const baseLengthScore = actualDur >= minDur
    ? (0.5 + 0.5 * rangeScore) * 33.33
    : (actualDur / minDur) * 0.5 * 33.33;

  // Multiply by speech ratio — silent video = 0 pts, fully speaking = full pts
  const lengthScore = baseLengthScore * speechMultiplier;

  // ── Part 2: Vocabulary used ──────────────────────────────────────────────
  // Same fair formula as duration:
  //   0 words used  → 0 pts
  //   1 word used   → base 50% (16.67) — rewarded for trying
  //   all words used → full 33.33
  // If no vocab words exist today (special days), award full marks automatically.
  const usedCount = Array.isArray(vocabularyUsed) ? vocabularyUsed.length : 0;
  const total = totalVocabWords > 0 ? totalVocabWords : 0;
  let vocabUsedScore;
  if (total === 0) {
    // No vocab challenge today (special day) — full marks, not penalised
    vocabUsedScore = 33.33;
  } else if (usedCount === 0) {
    vocabUsedScore = 0;
  } else {
    // base 50% for using at least 1 word + proportional bonus up to all words
    const rangeScore = total > 1
      ? (usedCount - 1) / (total - 1)
      : 1;
    vocabUsedScore = (0.5 + 0.5 * rangeScore) * 33.33;
  }

  // ── Communication scores (fluency, grammar, confidence, vocabulary AI,
  //    eyeContact, bodyLanguage, facialExpression, overallPresence) ─────────
  const commFields = [
    analysis.fluency, analysis.grammar, analysis.confidence, analysis.vocabulary,
    analysis.eyeContact, analysis.bodyLanguage, analysis.facialExpression, analysis.overallPresence,
  ].filter(n => typeof n === "number" && !Number.isNaN(n));
  const commAvg = commFields.length
    ? commFields.reduce((a, b) => a + b, 0) / commFields.length
    : 0;

  let topicScore = 0;
  let commScore = 0;

  if (isSpecialDay) {
    // 3-part: comm gets the remaining 33.34
    commScore = (commAvg / 10) * 33.34;
  } else {
    // 4-part
    topicScore = (Math.max(0, Math.min(10, topicRelevance)) / 10) * 16.67;
    commScore  = (commAvg / 10) * 16.67;
  }

  const total100 = Math.min(100, Math.round((lengthScore + vocabUsedScore + topicScore + commScore) * 100) / 100);

  return {
    score: total100,
    breakdown: {
      length:          Math.round(lengthScore    * 100) / 100,
      vocabUsed:       Math.round(vocabUsedScore * 100) / 100,
      topic:           Math.round(topicScore     * 100) / 100,
      comm:            Math.round(commScore      * 100) / 100,
      speechRatio:     typeof rawSpeechRatio === "number" ? rawSpeechRatio : null,
      speechMultiplier: Math.round(speechMultiplier * 100), // 0–100 %
      isSpecialDay,
    },
  };
}

/**
 * Match vocabulary words against a transcript (case-insensitive whole-word).
 * Returns array of matched word strings.
 *
 * @param {string}   transcript  - full spoken text
 * @param {Array<{word: string}>} vocabWords - today's vocabulary list
 * @returns {string[]}
 */
export function matchVocabularyInTranscript(transcript, vocabWords) {
  if (!transcript || !Array.isArray(vocabWords) || vocabWords.length === 0) return [];
  const lower = transcript.toLowerCase();
  const matched = [];
  for (const item of vocabWords) {
    const w = (item.word || "").trim().toLowerCase();
    if (!w) continue;
    // Whole-word match — handles multi-word phrases too
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`);
    if (regex.test(lower)) matched.push(item.word.trim());
  }
  return matched;
}

/**
 * Build calibrated summary fields stored on analysis for consistent report UI.
 */
export function buildAnalysisSummary(analysis) {
  if (!analysis) return analysis;

  const nums = [
    analysis.fluency,
    analysis.grammar,
    analysis.confidence,
    analysis.vocabulary,
    analysis.topicRelevance,
    analysis.eyeContact,
    analysis.bodyLanguage,
    analysis.facialExpression,
    analysis.overallPresence,
  ].filter((n) => typeof n === "number" && !Number.isNaN(n));

  const overallScore = nums.length
    ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
    : null;

  let performanceTier = "developing";
  let performanceLabel = "Developing";
  if (overallScore != null) {
    if (overallScore >= 8) {
      performanceTier = "excellent";
      performanceLabel = "Excellent";
    } else if (overallScore >= 6.5) {
      performanceTier = "good";
      performanceLabel = "Good";
    } else if (overallScore < 5) {
      performanceTier = "needs_work";
      performanceLabel = "Needs practice";
    }
  }

  const speechAvg = [analysis.fluency, analysis.grammar, analysis.confidence, analysis.vocabulary]
    .filter((n) => typeof n === "number");
  const visualAvg = [analysis.eyeContact, analysis.bodyLanguage, analysis.facialExpression, analysis.overallPresence]
    .filter((n) => typeof n === "number");

  return {
    ...analysis,
    overallScore,
    performanceTier,
    performanceLabel,
    scoreBreakdown: {
      speech: speechAvg.length
        ? Math.round((speechAvg.reduce((a, b) => a + b, 0) / speechAvg.length) * 10) / 10
        : null,
      visual: visualAvg.length
        ? Math.round((visualAvg.reduce((a, b) => a + b, 0) / visualAvg.length) * 10) / 10
        : null,
      topic: typeof analysis.topicRelevance === "number" ? analysis.topicRelevance : null,
    },
  };
}
