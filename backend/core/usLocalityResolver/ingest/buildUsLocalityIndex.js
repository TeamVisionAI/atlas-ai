#!/usr/bin/env node
/**
 * BR-233 — Deterministic Census Places/CDP + ZCTA-Place ingest.
 * Runtime resolver never downloads. This script is build-time only.
 *
 * Sources (public domain — U.S. federal government works):
 * - Census Gazetteer Places 2025 national file
 * - Census 2020 ZCTA5–Place relationship file
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");

const {
  US_POSTAL_ABBREVIATIONS,
  FIPS_TO_USPS
} = require("../constants");
const {
  foldToken,
  stripPlaceLsadSuffix,
  titleCaseCity,
  aliasKeysForPlace
} = require("../normalize");

const ROOT = path.join(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_FILE = path.join(ROOT, "data", "usLocalities.generated.json");

const PLACES_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip";
const ZIP_REL_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt";

const NYC_BOROUGH_ALIASES = [
  { key: "brooklyn", display: "Brooklyn", state: "NY" },
  { key: "queens", display: "Queens", state: "NY" },
  { key: "bronx", display: "Bronx", state: "NY" },
  { key: "the bronx", display: "Bronx", state: "NY" },
  { key: "manhattan", display: "Manhattan", state: "NY" },
  { key: "staten island", display: "Staten Island", state: "NY" }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, { headers: { "User-Agent": "atlas-ai-br233-ingest" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`GET ${url} → ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    request.on("error", (error) => {
      file.close();
      reject(error);
    });
  });
}

function unzipPlaces(zipPath, cacheDir) {
  const result = spawnSync("unzip", ["-o", zipPath, "-d", cacheDir], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "unzip failed");
  }
  const txt = fs
    .readdirSync(cacheDir)
    .find((name) => /gaz_place_national\.txt$/i.test(name));
  if (!txt) {
    throw new Error("National places text not found after unzip");
  }
  return path.join(cacheDir, txt);
}

function parseDelimitedHeader(line) {
  const pipe = line.split("|");
  const tab = line.split("\t");
  const parts = pipe.length > tab.length ? pipe : tab;
  return {
    delimiter: pipe.length > tab.length ? "|" : "\t",
    headers: parts.map((part) => foldToken(part).replace(/\s+/g, "_"))
  };
}

function addPlace(byName, cityKey, state, display, source = "census_place") {
  if (!cityKey || !US_POSTAL_ABBREVIATIONS.has(state)) {
    return;
  }
  if (!byName[cityKey]) {
    byName[cityKey] = {};
  }
  if (!byName[cityKey][state]) {
    byName[cityKey][state] = { display, source };
  }
}

function ingestPlaces(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0];
  const { delimiter, headers } = parseDelimitedHeader(header);
  const uspsIdx = headers.findIndex((h) => h === "usps");
  const nameIdx = headers.findIndex((h) => h === "name");
  if (uspsIdx < 0 || nameIdx < 0) {
    throw new Error(`Unexpected places header: ${headers.join(",")}`);
  }

  const byName = {};
  let skippedTerritory = 0;
  let kept = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter);
    const usps = String(cols[uspsIdx] || "").trim().toUpperCase();
    const rawName = String(cols[nameIdx] || "").trim();
    if (!usps || !rawName) {
      continue;
    }
    if (!US_POSTAL_ABBREVIATIONS.has(usps)) {
      skippedTerritory += 1;
      continue;
    }
    const cityKey = stripPlaceLsadSuffix(rawName);
    if (!cityKey || cityKey.length < 2) {
      continue;
    }
    const display = titleCaseCity(cityKey);
    for (const key of aliasKeysForPlace(cityKey)) {
      addPlace(byName, key, usps, display, "census_place");
    }
    kept += 1;
  }
  return { byName, kept, skippedTerritory };
}

function ingestZipRel(filePath, byName) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const { delimiter, headers } = parseDelimitedHeader(lines[0]);
  const zctaIdx = headers.findIndex((h) => h === "geoid_zcta5_20");
  const placeNameIdx = headers.findIndex((h) => h === "namelsad_place_20");
  const placeGeoidIdx = headers.findIndex((h) => h === "geoid_place_20");
  const landIdx = headers.findIndex((h) => h === "arealand_part");

  if (zctaIdx < 0 || placeNameIdx < 0) {
    throw new Error(`Unexpected ZIP relationship header: ${headers.join(",")}`);
  }

  const best = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter);
    const zcta = String(cols[zctaIdx] || "").replace(/\D/g, "").slice(0, 5);
    const rawPlace = String(cols[placeNameIdx] || "").trim();
    if (!zcta || zcta.length !== 5 || !rawPlace) {
      continue;
    }
    const cityKey = stripPlaceLsadSuffix(rawPlace);
    const placeGeoid = String(cols[placeGeoidIdx] || "").replace(/\D/g, "");
    const state = FIPS_TO_USPS[placeGeoid.slice(0, 2)] || "";
    if (!cityKey || !US_POSTAL_ABBREVIATIONS.has(state)) {
      continue;
    }
    if (!byName[cityKey] || !byName[cityKey][state]) {
      continue;
    }
    const land = landIdx >= 0 ? Number(cols[landIdx] || 0) : 0;
    const prev = best.get(zcta);
    if (!prev || land > prev.land) {
      best.set(zcta, {
        cityKey,
        state,
        display: byName[cityKey][state].display,
        land
      });
    }
  }

  const byZip = {};
  for (const [zip, row] of best.entries()) {
    byZip[zip] = [row.cityKey, row.state];
  }
  return byZip;
}

function applyBoroughAliases(byName) {
  for (const alias of NYC_BOROUGH_ALIASES) {
    addPlace(byName, alias.key, alias.state, alias.display, "nyc_borough_alias");
  }
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const placesZip = path.join(CACHE_DIR, "2025_Gaz_place_national.zip");
  const zipRel = path.join(CACHE_DIR, "tab20_zcta520_place20_natl.txt");

  if (!fs.existsSync(placesZip)) {
    process.stderr.write(`Downloading places gazetteer…\n`);
    await download(PLACES_URL, placesZip);
  }
  if (!fs.existsSync(zipRel)) {
    process.stderr.write(`Downloading ZCTA–Place relationship…\n`);
    await download(ZIP_REL_URL, zipRel);
  }

  const placesTxt = unzipPlaces(placesZip, CACHE_DIR);
  const { byName, kept, skippedTerritory } = ingestPlaces(placesTxt);
  applyBoroughAliases(byName);
  const byZip = ingestZipRel(zipRel, byName);

  const compactNames = {};
  for (const [key, states] of Object.entries(byName)) {
    compactNames[key] = {};
    for (const [state, row] of Object.entries(states)) {
      compactNames[key][state] = row.display;
    }
  }

  const artifact = {
    version: 1,
    generatedAt: "2026-09-05T00:00:00.000Z",
    source: {
      places: "US Census Bureau Gazetteer Places 2025 (2025_Gaz_place_national.zip)",
      zip: "US Census 2020 ZCTA5–Place relationship (tab20_zcta520_place20_natl.txt)",
      license: "Public domain — U.S. Census Bureau / U.S. federal government work",
      coverage: "50 states + DC",
      excluded: ["PR", "AS", "GU", "MP", "VI"]
    },
    stats: {
      placeRowsKept: kept,
      placeKeys: Object.keys(compactNames).length,
      zipRows: Object.keys(byZip).length,
      skippedTerritoryRows: skippedTerritory
    },
    byName: compactNames,
    byZip
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(artifact)}\n`);
  const bytes = fs.statSync(OUT_FILE).size;
  process.stdout.write(
    JSON.stringify(
      {
        outFile: path.relative(path.join(ROOT, "../../.."), OUT_FILE),
        bytes,
        megabytes: Number((bytes / (1024 * 1024)).toFixed(2)),
        ...artifact.stats
      },
      null,
      2
    ) + "\n"
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = { ingestPlaces, addPlace, applyBoroughAliases };
