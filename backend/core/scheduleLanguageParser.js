const EN_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const ES_DAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "miércoles",
  "jueves",
  "viernes",
  "sabado",
  "sábado"
];

const SPANISH_HOUR_WORDS = {
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12
};

function normalize(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseHourToken(token) {
  const value = normalize(token);

  if (/^\d{1,2}$/.test(value)) {
    return Number(value);
  }

  return SPANISH_HOUR_WORDS[value] ?? null;
}

function parseDayHint(text) {
  if (/\b(day after tomorrow|pasado manana)\b/.test(text)) {
    return { kind: "offset", days: 2 };
  }

  if (/\b(tomorrow|manana)\b/.test(text)) {
    return { kind: "offset", days: 1 };
  }

  if (/\b(today|hoy)\b/.test(text)) {
    return { kind: "offset", days: 0 };
  }

  const dayMatch = EN_DAYS.concat(ES_DAYS).find((name) => {
    const normalizedName = normalize(name);
    return new RegExp(`\\b${normalizedName}\\b`).test(text);
  });

  if (dayMatch) {
    return { kind: "weekday", dayName: normalize(dayMatch) };
  }

  return null;
}

function parsePeriodHint(text) {
  if (/\b(en la manana|in the morning|morning)\b/.test(text)) {
    return "morning";
  }

  if (/\b(en la tarde|in the afternoon|afternoon|tarde)\b/.test(text)) {
    return "afternoon";
  }

  if (
    /\b(despues de las cinco|después de las cinco|after five|after 5|despues de las 5|después de las 5)\b/.test(
      text
    )
  ) {
    return "afterFive";
  }

  if (/\b(antes de las cinco|before five|before 5|antes de las 5)\b/.test(text)) {
    return "beforeFive";
  }

  return null;
}

function parseTimeHint(text, context = {}) {
  const timePatterns = [
    /(?:at|around|about|for|a las|como a las|can it be at|could it be at|puede ser a las|podria ser a las|seria a las|sería a las)\s+(\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)?/i,
    /(\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s*(?:mas o menos|más o menos|or so|ish)\b/i,
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)/i,
    /^(\d{1,2})$/i
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const hour = parseHourToken(match[1]);

    if (hour === null) {
      continue;
    }

    return {
      hour,
      minute: match[2] ? Number(match[2]) : 0,
      meridiem: match[3] ? normalize(match[3]) : null
    };
  }

  if (context.phase === "TIME" || context.phase === "OVERRIDE") {
    const standalone = text.match(/^(\d{1,2})$/);

    if (standalone) {
      return {
        hour: Number(standalone[1]),
        minute: 0,
        meridiem: null
      };
    }
  }

  return null;
}

function normalizeHour(hour, meridiem) {
  if (hour === null || hour === undefined) {
    return null;
  }

  let normalized = hour;

  if (meridiem && meridiem.includes("p")) {
    if (normalized < 12) {
      normalized += 12;
    }
  } else if (meridiem && meridiem.includes("a")) {
    if (normalized === 12) {
      normalized = 0;
    }
  } else if (normalized >= 1 && normalized <= 7) {
    normalized += 12;
  }

  return normalized;
}

function parseScheduleRequest(message, context = {}) {
  const text = normalize(message);
  const dayHint = parseDayHint(text);
  const periodHint = parsePeriodHint(text);
  const timeHint = parseTimeHint(text, context);

  if (!dayHint && !periodHint && !timeHint) {
    return null;
  }

  return {
    detected: true,
    dayHint,
    dayName: dayHint?.kind === "weekday" ? dayHint.dayName : null,
    periodHint,
    hour: timeHint?.hour ?? null,
    minute: timeHint?.minute ?? 0,
    meridiem: timeHint?.meridiem ?? null,
    normalizedHour: timeHint ? normalizeHour(timeHint.hour, timeHint.meridiem) : null,
    raw: message,
    timeOnly: Boolean(timeHint && !dayHint && !periodHint)
  };
}

function detectScheduleOverride(message, context = {}) {
  return parseScheduleRequest(message, context);
}

module.exports = {
  EN_DAYS,
  ES_DAYS,
  parseScheduleRequest,
  detectScheduleOverride,
  normalizeHour,
  parseDayHint,
  parseTimeHint,
  parsePeriodHint
};
