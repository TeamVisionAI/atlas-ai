/**
 * Regression — Knowledge Hub and similar pages require `t` from useLanguage().
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "LanguageContext.jsx"), "utf8");

test("LanguageContext returns t translation catalog", () => {
  assert.match(source, /const catalog = translations\[language\]/);
  assert.match(source, /\bt:\s*catalog/);
});
