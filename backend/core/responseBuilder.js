const SUPPORTED_TONES = [
  "professional",
  "encouraging",
  "empathetic",
  "neutral",
  "celebratory"
];

const TONE_ALIASES = {
  respectful: "professional",
  reconnecting: "encouraging",
  friendly: "encouraging"
};

function resolveTone(tone) {
  const normalized = String(tone || "neutral").toLowerCase();
  const mapped = TONE_ALIASES[normalized] || normalized;
  return SUPPORTED_TONES.includes(mapped) ? mapped : "neutral";
}

function normalizePart(value) {
  return String(value || "").trim();
}

function countQuestions(text) {
  return (text.match(/\?/g) || []).length;
}

function applyToneRules(text, tone, sensitiveContext = false) {
  let result = text;
  const safeTone = resolveTone(tone);

  if (safeTone !== "celebratory" || sensitiveContext) {
    result = result.replace(/\bPerfect!\b/gi, "Great.");
    result = result.replace(/\bPerfecto!\b/gi, "Genial.");
  }

  if (
    safeTone === "professional" ||
    safeTone === "neutral" ||
    safeTone === "empathetic" ||
    sensitiveContext
  ) {
    const parts = result.split(/(!+)/);
    let exclamationCount = 0;

    result = parts
      .map((part) => {
        if (/^!+$/.test(part)) {
          exclamationCount += 1;
          return exclamationCount === 1 ? "!" : ".";
        }

        return part;
      })
      .join("");
  }

  if (safeTone === "empathetic" || sensitiveContext) {
    result = result.replace(/\bGreat!\b/g, "Great.");
    result = result.replace(/\bAwesome!\b/g, "Sounds good.");
    result = result.replace(/\bExcelente!\b/g, "Excelente.");
  }

  return result.trim();
}

function buildSegments(acknowledgement, transition, question, typingDelay) {
  const pause = Number(typingDelay) || 1500;
  const segments = [];

  if (acknowledgement) {
    segments.push({
      type: "acknowledgement",
      text: acknowledgement,
      delayBefore: 0,
      pauseAfter: pause
    });
  }

  if (transition) {
    segments.push({
      type: "transition",
      text: transition,
      delayBefore: pause,
      pauseAfter: Math.round(pause * 0.75)
    });
  }

  if (question) {
    segments.push({
      type: "question",
      text: question,
      delayBefore: Math.round(pause * 0.75),
      pauseAfter: 0
    });
  }

  return segments;
}

function responseBuilder({
  tone = "neutral",
  acknowledgement,
  transition,
  question,
  typingDelay = 1500,
  responseStyle = "friendly",
  sensitiveContext = false
} = {}) {
  const safeTone = resolveTone(tone);

  const acknowledgementText = normalizePart(acknowledgement);
  const transitionText = normalizePart(transition);
  const questionText = normalizePart(question);

  if (countQuestions(acknowledgementText) + countQuestions(transitionText) > 0) {
    throw new Error("responseBuilder allows only one question in the question field");
  }

  const formatted = applyToneRules(
    [acknowledgementText, transitionText, questionText].filter(Boolean).join("\n\n"),
    safeTone,
    sensitiveContext
  );

  if (countQuestions(formatted) > 1) {
    throw new Error("responseBuilder allows only one question per response");
  }

  const segments = buildSegments(
    acknowledgementText,
    transitionText,
    questionText,
    typingDelay
  );

  return {
    text: formatted,
    tone: safeTone,
    typingDelay,
    responseStyle,
    segments
  };
}

module.exports = {
  responseBuilder,
  SUPPORTED_TONES
};
