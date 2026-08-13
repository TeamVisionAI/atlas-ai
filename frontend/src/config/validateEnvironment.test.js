import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isStagingUi } from "./atlasUiEnv.js";
import { resolveApiBaseUrl } from "./apiBaseUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("validateEnvironment.js fail-closes staging before production warnings", () => {
  const source = fs.readFileSync(path.join(__dirname, "validateEnvironment.js"), "utf8");
  assert.match(source, /validateStagingEnvironment/);
  assert.match(source, /resolveApiBaseUrl/);
  assert.match(source, /isStagingUi/);
});

test("validateStagingEnvironment no-ops outside staging", () => {
  assert.equal(isStagingUi({}), false);
  assert.doesNotThrow(() => resolveApiBaseUrl({ DEV: false }));
});

test("validateStagingEnvironment fails closed without staging API URL", () => {
  assert.equal(isStagingUi({ VITE_ATLAS_ENV: "staging" }), true);
  assert.throws(
    () =>
      resolveApiBaseUrl({
        DEV: false,
        VITE_ATLAS_ENV: "staging"
      }),
    /requires VITE_API_BASE_URL/
  );
});
