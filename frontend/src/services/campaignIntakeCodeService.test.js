import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceSource = fs.readFileSync(path.join(__dirname, "campaignIntakeCodeService.js"), "utf8");

test("createCampaignIntakeCode sends JSON Content-Type so Express parses campaignName", () => {
  assert.match(serviceSource, /createCampaignIntakeCode/);
  assert.match(serviceSource, /["']Content-Type["']\s*:\s*["']application\/json["']/);
  assert.match(serviceSource, /JSON\.stringify\(payload\)/);
  assert.match(serviceSource, /campaign-intake-codes/);
});
