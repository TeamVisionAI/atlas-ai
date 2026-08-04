/**
 * RC3 — safety gates for applyFiMigration025 (no production DB).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertConfirmationGate,
  assertDatabaseUrl,
  loadMigration025Sql
} = require("../dev/applyFiMigration025");

describe("applyFiMigration025 safety gates", () => {
  it("rejects when confirmation flag is absent", () => {
    assert.throws(
      () => assertConfirmationGate({}),
      (error) =>
        error.code === "FI_MIGRATION_CONFIRMATION_REQUIRED" &&
        /verified backup/i.test(error.message)
    );
  });

  it("rejects when confirmation flag is incorrect", () => {
    assert.throws(
      () => assertConfirmationGate({ CONFIRM_FI_MIGRATION_025: "true" }),
      (error) => error.code === "FI_MIGRATION_CONFIRMATION_REQUIRED"
    );
  });

  it("accepts exact confirmation value yes", () => {
    assert.doesNotThrow(() =>
      assertConfirmationGate({ CONFIRM_FI_MIGRATION_025: "yes" })
    );
  });

  it("rejects missing DATABASE_URL", () => {
    assert.throws(
      () => assertDatabaseUrl({ CONFIRM_FI_MIGRATION_025: "yes" }),
      (error) => error.code === "FI_MIGRATION_DATABASE_URL_MISSING"
    );
  });

  it("loads only migration 025 SQL and does not include down migration", () => {
    const sql = loadMigration025Sql();
    assert.match(sql, /atlas_fi_strategy_evaluations/);
    assert.doesNotMatch(sql, /DROP TABLE IF EXISTS atlas_fi_strategy_evaluations/);
  });
});
