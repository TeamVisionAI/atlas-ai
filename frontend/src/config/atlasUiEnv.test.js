import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isStagingUi, resolveAtlasUiEnv } from "./atlasUiEnv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("staging UI flag is explicit and never implied by production", () => {
  assert.equal(resolveAtlasUiEnv({}), "");
  assert.equal(isStagingUi({}), false);
  assert.equal(isStagingUi({ VITE_ATLAS_ENV: "production" }), false);
  assert.equal(isStagingUi({ VITE_ATLAS_ENV: "staging" }), true);
  assert.equal(isStagingUi({ VITE_ATLAS_ENV: "STAGING" }), true);
});

test("authenticated layout shows STAGING banner only via isStagingUi", () => {
  const layout = fs.readFileSync(
    path.join(__dirname, "../layouts/MainLayout.jsx"),
    "utf8"
  );
  const css = fs.readFileSync(
    path.join(__dirname, "../layouts/MainLayout.css"),
    "utf8"
  );

  assert.match(layout, /isStagingUi/);
  assert.match(layout, /atlas-layout__staging-banner/);
  assert.match(layout, /data-atlas-env="staging"/);
  assert.match(layout, /STAGING/);
  assert.match(css, /\.atlas-layout__staging-banner/);
});
