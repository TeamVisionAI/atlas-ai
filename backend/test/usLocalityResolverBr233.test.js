/**
 * BR-233 PR 1 — national U.S. locality resolver golden pack.
 * Isolated module. Does not import interpreter, decisionEngine, coverage, or IUL.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resolveUsLocality,
  loadUsLocalityIndex,
  COMPLETENESS,
  CONFIDENCE,
  RESOLUTION_SOURCE
} = require("../core/usLocalityResolver");

const RESOLVER_DIR = path.join(__dirname, "../core/usLocalityResolver");
const ARTIFACT = path.join(RESOLVER_DIR, "data/usLocalities.generated.json");

function assertComplete(parsed, city, state, label) {
  assert.ok(parsed, label);
  assert.equal(parsed.city, city, label);
  assert.equal(parsed.state, state, label);
  assert.equal(parsed.completeness, COMPLETENESS.COMPLETE, label);
  assert.equal(parsed.requiresClarification, false, label);
  assert.notEqual(parsed.resolutionSource, RESOLUTION_SOURCE.NONE, label);
  assert.notEqual(parsed.confidence, CONFIDENCE.LOW, label);
}

test("docs: BR-233 national resolution is tenant-agnostic", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-233/);
  assert.match(rules, /tenant-agnostic/i);
  assert.match(rules, /BR-226/);
});

test("module isolation: no Recruit V2 / coverage / IUL wiring", () => {
  const files = [
    "index.js",
    "resolveUsLocality.js",
    "loadIndex.js",
    "normalize.js",
    "constants.js"
  ];
  const bannedRequire =
    /require\(["'].*(locationFacts|localAreaConfig|recruitingCoverage|interpreter|decisionEngine|semanticConversationEngine)/i;
  for (const file of files) {
    const src = fs.readFileSync(path.join(RESOLVER_DIR, file), "utf8");
    assert.doesNotMatch(src, bannedRequire, file);
    assert.doesNotMatch(src, /localCities/, file);
    assert.doesNotMatch(src, /CITY_TO_PROPOSED_STATE/, file);
    assert.doesNotMatch(src, /evaluateCoverage/, file);
  }
});

test("index covers 50 states + DC and excludes PR", () => {
  const index = loadUsLocalityIndex();
  assert.equal(index.source.coverage, "50 states + DC");
  assert.ok(index.source.excluded.includes("PR"));
  assert.ok(index.byName.dallas.TX);
  assert.ok(index.byName.washington.DC);
  assert.ok(!index.byName["san juan"] || !index.byName["san juan"].PR);
  const states = new Set();
  for (const row of Object.values(index.byName)) {
    Object.keys(row).forEach((state) => states.add(state));
  }
  assert.equal(states.has("PR"), false);
  assert.equal(states.has("DC"), true);
  assert.ok(states.size >= 51);
});

test("Dallas Texas / Dallas TX", () => {
  assertComplete(resolveUsLocality("Dallas Texas"), "Dallas", "TX", "full");
  assertComplete(resolveUsLocality("Dallas TX"), "Dallas", "TX", "abbr");
});

test("Atlanta Georgia", () => {
  assertComplete(resolveUsLocality("Atlanta Georgia"), "Atlanta", "GA", "atlanta");
});

test("Charlotte NC", () => {
  assertComplete(resolveUsLocality("Charlotte NC"), "Charlotte", "NC", "charlotte");
});

test("Brooklyn New York", () => {
  assertComplete(resolveUsLocality("Brooklyn New York"), "Brooklyn", "NY", "brooklyn");
});

test("Las Vegas Nevada", () => {
  assertComplete(resolveUsLocality("Las Vegas Nevada"), "Las Vegas", "NV", "vegas");
});

test("Salt Lake City UT", () => {
  assertComplete(
    resolveUsLocality("Salt Lake City UT"),
    "Salt Lake City",
    "UT",
    "slc"
  );
});

test("Chicago IL", () => {
  assertComplete(resolveUsLocality("Chicago IL"), "Chicago", "IL", "chicago");
});

test("Boston Massachusetts", () => {
  assertComplete(resolveUsLocality("Boston Massachusetts"), "Boston", "MA", "boston");
});

test("Seattle WA", () => {
  assertComplete(resolveUsLocality("Seattle WA"), "Seattle", "WA", "seattle");
});

test("Washington DC", () => {
  assertComplete(resolveUsLocality("Washington DC"), "Washington", "DC", "dc");
});

test("North Miami Beach Florida — multi-word longest match", () => {
  const parsed = resolveUsLocality("North Miami Beach Florida");
  assertComplete(parsed, "North Miami Beach", "FL", "nmb");
  assert.notEqual(parsed.city, "Beach");
  assert.notEqual(parsed.city, "Miami");
  assert.notEqual(parsed.city, "North Miami");
});

test("Springfield bare is ambiguous", () => {
  const parsed = resolveUsLocality("Springfield");
  assert.equal(parsed.requiresClarification, true);
  assert.equal(parsed.state, null);
  assert.equal(parsed.proposedState, null);
  assert.equal(parsed.completeness, COMPLETENESS.PARTIAL);
  assert.equal(parsed.resolutionSource, RESOLUTION_SOURCE.AMBIGUOUS);
  assert.equal(parsed.city, "Springfield");
});

test("Springfield IL 62701 resolves with ZIP evidence", () => {
  const parsed = resolveUsLocality("Springfield IL 62701");
  assertComplete(parsed, "Springfield", "IL", "springfield zip");
  assert.equal(parsed.zip, "62701");
  assert.equal(parsed.resolutionSource, RESOLUTION_SOURCE.ZIP_CROSSWALK);
});

test("full street + city/state and street typo still resolve trailing locality", () => {
  assertComplete(
    resolveUsLocality("1535 NW 180th St, North Miami Beach, FL"),
    "North Miami Beach",
    "FL",
    "street"
  );
  assertComplete(
    resolveUsLocality("Vivo en la 1535 NT 180 ST NORTH MIAMI BEACH Florida."),
    "North Miami Beach",
    "FL",
    "typo street"
  );
});

test("numeric street tokens never become city", () => {
  const parsed = resolveUsLocality("1535 Florida");
  assert.notEqual(parsed.city, "1535");
  assert.notEqual(parsed.completeness, COMPLETENESS.COMPLETE);
});

test("invented city/state is not high-confidence gazetteer", () => {
  const parsed = resolveUsLocality("Something Fake Texas");
  assert.notEqual(parsed.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  assert.notEqual(parsed.confidence, CONFIDENCE.HIGH);
  assert.notEqual(parsed.city, "Something Fake");
});

test("Puerto Rico does not enter the 50-state/DC resolver", () => {
  const prName = resolveUsLocality("San Juan Puerto Rico");
  const prAbbr = resolveUsLocality("San Juan PR");
  assert.equal(prName.state, null);
  assert.equal(prAbbr.state, null);
  assert.notEqual(prName.completeness, COMPLETENESS.COMPLETE);
  assert.notEqual(prAbbr.completeness, COMPLETENESS.COMPLETE);
});

test("Florida cities resolve from the national gazetteer, not a FL overlay dictionary", () => {
  const orlando = resolveUsLocality("Orlando Florida");
  const miami = resolveUsLocality("Miami FL");
  assertComplete(orlando, "Orlando", "FL", "orlando");
  assertComplete(miami, "Miami", "FL", "miami");
  assert.equal(orlando.resolutionSource, RESOLUTION_SOURCE.GAZETTEER);
  const overlay = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/locationFacts.js"),
    "utf8"
  );
  assert.match(overlay, /CITY_TO_PROPOSED_STATE/);
  const resolver = fs.readFileSync(
    path.join(RESOLVER_DIR, "resolveUsLocality.js"),
    "utf8"
  );
  assert.doesNotMatch(resolver, /CITY_TO_PROPOSED_STATE|HIGH_CONFIDENCE_FL/);
});

test("Spanish state aliases already supported (Carolina del Norte)", () => {
  assertComplete(
    resolveUsLocality("Charlotte Carolina del Norte"),
    "Charlotte",
    "NC",
    "spanish NC"
  );
});

test("artifact size, memory, and lookup benchmark", () => {
  const bytes = fs.statSync(ARTIFACT).size;
  assert.ok(bytes > 500_000, "artifact should include national places");
  assert.ok(bytes < 8_000_000, "artifact should stay compact");

  const before = process.memoryUsage().heapUsed;
  const index = loadUsLocalityIndex();
  const after = process.memoryUsage().heapUsed;
  assert.ok(index.stats.placeKeys > 10_000);
  const heapDeltaMb = (after - before) / (1024 * 1024);
  assert.ok(heapDeltaMb < 40, `heap delta ${heapDeltaMb}MB`);

  const samples = [
    "Dallas Texas",
    "Charlotte NC",
    "North Miami Beach Florida",
    "Springfield",
    "Springfield IL 62701",
    "1535 NW 180th St, North Miami Beach, FL"
  ];
  const rounds = 400;
  const started = process.hrtime.bigint();
  for (let i = 0; i < rounds; i += 1) {
    resolveUsLocality(samples[i % samples.length]);
  }
  const elapsedNs = Number(process.hrtime.bigint() - started);
  const avgMs = elapsedNs / rounds / 1e6;
  assert.ok(avgMs < 2, `avg lookup ${avgMs}ms`);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      artifactBytes: bytes,
      artifactMb: Number((bytes / (1024 * 1024)).toFixed(2)),
      heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
      avgLookupMs: Number(avgMs.toFixed(4)),
      placeKeys: index.stats.placeKeys,
      zipRows: index.stats.zipRows
    })
  );
});
