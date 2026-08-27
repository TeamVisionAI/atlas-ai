import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("BR-161 Apple Calendar copy avoids CalDAV and states read-only", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../i18n/translations.js"),
    "utf8"
  );
  assert.match(source, /Apple Calendar \/ iCloud/);
  assert.match(source, /iPhone/);
  assert.match(source, /does not add or edit Apple Calendar events yet/);
  assert.doesNotMatch(source, /CalDAV/);
});
