require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const repoPath = require.resolve("../repositories/appointmentRepository");
const readinessPath = require.resolve("../core/productionReadiness");
const supabaseServicePath = require.resolve("../services/supabaseService");

const MISSING_TABLE_ERROR = {
  code: "PGRST205",
  message: "Could not find the table 'public.atlas_appointments' in the schema cache"
};

function withEnv(overrides, runner) {
  const original = {};

  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return runner().finally(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function mockMissingAppointmentsTable() {
  const originalSupabaseModule = require(supabaseServicePath);

  require.cache[supabaseServicePath].exports = {
    ...originalSupabaseModule,
    supabase: {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({ data: null, error: MISSING_TABLE_ERROR });
              },
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({ data: null, error: MISSING_TABLE_ERROR });
              }
            };
          }
        };
      }
    }
  };

  delete require.cache[repoPath];
  return require(repoPath);
}

function restoreSupabaseModule() {
  delete require.cache[supabaseServicePath];
  delete require.cache[repoPath];
  require(supabaseServicePath);
  require(repoPath);
}

test("production readiness fails when atlas_appointments PostgREST probe is unavailable", async () => {
  mockMissingAppointmentsTable();

  delete require.cache[readinessPath];
  const { evaluateProductionReadiness } = require(readinessPath);

  const report = await evaluateProductionReadiness();
  const appointmentCheck = report.checks.find((check) => check.id === "atlas_appointments");

  assert.ok(appointmentCheck, "atlas_appointments check missing from report");
  assert.equal(appointmentCheck.ok, false);
  assert.match(appointmentCheck.detail, /missing|schema cache/i);
  assert.ok(report.mvpBlockers.includes("atlas_appointments"));
  assert.equal(report.mvpReady, false);

  restoreSupabaseModule();
  delete require.cache[readinessPath];
});

test("production appointment reads and writes require Supabase table", async () => {
  const repo = mockMissingAppointmentsTable();

  await withEnv({ NODE_ENV: "production" }, async () => {
    await assert.rejects(
      () => repo.save({ id: "00000000-0000-4000-8000-000000000001", organizationId: "org" }),
      /atlas_appointments table is required in production/
    );

    await assert.rejects(
      () => repo.findById("00000000-0000-4000-8000-000000000001", "org"),
      /atlas_appointments table is required in production/
    );

    await assert.rejects(
      () => repo.search({ organizationId: "org" }),
      /atlas_appointments table is required in production/
    );
  });

  restoreSupabaseModule();
});

test("development may still use JSON fallback when Supabase table is unavailable", async () => {
  const repo = mockMissingAppointmentsTable();

  await withEnv({ NODE_ENV: "development" }, async () => {
    const result = await repo.search({});
    assert.ok(Array.isArray(result.items));
    assert.ok(typeof result.total === "number");
  });

  restoreSupabaseModule();
});
