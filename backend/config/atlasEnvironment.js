/**
 * Atlas runtime environment + staging Supabase isolation guards.
 * Never rely on NODE_ENV alone. Production remains valid when ATLAS_ENV is unset.
 */

const ATLAS_ENVS = Object.freeze(["development", "staging", "production"]);
const PRODUCTION_SUPABASE_PROJECT_REF = "gjuheeztwxbnscjobkzm";

function resolveAtlasEnv(env = process.env) {
  const raw = String(env.ATLAS_ENV || "").trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (!ATLAS_ENVS.includes(raw)) {
    throw new Error(
      `Invalid ATLAS_ENV="${raw}". Expected development | staging | production.`
    );
  }

  return raw;
}

function extractSupabaseProjectRef(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  if (raw.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    return PRODUCTION_SUPABASE_PROJECT_REF;
  }

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const dbHost = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);

    if (dbHost) {
      return dbHost[1];
    }

    const supabaseHost = host.match(/^([a-z0-9]+)\.supabase\.co$/);

    if (supabaseHost) {
      return supabaseHost[1];
    }

    const user = decodeURIComponent(String(parsed.username || ""));
    const poolerUser = user.match(/^postgres\.([a-z0-9]+)$/i);

    if (poolerUser) {
      return poolerUser[1].toLowerCase();
    }
  } catch {
    const loose = raw.match(/([a-z0-9]{20,})\.supabase\.co/i);

    if (loose) {
      return loose[1].toLowerCase();
    }
  }

  return null;
}

function extractSupabaseProjectRefFromEnv(env = process.env) {
  return (
    extractSupabaseProjectRef(env.SUPABASE_URL) ||
    extractSupabaseProjectRef(env.DATABASE_URL) ||
    null
  );
}

function assertStagingSupabaseIsolation(env = process.env) {
  const atlasEnv = resolveAtlasEnv(env);

  if (atlasEnv !== "staging") {
    return { ok: true, skipped: true, atlasEnv };
  }

  const expectedRef = String(env.ATLAS_EXPECTED_SUPABASE_REF || "")
    .trim()
    .toLowerCase();
  const urlRef = extractSupabaseProjectRef(env.SUPABASE_URL);
  const dbRef = extractSupabaseProjectRef(env.DATABASE_URL);
  const discoveredRefs = [...new Set([urlRef, dbRef].filter(Boolean))];

  if (!expectedRef) {
    throw new Error(
      "Atlas staging startup blocked. ATLAS_EXPECTED_SUPABASE_REF is required when ATLAS_ENV=staging."
    );
  }

  if (expectedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Atlas staging startup blocked. ATLAS_EXPECTED_SUPABASE_REF must not be production ref ${PRODUCTION_SUPABASE_PROJECT_REF}.`
    );
  }

  if (discoveredRefs.length === 0) {
    throw new Error(
      "Atlas staging startup blocked. Could not extract Supabase project ref from SUPABASE_URL or DATABASE_URL."
    );
  }

  if (discoveredRefs.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error(
      `Atlas staging HARD FAIL. Staging must never use production Supabase project ${PRODUCTION_SUPABASE_PROJECT_REF}.`
    );
  }

  const mismatched = discoveredRefs.filter((ref) => ref !== expectedRef);

  if (mismatched.length > 0) {
    throw new Error(
      `Atlas staging startup blocked. Supabase project ref "${mismatched[0]}" does not match ATLAS_EXPECTED_SUPABASE_REF "${expectedRef}".`
    );
  }

  return {
    ok: true,
    skipped: false,
    atlasEnv,
    actualRef: discoveredRefs[0],
    expectedRef
  };
}

module.exports = {
  ATLAS_ENVS,
  PRODUCTION_SUPABASE_PROJECT_REF,
  resolveAtlasEnv,
  extractSupabaseProjectRef,
  extractSupabaseProjectRefFromEnv,
  assertStagingSupabaseIsolation
};
