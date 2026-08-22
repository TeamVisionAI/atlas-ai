/**
 * BR-154 — Single-language Knowledge Hub article experience.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enrichArticleForDisplay,
  isValidAgentLibraryPath,
  normalizeArticlePath
} from "../utils/knowledgeDisplay.js";
import { syncKnowledgeActivityWithCatalog } from "../utils/knowledgeStorage.js";
import { searchKnowledgeFiles } from "../utils/knowledgeSearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeHubSource = fs.readFileSync(
  path.join(__dirname, "../pages/KnowledgeHub.jsx"),
  "utf8"
);
const knowledgeServiceSource = fs.readFileSync(
  path.join(__dirname, "../services/knowledgeService.js"),
  "utf8"
);

const esCatalog = [
  {
    path: "scripts-objection-handling/is-this-sales",
    displayTitle: "¿Es esto ventas? — Cómo responder",
    shortSummary: "Guion breve cuando un prospecto pregunta si la oportunidad es ventas.",
    categoryId: "scripts-objection-handling",
    categoryLabelKey: "knowledgeCategoryScripts",
    keywords: ["objeción de ventas"],
    estimatedReadTime: "3"
  }
];

const enCatalog = [
  {
    path: "scripts-objection-handling/is-this-sales",
    displayTitle: '"Is This Sales?" — How to Respond',
    shortSummary: "A short script when prospects ask whether the opportunity is sales.",
    categoryId: "scripts-objection-handling",
    categoryLabelKey: "knowledgeCategoryScripts",
    keywords: ["sales objection"],
    estimatedReadTime: "3"
  }
];

const tEs = {
  knowledgeHubTitle: "Centro de Conocimiento Atlas",
  knowledgeCategoryScripts: "Guiones y manejo de objeciones",
  knowledgeHubReadTimeMinutes: "{minutes} min de lectura"
};

const tEn = {
  knowledgeHubTitle: "Atlas Knowledge Hub",
  knowledgeCategoryScripts: "Scripts & Objection Handling",
  knowledgeHubReadTimeMinutes: "{minutes} min read"
};

test("BR-154 API client passes locale to tree and document", () => {
  assert.match(knowledgeServiceSource, /fetchKnowledgeTree\(locale/);
  assert.match(knowledgeServiceSource, /fetchKnowledgeDocument\(documentPath, locale/);
  assert.match(knowledgeHubSource, /fetchKnowledgeTree\(hubLocale\)/);
  assert.match(knowledgeHubSource, /fetchKnowledgeDocument\(normalizedPath, hubLocale\)/);
});

test("BR-154 article paths validate without .md suffix", () => {
  assert.equal(
    isValidAgentLibraryPath("scripts-objection-handling/is-this-sales"),
    true
  );
  assert.equal(
    isValidAgentLibraryPath("scripts-objection-handling/is-this-sales.md"),
    true
  );
  assert.equal(isValidAgentLibraryPath("CURRENT_STATE.md"), false);
});

test("BR-154 Spanish article cards use Spanish title and category", () => {
  const enriched = enrichArticleForDisplay(esCatalog[0], tEs, "es-ES");
  assert.match(enriched.displayTitle, /¿Es esto ventas/);
  assert.equal(enriched.categoryLabel, tEs.knowledgeCategoryScripts);
  assert.match(enriched.shortSummary, /prospecto/);
  assert.doesNotMatch(enriched.displayTitle, /\.md/);
});

test("BR-154 English article cards use English title and category", () => {
  const enriched = enrichArticleForDisplay(enCatalog[0], tEn, "en-US");
  assert.match(enriched.displayTitle, /Is This Sales/);
  assert.equal(enriched.categoryLabel, tEn.knowledgeCategoryScripts);
});

test("BR-154 search returns localized title and summary", () => {
  const esResults = searchKnowledgeFiles(esCatalog, "prospecto");
  assert.equal(esResults.length, 1);
  assert.match(esResults[0].displayTitle, /¿Es esto ventas/);

  const enResults = searchKnowledgeFiles(enCatalog, "prospects");
  assert.equal(enResults.length, 1);
  assert.match(enResults[0].displayTitle, /Is This Sales/);
});

test("BR-154 storage migrates legacy .md paths to locale-neutral slug", () => {
  globalThis.localStorage = {
    store: {
      atlas_knowledge_activity_v3: JSON.stringify({
        recentlyOpened: [],
        recentlyViewed: [
          {
            path: "scripts-objection-handling/is-this-sales.md",
            title: "Old English title"
          }
        ],
        pinned: [],
        favorites: [],
        viewCounts: {
          "scripts-objection-handling/is-this-sales.md": 3
        }
      })
    },
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, value) {
      this.store[key] = value;
    },
    removeItem(key) {
      delete this.store[key];
    }
  };

  const state = syncKnowledgeActivityWithCatalog(esCatalog);
  assert.equal(state.recentlyViewed.length, 1);
  assert.equal(
    state.recentlyViewed[0].path,
    "scripts-objection-handling/is-this-sales"
  );
  assert.match(state.recentlyViewed[0].displayTitle, /¿Es esto ventas/);
  assert.equal(
    state.viewCounts["scripts-objection-handling/is-this-sales"],
    3
  );
});

test("BR-154 normalizeArticlePath strips locale suffix from stored paths", () => {
  assert.equal(
    normalizeArticlePath("quick-reference/what-do-i-do-next.es"),
    "quick-reference/what-do-i-do-next"
  );
});
