/**
 * BR-154 — Knowledge Hub single-language article experience.
 */

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getKnowledgeTree, getKnowledgeDocument } = require("../core/knowledgeHubService");
const {
  normalizeKnowledgeLocale,
  normalizeArticlePath,
  parseLocalizedFilename
} = require("../core/knowledgeHubLocales");
const { KNOWLEDGE_HUB_CATEGORIES } = require("../core/knowledgeHubCategories");

test("BR-154 locale filenames parse en/es variants", () => {
  assert.deepEqual(parseLocalizedFilename("is-this-sales.en.md"), {
    slug: "is-this-sales",
    locale: "en"
  });
  assert.deepEqual(parseLocalizedFilename("is-this-sales.es.md"), {
    slug: "is-this-sales",
    locale: "es"
  });
});

test("BR-154 article paths are locale-neutral slugs", () => {
  assert.equal(
    normalizeArticlePath("scripts-objection-handling/is-this-sales.md"),
    "scripts-objection-handling/is-this-sales"
  );
  assert.equal(
    normalizeArticlePath("scripts-objection-handling/is-this-sales.en.md"),
    "scripts-objection-handling/is-this-sales"
  );
});

test("BR-154 Spanish tree returns six Spanish starter articles", () => {
  const tree = getKnowledgeTree({ locale: "es" });
  assert.equal(tree.locale, "es");
  assert.equal(tree.files.length, 6);
  for (const file of tree.files) {
    assert.match(file.path, /^[a-z0-9-]+\/[a-z0-9-]+$/);
    assert.doesNotMatch(file.path, /\.md$/i);
    assert.ok(file.displayTitle);
    assert.ok(file.shortSummary);
    assert.doesNotMatch(file.displayTitle, /\.md/i);
  }
});

test("BR-154 English tree returns six English starter articles", () => {
  const tree = getKnowledgeTree({ locale: "en" });
  assert.equal(tree.locale, "en");
  assert.equal(tree.files.length, 6);
  const titles = tree.files.map((file) => file.displayTitle).join(" ");
  assert.match(titles, /Is This Sales|Quick Capture|What Do I Do Next/i);
});

test("BR-154 Spanish titles and summaries are Spanish", () => {
  const tree = getKnowledgeTree({ locale: "es" });
  const titles = tree.files.map((file) => file.displayTitle).join(" ");
  const summaries = tree.files.map((file) => file.shortSummary).join(" ");
  assert.match(titles, /¿Es esto ventas|¿Qué hago ahora|Quick Capture/i);
  assert.match(summaries, /prospecto|guion|lista/i);
  assert.doesNotMatch(titles, /Is This Sales\?/);
});

test("BR-154 document API serves locale-specific body without mixing", () => {
  const enDoc = getKnowledgeDocument("scripts-objection-handling/is-this-sales", { locale: "en" });
  const esDoc = getKnowledgeDocument("scripts-objection-handling/is-this-sales", { locale: "es" });
  assert.match(enDoc.displayTitle, /Is This Sales/);
  assert.match(esDoc.displayTitle, /¿Es esto ventas/);
  assert.match(enDoc.content, /Use this as a starting script/);
  assert.match(esDoc.content, /Usa esto como guion inicial/);
  assert.equal(enDoc.path, "scripts-objection-handling/is-this-sales");
  assert.equal(esDoc.path, "scripts-objection-handling/is-this-sales");
});

test("BR-154 missing article returns 404 (no hybrid fallback)", () => {
  assert.throws(
    () => getKnowledgeDocument("scripts-objection-handling/does-not-exist", { locale: "es" }),
    (error) => error.statusCode === 404
  );
});

test("BR-154 each category has en and es starter files on disk", () => {
  const root = path.join(__dirname, "../../docs/agent-library");
  for (const category of KNOWLEDGE_HUB_CATEGORIES) {
    const dir = path.join(root, category.folder);
    const names = fs.readdirSync(dir).filter((name) => name.endsWith(".md"));
    const enFiles = names.filter((name) => name.endsWith(".en.md"));
    const esFiles = names.filter((name) => name.endsWith(".es.md"));
    assert.ok(enFiles.length >= 1, `${category.folder} has English variant`);
    assert.ok(esFiles.length >= 1, `${category.folder} has Spanish variant`);
  }
});

test("BR-154 normalizeKnowledgeLocale resolves es variants", () => {
  assert.equal(normalizeKnowledgeLocale("es"), "es");
  assert.equal(normalizeKnowledgeLocale("es-ES"), "es");
  assert.equal(normalizeKnowledgeLocale("en"), "en");
  assert.equal(normalizeKnowledgeLocale(""), "en");
});
