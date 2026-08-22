/**
 * BR-152 — Agent reference library categories (mirrors backend/core/knowledgeHubCategories.js).
 */

export const KNOWLEDGE_HUB_CATEGORIES = Object.freeze([
  {
    id: "scripts-objection-handling",
    folder: "scripts-objection-handling",
    labelKey: "knowledgeCategoryScripts",
    descriptionKey: "knowledgeCategoryScriptsDesc",
    order: 1
  },
  {
    id: "recruiting-talking-points",
    folder: "recruiting-talking-points",
    labelKey: "knowledgeCategoryRecruiting",
    descriptionKey: "knowledgeCategoryRecruitingDesc",
    order: 2
  },
  {
    id: "licensing-guidance",
    folder: "licensing-guidance",
    labelKey: "knowledgeCategoryLicensing",
    descriptionKey: "knowledgeCategoryLicensingDesc",
    order: 3
  },
  {
    id: "product-training",
    folder: "product-training",
    labelKey: "knowledgeCategoryProduct",
    descriptionKey: "knowledgeCategoryProductDesc",
    order: 4
  },
  {
    id: "internal-procedures",
    folder: "internal-procedures",
    labelKey: "knowledgeCategoryProcedures",
    descriptionKey: "knowledgeCategoryProceduresDesc",
    order: 5
  },
  {
    id: "quick-reference",
    folder: "quick-reference",
    labelKey: "knowledgeCategoryQuickRef",
    descriptionKey: "knowledgeCategoryQuickRefDesc",
    order: 6
  }
]);

export const KNOWLEDGE_CATEGORY_BY_ID = Object.freeze(
  Object.fromEntries(KNOWLEDGE_HUB_CATEGORIES.map((category) => [category.id, category]))
);
