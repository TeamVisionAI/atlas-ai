/**
 * BR-153 — Knowledge Hub field UX polish + legacy storage cleanup.
 */

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildArticleMetadata, titleCaseFromFilename } = require("../core/knowledgeHubArticleMetadata");
const { getKnowledgeTree, getKnowledgeDocument } = require("../core/knowledgeHubService");
const { KNOWLEDGE_HUB_CATEGORIES } = require("../core/knowledgeHubCategories");

test("BR-153 displayTitle metadata preferred over filename", () => {
  const metadata = buildArticleMetadata({
    meta: {
      displayTitle: '"Is This Sales?" — How to Respond',
      shortSummary: "Short script for sales objection."
    },
    body: "# Is This Sales?",
    filename: "is-this-sales.md",
    category: KNOWLEDGE_HUB_CATEGORIES[0]
  });
  assert.equal(metadata.displayTitle, '"Is This Sales?" — How to Respond');
  assert.match(metadata.shortSummary, /Short script/);
  assert.equal(metadata.categoryId, "scripts-objection-handling");
});

test("BR-153 fallback title derives from filename without .md", () => {
  const metadata = buildArticleMetadata({
    meta: {},
    body: "",
    filename: "quick-capture-basics.md",
    category: null
  });
  assert.equal(metadata.displayTitle, titleCaseFromFilename("quick-capture-basics.md"));
  assert.doesNotMatch(metadata.displayTitle, /\.md/i);
});

test("BR-153 starter articles expose human-friendly displayTitle", () => {
  const tree = getKnowledgeTree({ locale: "en" });
  for (const file of tree.files) {
    assert.ok(file.displayTitle, `${file.path} displayTitle`);
    assert.ok(file.shortSummary, `${file.path} shortSummary`);
    assert.doesNotMatch(file.displayTitle, /\.md/i);
    assert.doesNotMatch(file.displayTitle, /scripts-objection-handling/i);
  }
});

test("BR-153 document API returns display metadata", () => {
  const doc = getKnowledgeDocument("scripts-objection-handling/is-this-sales", { locale: "en" });
  assert.match(doc.displayTitle, /Is This Sales/);
  assert.ok(doc.shortSummary);
  assert.ok(doc.estimatedReadTime);
});

test("BR-153 agent-library paths only in tree", () => {
  const tree = getKnowledgeTree({ locale: "en" });
  for (const file of tree.files) {
    assert.match(file.path, /^[a-z0-9-]+\/[a-z0-9-]+$/);
    assert.ok(!file.path.startsWith("00-"));
    assert.notEqual(file.path, "CURRENT_STATE.md");
  }
});

test("BR-153 starter markdown frontmatter present on disk", () => {
  const sample = fs.readFileSync(
    path.join(__dirname, "../../docs/agent-library/scripts-objection-handling/is-this-sales.en.md"),
    "utf8"
  );
  assert.match(sample, /displayTitle:/);
  assert.match(sample, /shortSummary:/);
  assert.match(sample, /categoryId:/);
});
