/**
 * BR-079 — Organization-local calendar windows.
 * Sanitized fixtures only — does not access production prospect TV-000028.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ATLAS_DEFAULT_TIMEZONE,
  TIMEZONE_SOURCES,
  RELATIVE_PERIODS,
  isValidIanaTimeZone,
  resolveOrganizationTimezone,
  getOrganizationDateWindow,
  isTimestampInWindow,
  buildDateWindowCacheKey,
  zonedTimeToUtcMs,
  partsInZone
} = require("../core/organizationDateWindow");

const NY = "America/New_York";
/** Sanitized regression timestamp matching TV-000028 semantics (evening Aug 5 NY). */
const TV_SEMANTICS_CREATED_AT = "2026-08-06T00:06:19.195Z";
const VIEWED_ON_LOCAL_AUG_6 = "2026-08-06T16:00:00.000Z"; // afternoon Aug 6 NY / UTC

function windowWithTz(relativePeriod, timeZone, reference, organizationId = "org-team-vision") {
  return getOrganizationDateWindow({
    organizationId,
    relativePeriod,
    reference,
    timeZoneResolution: {
      timeZone,
      source: TIMEZONE_SOURCES.ORGANIZATION_SETTINGS
    }
  });
}

test("1. organization timezone resolution prefers settings then profile then atlas default", () => {
  assert.deepEqual(
    resolveOrganizationTimezone({
      organizationSettingsTimezone: "America/Chicago",
      organizationProfileTimezone: NY
    }),
    { timeZone: "America/Chicago", source: TIMEZONE_SOURCES.ORGANIZATION_SETTINGS }
  );

  assert.deepEqual(
    resolveOrganizationTimezone({
      organizationSettingsTimezone: null,
      organizationProfileTimezone: "America/Los_Angeles"
    }),
    { timeZone: "America/Los_Angeles", source: TIMEZONE_SOURCES.ORGANIZATION_PROFILE }
  );

  assert.equal(
    resolveOrganizationTimezone({
      organizationSettingsTimezone: null,
      organizationProfileTimezone: null
    }).source,
    TIMEZONE_SOURCES.ATLAS_DEFAULT
  );
  assert.equal(
    resolveOrganizationTimezone({
      organizationSettingsTimezone: null,
      organizationProfileTimezone: null
    }).timeZone,
    process.env.ATLAS_DEFAULT_TIMEZONE || ATLAS_DEFAULT_TIMEZONE
  );
});

test("2. valid IANA timezone accepted", () => {
  assert.equal(isValidIanaTimeZone(NY), true);
  assert.equal(isValidIanaTimeZone("UTC"), true);
  assert.equal(isValidIanaTimeZone("America/Chicago"), true);
});

test("3. invalid timezone falls through controlled fallback", () => {
  assert.equal(isValidIanaTimeZone("Not/A_Zone"), false);
  assert.equal(isValidIanaTimeZone(""), false);
  assert.equal(isValidIanaTimeZone(null), false);

  assert.deepEqual(
    resolveOrganizationTimezone({
      organizationSettingsTimezone: "Invalid/Timezone",
      organizationProfileTimezone: "Also/Bad"
    }),
    {
      timeZone: process.env.ATLAS_DEFAULT_TIMEZONE || ATLAS_DEFAULT_TIMEZONE,
      source: TIMEZONE_SOURCES.ATLAS_DEFAULT
    }
  );

  const previous = process.env.ATLAS_DEFAULT_TIMEZONE;
  process.env.ATLAS_DEFAULT_TIMEZONE = "Bogus/Zone";
  try {
    assert.deepEqual(
      resolveOrganizationTimezone({
        organizationSettingsTimezone: "Bad",
        organizationProfileTimezone: "AlsoBad"
      }),
      { timeZone: "UTC", source: TIMEZONE_SOURCES.UTC_FALLBACK }
    );
  } finally {
    if (previous === undefined) {
      delete process.env.ATLAS_DEFAULT_TIMEZONE;
    } else {
      process.env.ATLAS_DEFAULT_TIMEZONE = previous;
    }
  }
});

test("4. yesterday in America/New_York resolves local Aug 5 when viewed Aug 6", () => {
  const window = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  assert.equal(window.timeZone, NY);
  assert.equal(window.localStart, "2026-08-05T00:00:00.000");
  assert.equal(window.localEnd, "2026-08-05T23:59:59.999");
  assert.equal(window.utcStart, "2026-08-05T04:00:00.000Z");
  assert.equal(window.utcEnd, "2026-08-06T03:59:59.999Z");
});

test("5. TV-000028 regression timestamp included in local yesterday", () => {
  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  assert.equal(isTimestampInWindow(TV_SEMANTICS_CREATED_AT, yesterday), true);

  const parts = partsInZone(Date.parse(TV_SEMANTICS_CREATED_AT), NY);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 8);
  assert.equal(parts.day, 5);
  assert.equal(parts.hour, 20);
});

test("6. same timestamp excluded from local today", () => {
  const today = windowWithTz(RELATIVE_PERIODS.TODAY, NY, VIEWED_ON_LOCAL_AUG_6);
  assert.equal(today.localStart, "2026-08-06T00:00:00.000");
  assert.equal(isTimestampInWindow(TV_SEMANTICS_CREATED_AT, today), false);
});

test("7. current lifecycle status does not remove created-yesterday count", () => {
  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  const fixtures = [
    { created_at: TV_SEMANTICS_CREATED_AT, status: "NEW" },
    { created_at: TV_SEMANTICS_CREATED_AT, status: "QUALIFIED" },
    { created_at: TV_SEMANTICS_CREATED_AT, status: "INTERVIEW_SCHEDULED" },
    { created_at: TV_SEMANTICS_CREATED_AT, status: "CONFIRMED" },
    { created_at: TV_SEMANTICS_CREATED_AT, status: "COMPLETED" },
    { created_at: TV_SEMANTICS_CREATED_AT, status: "RECRUITED" }
  ];

  const count = fixtures.filter((row) => isTimestampInWindow(row.created_at, yesterday)).length;
  assert.equal(count, 6);
});

test("8. UTC organization behavior uses UTC calendar day", () => {
  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, "UTC", VIEWED_ON_LOCAL_AUG_6);
  assert.equal(yesterday.localStart, "2026-08-05T00:00:00.000");
  assert.equal(yesterday.utcStart, "2026-08-05T00:00:00.000Z");
  assert.equal(yesterday.utcEnd, "2026-08-05T23:59:59.999Z");
  assert.equal(isTimestampInWindow(TV_SEMANTICS_CREATED_AT, yesterday), false);

  const today = windowWithTz(RELATIVE_PERIODS.TODAY, "UTC", VIEWED_ON_LOCAL_AUG_6);
  assert.equal(isTimestampInWindow(TV_SEMANTICS_CREATED_AT, today), true);
});

test("9. organization isolation — client timezone override ignored; org windows scoped", () => {
  const orgA = getOrganizationDateWindow({
    organizationId: "org-a",
    relativePeriod: RELATIVE_PERIODS.YESTERDAY,
    reference: VIEWED_ON_LOCAL_AUG_6,
    clientTimeZone: "Pacific/Honolulu",
    timeZoneResolution: {
      timeZone: NY,
      source: TIMEZONE_SOURCES.ORGANIZATION_SETTINGS
    }
  });
  const orgB = getOrganizationDateWindow({
    organizationId: "org-b",
    relativePeriod: RELATIVE_PERIODS.YESTERDAY,
    reference: VIEWED_ON_LOCAL_AUG_6,
    timeZoneResolution: {
      timeZone: "UTC",
      source: TIMEZONE_SOURCES.ORGANIZATION_SETTINGS
    }
  });

  assert.equal(orgA.timeZone, NY);
  assert.equal(orgA.organizationId, "org-a");
  assert.equal(orgB.timeZone, "UTC");
  assert.equal(orgB.organizationId, "org-b");
  assert.notEqual(orgA.utcStart, orgB.utcStart);
});

test("10. midnight local boundary — just before and after local midnight", () => {
  const today = windowWithTz(RELATIVE_PERIODS.TODAY, NY, VIEWED_ON_LOCAL_AUG_6);
  const justBefore = "2026-08-06T03:59:59.999Z"; // Aug 5 11:59:59.999 PM EDT
  const justAfter = "2026-08-06T04:00:00.000Z"; // Aug 6 12:00:00 AM EDT

  assert.equal(isTimestampInWindow(justBefore, today), false);
  assert.equal(isTimestampInWindow(justAfter, today), true);

  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  assert.equal(isTimestampInWindow(justBefore, yesterday), true);
  assert.equal(isTimestampInWindow(justAfter, yesterday), false);
});

test("11. UTC rollover boundary — evening NY maps across UTC date", () => {
  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  assert.equal(isTimestampInWindow("2026-08-06T00:00:00.000Z", yesterday), true);
  assert.equal(isTimestampInWindow("2026-08-06T03:59:59.999Z", yesterday), true);
  assert.equal(isTimestampInWindow("2026-08-06T04:00:00.000Z", yesterday), false);
});

test("12. DST spring-forward — America/New_York 2026-03-08 is 23h local day", () => {
  // 2026-03-08: clocks spring forward 2am → 3am EDT
  const dayStart = zonedTimeToUtcMs(2026, 3, 8, 0, 0, 0, 0, NY);
  const dayEnd = zonedTimeToUtcMs(2026, 3, 8, 23, 59, 59, 999, NY);
  const durationHours = (dayEnd - dayStart + 1) / (60 * 60 * 1000);
  assert.ok(durationHours < 24, `expected short day, got ${durationHours}`);

  const window = windowWithTz(
    RELATIVE_PERIODS.TODAY,
    NY,
    "2026-03-08T18:00:00.000Z"
  );
  assert.equal(window.localStart, "2026-03-08T00:00:00.000");
  assert.equal(isTimestampInWindow(new Date(dayStart).toISOString(), window), true);
  assert.equal(isTimestampInWindow(new Date(dayEnd).toISOString(), window), true);
});

test("13. DST fall-back — America/New_York 2026-11-01 is 25h local day", () => {
  const dayStart = zonedTimeToUtcMs(2026, 11, 1, 0, 0, 0, 0, NY);
  const dayEnd = zonedTimeToUtcMs(2026, 11, 1, 23, 59, 59, 999, NY);
  const durationHours = (dayEnd - dayStart + 1) / (60 * 60 * 1000);
  assert.ok(durationHours > 24, `expected long day, got ${durationHours}`);

  const window = windowWithTz(
    RELATIVE_PERIODS.TODAY,
    NY,
    "2026-11-01T18:00:00.000Z"
  );
  assert.equal(window.localStart, "2026-11-01T00:00:00.000");
  assert.equal(isTimestampInWindow(new Date(dayStart).toISOString(), window), true);
  assert.equal(isTimestampInWindow(new Date(dayEnd).toISOString(), window), true);
});

test("14. interviews-today window matches organization-local day", () => {
  const today = windowWithTz(RELATIVE_PERIODS.TODAY, NY, VIEWED_ON_LOCAL_AUG_6);
  const interviewToday = "2026-08-06T18:00:00.000Z"; // 2pm EDT Aug 6
  const interviewYesterday = TV_SEMANTICS_CREATED_AT;
  assert.equal(isTimestampInWindow(interviewToday, today), true);
  assert.equal(isTimestampInWindow(interviewYesterday, today), false);
});

test("15. overdue follow-up local-day behavior", () => {
  const { classifyFollowUpStatus } = require("../core/followUpsQueueEngine");
  const { MILESTONES } = require("../core/workflowConstants");
  const today = windowWithTz(RELATIVE_PERIODS.TODAY, NY, VIEWED_ON_LOCAL_AUG_6);

  assert.equal(
    classifyFollowUpStatus({
      canonicalMilestone: MILESTONES.FOLLOW_UP,
      followUpAtMs: Date.parse("2026-08-05T20:00:00.000Z"),
      priorityTier: "FOLLOW_UP_DUE",
      todayWindow: today
    }),
    "overdue"
  );

  assert.equal(
    classifyFollowUpStatus({
      canonicalMilestone: MILESTONES.FOLLOW_UP,
      followUpAtMs: Date.parse("2026-08-06T18:00:00.000Z"),
      priorityTier: "FOLLOW_UP_DUE",
      todayWindow: today
    }),
    "due-today"
  );
});

test("16. Alpha Brief uses canonical resolver for new-prospects yesterday", () => {
  // Pure Alpha Brief semantics without loading supabase-backed engines.
  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  const today = windowWithTz(RELATIVE_PERIODS.TODAY, NY, VIEWED_ON_LOCAL_AUG_6);
  const prospects = [
    {
      phone: "+15550000028",
      created_at: TV_SEMANTICS_CREATED_AT,
      current_step: "QUALIFIED",
      prospect_number: "SANITIZED-000028"
    }
  ];

  const newProspects = prospects.filter((row) =>
    isTimestampInWindow(row.created_at, yesterday)
  ).length;
  const todayNew = prospects.filter((row) =>
    isTimestampInWindow(row.created_at, today)
  ).length;

  assert.equal(newProspects, 1);
  assert.equal(todayNew, 0);

  const cacheKey = buildDateWindowCacheKey({
    organizationId: "org-team-vision",
    timeZone: yesterday.timeZone,
    period: RELATIVE_PERIODS.YESTERDAY,
    localStart: yesterday.localStart,
    localEnd: yesterday.localEnd
  });
  assert.match(cacheKey, /America\/New_York/);
  assert.match(cacheKey, /2026-08-05/);

  // Source inspection: Alpha Brief module must import the canonical resolver.
  const fs = require("node:fs");
  const alphaSource = fs.readFileSync(
    require("node:path").join(__dirname, "../core/alphaMorningBriefEngine.js"),
    "utf8"
  );
  assert.match(alphaSource, /organizationDateWindow/);
  assert.match(alphaSource, /getOrganizationDateWindow/);
  assert.match(alphaSource, /isTimestampInWindow/);
  assert.doesNotMatch(alphaSource, /startOfYesterday|endOfYesterday|setHours\(/);
});

test("17. Team Dashboard / Executive Dashboard uses canonical today window metadata", () => {
  const today = getOrganizationDateWindow({
    organizationId: "org-team-vision",
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference: VIEWED_ON_LOCAL_AUG_6,
    deps: {
      getOrganizationSettings: () => ({ timezone: null }),
      getOrganizationProfileTimezone: () => NY
    }
  });

  assert.equal(today.timeZone, NY);
  assert.equal(today.period, RELATIVE_PERIODS.TODAY);
  assert.equal(today.source, TIMEZONE_SOURCES.ORGANIZATION_PROFILE);
  assert.equal(today.localStart, "2026-08-06T00:00:00.000");
});

test("18. cache key includes organization, timezone, and date window", () => {
  const yesterday = windowWithTz(RELATIVE_PERIODS.YESTERDAY, NY, VIEWED_ON_LOCAL_AUG_6);
  const key = buildDateWindowCacheKey({
    organizationId: "org-team-vision",
    timeZone: yesterday.timeZone,
    period: yesterday.period,
    localStart: yesterday.localStart,
    localEnd: yesterday.localEnd
  });

  assert.equal(
    key,
    "org-date-window:org-team-vision:America/New_York:yesterday:2026-08-05T00:00:00.000:2026-08-05T23:59:59.999"
  );

  const otherOrg = buildDateWindowCacheKey({
    organizationId: "org-other",
    timeZone: yesterday.timeZone,
    period: yesterday.period,
    localStart: yesterday.localStart,
    localEnd: yesterday.localEnd
  });
  assert.notEqual(key, otherOrg);
});

test("19. no production writes — resolver is pure and fixture-only", () => {
  const before = JSON.stringify(
    getOrganizationDateWindow({
      organizationId: "org-readonly",
      relativePeriod: RELATIVE_PERIODS.YESTERDAY,
      reference: VIEWED_ON_LOCAL_AUG_6,
      timeZoneResolution: { timeZone: NY, source: TIMEZONE_SOURCES.ATLAS_DEFAULT }
    })
  );
  const after = JSON.stringify(
    getOrganizationDateWindow({
      organizationId: "org-readonly",
      relativePeriod: RELATIVE_PERIODS.YESTERDAY,
      reference: VIEWED_ON_LOCAL_AUG_6,
      timeZoneResolution: { timeZone: NY, source: TIMEZONE_SOURCES.ATLAS_DEFAULT }
    })
  );
  assert.equal(before, after);
});

test("20. appointments today view uses organization UTC window", () => {
  const { resolveAppointmentViewFilters } = require("../core/appointmentListQuery");
  const filters = resolveAppointmentViewFilters("today", new Date(VIEWED_ON_LOCAL_AUG_6), {
    organizationId: "org-team-vision"
  });

  assert.equal(filters.from, "2026-08-06T04:00:00.000Z");
  assert.equal(filters.to, "2026-08-07T03:59:59.999Z");
  assert.equal(filters.timeZone, NY);
});
