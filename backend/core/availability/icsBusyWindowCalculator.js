/**
 * BR-161 — Convert iCalendar VEVENTs into normalized busy windows.
 * Never logs event titles, descriptions, attendees, or raw ICS.
 */

const {
  zonedTimeToUtcMs,
  isValidIanaTimeZone,
  ATLAS_DEFAULT_TIMEZONE
} = require("../organizationDateWindow");

function addCalendarDays(year, month, day, deltaDays) {
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const shifted = new Date(utcNoon + deltaDays * 24 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}
const { PROVIDERS, normalizeBusyWindow } = require("./availabilityTypes");

const MAX_OCCURRENCES = 2000;
const MAX_ITERATOR_ADVANCES = 100000;

const WEEKDAY_INDEX = Object.freeze({
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
});

function unfoldIcs(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function splitProperties(block) {
  return unfoldIcs(block)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function parseProperty(line) {
  const colon = line.indexOf(":");
  if (colon < 0) {
    return null;
  }
  const meta = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = meta.split(";");
  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return {
    name: String(name || "").toUpperCase(),
    params,
    value
  };
}

function extractComponents(ics, name) {
  const text = unfoldIcs(ics);
  const begin = `BEGIN:${name}`;
  const end = `END:${name}`;
  const blocks = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(begin, cursor);
    if (start < 0) {
      break;
    }
    const finish = text.indexOf(end, start + begin.length);
    if (finish < 0) {
      break;
    }
    blocks.push(text.slice(start + begin.length, finish));
    cursor = finish + end.length;
  }
  return blocks;
}

function parseDateValue(value, params = {}, fallbackTimeZone = ATLAS_DEFAULT_TIMEZONE) {
  const raw = String(value || "").trim();
  const tzid = params.TZID ? String(params.TZID).replace(/^"|"$/g, "") : null;
  const isDate = String(params.VALUE || "").toUpperCase() === "DATE" || /^\d{8}$/.test(raw);
  const zone = isValidIanaTimeZone(tzid) ? tzid : fallbackTimeZone;

  if (isDate) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    return {
      year,
      month,
      day,
      hour: 0,
      minute: 0,
      second: 0,
      allDay: true,
      timeZone: zone,
      utcMs: zonedTimeToUtcMs(year, month, day, 0, 0, 0, 0, zone)
    };
  }

  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i
  );
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const isUtc = Boolean(match[7]);

  if (isUtc) {
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      allDay: false,
      timeZone: "UTC",
      utcMs: Date.UTC(year, month - 1, day, hour, minute, second)
    };
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    allDay: false,
    timeZone: zone,
    utcMs: zonedTimeToUtcMs(year, month, day, hour, minute, second, 0, zone)
  };
}

function parseDurationMs(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) {
    return null;
  }
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000;
}

function parseRrule(value) {
  const rule = {};
  for (const part of String(value || "").split(";")) {
    const [key, raw] = part.split("=");
    if (!key || raw == null) {
      continue;
    }
    const name = key.toUpperCase();
    if (name === "BYDAY") {
      rule.byDay = raw.split(",").map((item) => item.trim().toUpperCase());
    } else if (name === "INTERVAL" || name === "COUNT") {
      rule[name.toLowerCase()] = Number(raw);
    } else if (name === "UNTIL") {
      rule.until = raw;
    } else {
      rule[name.toLowerCase()] = raw;
    }
  }
  rule.freq = String(rule.freq || "").toUpperCase();
  rule.interval = Number.isFinite(rule.interval) && rule.interval > 0 ? rule.interval : 1;
  return rule;
}

function occurrenceKey(parsed) {
  if (!parsed) {
    return null;
  }
  if (parsed.allDay) {
    return `${parsed.year}${String(parsed.month).padStart(2, "0")}${String(parsed.day).padStart(2, "0")}`;
  }
  return String(parsed.utcMs);
}

function weekdayOf(parsed, timeZone) {
  const utcMs = parsed.allDay
    ? zonedTimeToUtcMs(parsed.year, parsed.month, parsed.day, 12, 0, 0, 0, timeZone)
    : parsed.utcMs;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).formatToParts(new Date(utcMs));
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? new Date(utcMs).getUTCDay();
}

function addDaysToParsed(parsed, days) {
  const next = addCalendarDays(parsed.year, parsed.month, parsed.day, days);
  return {
    ...parsed,
    year: next.year,
    month: next.month,
    day: next.day,
    utcMs: parsed.allDay
      ? zonedTimeToUtcMs(next.year, next.month, next.day, 0, 0, 0, 0, parsed.timeZone)
      : zonedTimeToUtcMs(
          next.year,
          next.month,
          next.day,
          parsed.hour,
          parsed.minute,
          parsed.second,
          0,
          parsed.timeZone
        )
  };
}

function addMonthsToParsed(parsed, months) {
  const total = parsed.year * 12 + (parsed.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(parsed.day, lastDay);
  return {
    ...parsed,
    year,
    month,
    day,
    utcMs: parsed.allDay
      ? zonedTimeToUtcMs(year, month, day, 0, 0, 0, 0, parsed.timeZone)
      : zonedTimeToUtcMs(
          year,
          month,
          day,
          parsed.hour,
          parsed.minute,
          parsed.second,
          0,
          parsed.timeZone
        )
  };
}

function matchesByDay(parsed, byDay, timeZone) {
  if (!Array.isArray(byDay) || byDay.length === 0) {
    return true;
  }
  const weekday = weekdayOf(parsed, timeZone);
  return byDay.some((token) => WEEKDAY_INDEX[token.slice(-2)] === weekday);
}

function parseEventBlock(block, fallbackTimeZone) {
  const props = {};
  for (const line of splitProperties(block)) {
    const parsed = parseProperty(line);
    if (!parsed) {
      continue;
    }
    if (parsed.name === "EXDATE") {
      props.exdates = props.exdates || [];
      for (const value of parsed.value.split(",")) {
        const date = parseDateValue(value, parsed.params, fallbackTimeZone);
        if (date) {
          props.exdates.push(date);
        }
      }
      continue;
    }
    props[parsed.name] = parsed;
  }

  const dtStart = props.DTSTART
    ? parseDateValue(props.DTSTART.value, props.DTSTART.params, fallbackTimeZone)
    : null;
  if (!dtStart) {
    return null;
  }

  let dtEnd = props.DTEND
    ? parseDateValue(props.DTEND.value, props.DTEND.params, dtStart.timeZone)
    : null;
  if (!dtEnd && props.DURATION) {
    const durationMs = parseDurationMs(props.DURATION.value);
    if (Number.isFinite(durationMs)) {
      dtEnd = {
        ...dtStart,
        utcMs: dtStart.utcMs + durationMs,
        allDay: dtStart.allDay
      };
    }
  }
  if (!dtEnd) {
    dtEnd = dtStart.allDay
      ? addDaysToParsed(dtStart, 1)
      : { ...dtStart, utcMs: dtStart.utcMs + 60 * 60 * 1000 };
  }

  const recurrenceId = props["RECURRENCE-ID"]
    ? parseDateValue(props["RECURRENCE-ID"].value, props["RECURRENCE-ID"].params, dtStart.timeZone)
    : null;

  return {
    uid: props.UID?.value || null,
    status: String(props.STATUS?.value || "").toUpperCase(),
    transp: String(props.TRANSP?.value || "").toUpperCase(),
    dtStart,
    dtEnd,
    durationMs: dtEnd.utcMs - dtStart.utcMs,
    rrule: props.RRULE ? parseRrule(props.RRULE.value) : null,
    exdates: props.exdates || [],
    recurrenceId
  };
}

function shouldSkipEvent(event) {
  return event.status === "CANCELLED" || event.transp === "TRANSPARENT";
}

function expandRecurrence(event, windowStartMs, windowEndMs) {
  if (!event.rrule) {
    if (event.dtEnd.utcMs > windowStartMs && event.dtStart.utcMs < windowEndMs) {
      return [event.dtStart];
    }
    return [];
  }

  const until = event.rrule.until
    ? parseDateValue(
        event.rrule.until,
        /T/.test(event.rrule.until) ? {} : { VALUE: "DATE" },
        event.dtStart.timeZone
      )
    : null;
  const untilMs = until
    ? until.allDay
      ? zonedTimeToUtcMs(until.year, until.month, until.day, 23, 59, 59, 999, until.timeZone)
      : until.utcMs
    : null;
  const count = Number.isFinite(event.rrule.count) ? event.rrule.count : null;
  const occurrences = [];
  let cursor = { ...event.dtStart };
  let emitted = 0;
  let advances = 0;

  while (advances < MAX_ITERATOR_ADVANCES && occurrences.length < MAX_OCCURRENCES) {
    advances += 1;
    if (untilMs != null && cursor.utcMs > untilMs) {
      break;
    }
    if (count != null && emitted >= count) {
      break;
    }
    if (cursor.utcMs - event.durationMs > windowEndMs && emitted > 0 && cursor.utcMs > windowEndMs) {
      break;
    }

    const inByDay = matchesByDay(cursor, event.rrule.byDay, event.dtStart.timeZone);
    const weekDelta = Math.floor(
      (Date.UTC(cursor.year, cursor.month - 1, cursor.day) -
        Date.UTC(event.dtStart.year, event.dtStart.month - 1, event.dtStart.day)) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const inInterval =
      event.rrule.freq !== "WEEKLY" ||
      !Array.isArray(event.rrule.byDay) ||
      event.rrule.byDay.length === 0 ||
      weekDelta % event.rrule.interval === 0;
    if (inByDay && inInterval) {
      emitted += 1;
      if (cursor.utcMs + event.durationMs > windowStartMs && cursor.utcMs < windowEndMs) {
        occurrences.push({ ...cursor });
      }
    }

    if (event.rrule.freq === "DAILY") {
      cursor = addDaysToParsed(cursor, event.rrule.interval);
    } else if (event.rrule.freq === "WEEKLY") {
      if (Array.isArray(event.rrule.byDay) && event.rrule.byDay.length > 0) {
        cursor = addDaysToParsed(cursor, 1);
      } else {
        cursor = addDaysToParsed(cursor, 7 * event.rrule.interval);
      }
    } else if (event.rrule.freq === "MONTHLY") {
      cursor = addMonthsToParsed(cursor, event.rrule.interval);
    } else if (event.rrule.freq === "YEARLY") {
      cursor = addMonthsToParsed(cursor, 12 * event.rrule.interval);
    } else {
      break;
    }

    if (cursor.utcMs > windowEndMs + 14 * 24 * 60 * 60 * 1000 && (!count || emitted >= (count || 0))) {
      if (cursor.utcMs > windowEndMs) {
        break;
      }
    }
  }

  return occurrences;
}

function toBusyWindow(startParsed, durationMs, allDay, timezone, calendarId) {
  const endMs = allDay
    ? addDaysToParsed(startParsed, Math.max(1, Math.round(durationMs / (24 * 60 * 60 * 1000)))).utcMs
    : startParsed.utcMs + durationMs;
  return normalizeBusyWindow(
    {
      start: new Date(startParsed.utcMs).toISOString(),
      end: new Date(endMs).toISOString(),
      timezone,
      source: PROVIDERS.ICLOUD_CALENDAR,
      allDay,
      calendarId
    },
    timezone
  );
}

function calculateBusyWindowsFromIcs({
  ics,
  timeMin,
  timeMax,
  timezone = ATLAS_DEFAULT_TIMEZONE,
  calendarId = null
} = {}) {
  const windowStartMs = Date.parse(timeMin);
  const windowEndMs = Date.parse(timeMax);
  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) {
    return [];
  }

  const events = extractComponents(ics, "VEVENT")
    .map((block) => parseEventBlock(block, timezone))
    .filter(Boolean);

  const overridesByUid = new Map();
  const masters = [];

  for (const event of events) {
    if (event.recurrenceId) {
      const key = event.uid || "__anon__";
      if (!overridesByUid.has(key)) {
        overridesByUid.set(key, []);
      }
      overridesByUid.get(key).push(event);
      continue;
    }
    masters.push(event);
  }

  const busy = [];

  for (const event of masters) {
    if (shouldSkipEvent(event)) {
      continue;
    }

    const exdateKeys = new Set(event.exdates.map(occurrenceKey));
    const overrides = overridesByUid.get(event.uid || "__anon__") || [];
    const overrideByOriginal = new Map(
      overrides.map((override) => [occurrenceKey(override.recurrenceId), override])
    );

    for (const start of expandRecurrence(event, windowStartMs, windowEndMs)) {
      const key = occurrenceKey(start);
      if (exdateKeys.has(key)) {
        continue;
      }
      const override = overrideByOriginal.get(key);
      if (override) {
        if (shouldSkipEvent(override)) {
          continue;
        }
        const window = toBusyWindow(
          override.dtStart,
          override.durationMs,
          override.dtStart.allDay,
          timezone,
          calendarId
        );
        if (window) {
          busy.push(window);
        }
        continue;
      }

      const window = toBusyWindow(
        start,
        event.durationMs,
        event.dtStart.allDay,
        timezone,
        calendarId
      );
      if (window) {
        busy.push(window);
      }
    }
  }

  for (const overrides of overridesByUid.values()) {
    for (const override of overrides) {
      if (shouldSkipEvent(override)) {
        continue;
      }
      const hasMaster = masters.some((master) => master.uid && master.uid === override.uid);
      if (hasMaster) {
        continue;
      }
      const window = toBusyWindow(
        override.dtStart,
        override.durationMs,
        override.dtStart.allDay,
        timezone,
        calendarId
      );
      if (window) {
        busy.push(window);
      }
    }
  }

  return busy;
}

module.exports = {
  MAX_OCCURRENCES,
  MAX_ITERATOR_ADVANCES,
  unfoldIcs,
  parseDateValue,
  parseRrule,
  calculateBusyWindowsFromIcs
};
