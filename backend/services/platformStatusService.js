/**
 * Sprint 17.0 — Platform status aggregation for Knowledge Hub dashboard.
 * Reads authoritative repository files; never invents sprint or version data.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "../..");
const CACHE_TTL_MS = 45_000;

const AUTHORITATIVE_DOCS = Object.freeze({
  currentSprint: "docs/00-executive/CURRENT_SPRINT.md",
  currentState: "docs/CURRENT_STATE.md",
  roadmap: "docs/00-executive/Roadmap.md",
  changelog: "docs/09-releases/CHANGELOG.md",
  rc1Certification: "docs/10-release-candidate/RC1_CERTIFICATION.md"
});

const EXTERNAL_REVIEW_PATH = path.join(__dirname, "../data/externalReviewStatus.json");

let cache = {
  expiresAt: 0,
  payload: null
};

function readRepoFile(relativePath) {
  const absolutePath = path.join(REPO_ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath,
      content: null,
      modifiedAt: null
    };
  }

  const stat = fs.statSync(absolutePath);

  return {
    relativePath,
    content: fs.readFileSync(absolutePath, "utf8"),
    modifiedAt: stat.mtime.toISOString()
  };
}

function parseFrontmatter(content) {
  if (!content) {
    return { frontmatter: {}, body: "" };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter = {};

  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    frontmatter[key] = value;
  }

  return {
    frontmatter,
    body: match[2]
  };
}

function parseEnvironmentStatusTable(markdown) {
  if (!markdown) {
    return [];
  }

  const sectionMatch = markdown.match(/## Environment Status[\s\S]*?(?=\n## [^#]|$)/);

  if (!sectionMatch) {
    return [];
  }

  const rows = [];
  const lines = sectionMatch[0].split("\n");

  for (const line of lines) {
    if (!line.trim().startsWith("|") || line.includes("---")) {
      continue;
    }

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length < 2 || cells[0].toLowerCase() === "component") {
      continue;
    }

    rows.push({
      component: cells[0],
      status: cells[1]
    });
  }

  return rows;
}

function pickCurrentStateField(markdown, heading) {
  if (!markdown) {
    return null;
  }

  const pattern = new RegExp(`## ${heading}\\s*\\n+([^#\\n][\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = markdown.match(pattern);

  if (!match) {
    return null;
  }

  const firstLine = match[1]
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? firstLine.replace(/[*_`]/g, "").trim() : null;
}

function readPackageVersion(warnings) {
  const pkg = readRepoFile("package.json");

  if (!pkg.content) {
    warnings.push("package.json not found.");
    return null;
  }

  try {
    const parsed = JSON.parse(pkg.content);
    return parsed.version || null;
  } catch {
    warnings.push("package.json could not be parsed.");
    return null;
  }
}

function readReleaseMetadata(warnings) {
  const rc1 = readRepoFile(AUTHORITATIVE_DOCS.rc1Certification);
  let releaseLabel = null;
  let certification = null;
  let certificationDate = null;

  if (rc1.content) {
    const releaseMatch = rc1.content.match(/\*\*Release\*\*\s*\|\s*([^|]+)\s*\|/);
    const statusMatch = rc1.content.match(/\*\*Status\*\*\s*\|\s*\*\*([^*]+)\*\*/);
    const dateMatch = rc1.content.match(/\*\*Certification date\*\*\s*\|\s*([^|]+)\s*\|/);

    releaseLabel = releaseMatch ? releaseMatch[1].trim() : null;
    certification = statusMatch ? statusMatch[1].trim() : null;
    certificationDate = dateMatch ? dateMatch[1].trim() : null;
  } else {
    warnings.push("RC1 certification document not found.");
  }

  return {
    releaseLabel,
    certification,
    certificationDate,
    modifiedAt: rc1.modifiedAt
  };
}

function readSprintMetadata(warnings) {
  const sprintDoc = readRepoFile(AUTHORITATIVE_DOCS.currentSprint);

  if (!sprintDoc.content) {
    warnings.push("CURRENT_SPRINT.md not found.");
    return {
      number: null,
      title: null,
      phase: null,
      objective: null,
      status: null,
      started: null,
      sourcePath: AUTHORITATIVE_DOCS.currentSprint
    };
  }

  const { frontmatter } = parseFrontmatter(sprintDoc.content);
  const sprintNumber = frontmatter.sprint ? Number(frontmatter.sprint) : null;

  if (!sprintNumber || Number.isNaN(sprintNumber)) {
    warnings.push("CURRENT_SPRINT.md is missing a valid sprint number.");
  }

  return {
    number: Number.isNaN(sprintNumber) ? null : sprintNumber,
    title: frontmatter.title || null,
    phase: frontmatter.phase || null,
    objective: frontmatter.objective || null,
    status: frontmatter.status || null,
    started: frontmatter.started || null,
    sourcePath: AUTHORITATIVE_DOCS.currentSprint,
    modifiedAt: sprintDoc.modifiedAt
  };
}

function readGitMetadata(warnings) {
  const gitDir = path.join(REPO_ROOT, ".git");

  if (!fs.existsSync(gitDir)) {
    warnings.push("Git metadata unavailable: .git directory not found.");
    return {
      branch: null,
      shortCommit: null,
      commitMessage: null,
      commitDate: null,
      isDirty: null
    };
  }

  function runGit(args) {
    const result = spawnSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    return String(result.stdout || "").trim();
  }

  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const shortCommit = runGit(["rev-parse", "--short", "HEAD"]);
  const commitMessage = runGit(["log", "-1", "--pretty=%s"]);
  const commitDate = runGit(["log", "-1", "--pretty=%cI"]);
  const statusOutput = runGit(["status", "--porcelain"]);

  if (!branch && !shortCommit) {
    warnings.push("Git metadata could not be read.");
  }

  return {
    branch,
    shortCommit,
    commitMessage,
    commitDate,
    isDirty: statusOutput === null ? null : statusOutput.length > 0
  };
}

function readExternalReviewStatus(warnings) {
  if (!fs.existsSync(EXTERNAL_REVIEW_PATH)) {
    warnings.push("External review status file not found.");
    return {
      metaTechProviderStatus: null,
      metaTechProviderSubmittedAt: null,
      metaTechProviderNote: null,
      metaAdvancedAccessStatus: null,
      source: "backend/data/externalReviewStatus.json"
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(EXTERNAL_REVIEW_PATH, "utf8"));
    const meta = parsed.meta || {};
    const tech = meta.techProviderAccessVerification || {};
    const advanced = meta.advancedAccess || {};

    return {
      metaTechProviderStatus: tech.status || null,
      metaTechProviderSubmittedAt: tech.submittedAt || null,
      metaTechProviderNote: tech.note || null,
      metaAdvancedAccessStatus: advanced.status || null,
      source: "backend/data/externalReviewStatus.json"
    };
  } catch {
    warnings.push("External review status file could not be parsed.");
    return {
      metaTechProviderStatus: null,
      metaTechProviderSubmittedAt: null,
      metaTechProviderNote: null,
      metaAdvancedAccessStatus: null,
      source: "backend/data/externalReviewStatus.json"
    };
  }
}

function buildDocumentationMetadata(warnings) {
  const entries = Object.entries(AUTHORITATIVE_DOCS).map(([key, relativePath]) => {
    const file = readRepoFile(relativePath);

    if (!file.content && key !== "currentSprint") {
      warnings.push(`Authoritative document missing: ${relativePath}`);
    }

    return {
      key,
      relativePath,
      modifiedAt: file.modifiedAt
    };
  });

  const modifiedDates = entries
    .map((entry) => entry.modifiedAt)
    .filter(Boolean)
    .sort();

  return {
    lastUpdated: modifiedDates.length ? modifiedDates[modifiedDates.length - 1] : null,
    currentStatePath: AUTHORITATIVE_DOCS.currentState,
    currentSprintPath: AUTHORITATIVE_DOCS.currentSprint,
    roadmapPath: AUTHORITATIVE_DOCS.roadmap,
    changelogPath: AUTHORITATIVE_DOCS.changelog,
    rc1CertificationPath: AUTHORITATIVE_DOCS.rc1Certification,
    files: entries
  };
}

function deriveOverallStatus(currentStateMarkdown, releaseMeta) {
  const fromCurrentState = pickCurrentStateField(currentStateMarkdown, "Overall Status");

  if (fromCurrentState) {
    return fromCurrentState;
  }

  if (releaseMeta.certification) {
    return releaseMeta.certification;
  }

  return null;
}

function buildPlatformStatusPayload() {
  const warnings = [];
  const version = readPackageVersion(warnings);
  const sprint = readSprintMetadata(warnings);
  const git = readGitMetadata(warnings);
  const external = readExternalReviewStatus(warnings);
  const documentation = buildDocumentationMetadata(warnings);
  const releaseMeta = readReleaseMetadata(warnings);
  const currentState = readRepoFile(AUTHORITATIVE_DOCS.currentState);
  const environmentHealth = parseEnvironmentStatusTable(currentState.content);
  const overallStatus = deriveOverallStatus(currentState.content, releaseMeta);

  if (!currentState.content) {
    warnings.push("CURRENT_STATE.md not found.");
  }

  if (!environmentHealth.length && currentState.content) {
    warnings.push("Environment Status table not found in CURRENT_STATE.md.");
  }

  const generatedAt = new Date().toISOString();

  return {
    data: {
      platform: {
        name: "Atlas Core Platform",
        version: version || "Unknown",
        releaseLabel: releaseMeta.releaseLabel || "Unknown",
        certification: releaseMeta.certification || "Unknown",
        certificationDate: releaseMeta.certificationDate || null,
        overallStatus: overallStatus || "Unknown"
      },
      sprint,
      git,
      documentation,
      external,
      environmentHealth,
      generatedAt
    },
    warnings,
    generatedAt
  };
}

function getPlatformStatus({ forceRefresh = false } = {}) {
  const now = Date.now();

  if (!forceRefresh && cache.payload && cache.expiresAt > now) {
    return {
      ...cache.payload,
      cached: true
    };
  }

  const payload = buildPlatformStatusPayload();

  cache = {
    expiresAt: now + CACHE_TTL_MS,
    payload: {
      ok: true,
      data: payload.data,
      warnings: payload.warnings,
      generatedAt: payload.generatedAt,
      cached: false
    }
  };

  return cache.payload;
}

module.exports = {
  AUTHORITATIVE_DOCS,
  CACHE_TTL_MS,
  buildPlatformStatusPayload,
  getPlatformStatus,
  parseFrontmatter,
  parseEnvironmentStatusTable
};
