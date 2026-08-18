/**
 * Policy Cost + Living Benefit Economics (BR-144).
 */

const classifications = require("./classifications");
const provenance = require("./provenance");
const classifiedValue = require("./classifiedValue");
const { POLICY_COST_CATEGORIES, POLICY_COST_CATEGORY_ORDER } = require("./policyCostCategories");
const { createEmptyPolicyCostTerms, overlayAnnualByYear } = require("./policyCostTerms");
const {
  RIDER_CATEGORIES,
  createRiderEconomics,
  resolveAcceleratedBenefitPayout
} = require("./riderEconomics");
const {
  buildPolicyCostCheckpoints,
  buildPolicyCostCategoryCards,
  buildLivingBenefitCard,
  buildLivingBenefitCards,
  buildPolicyEconomicsReportDto
} = require("./reportDtos");

module.exports = {
  ...classifications,
  ...provenance,
  ...classifiedValue,
  POLICY_COST_CATEGORIES,
  POLICY_COST_CATEGORY_ORDER,
  createEmptyPolicyCostTerms,
  overlayAnnualByYear,
  RIDER_CATEGORIES,
  createRiderEconomics,
  resolveAcceleratedBenefitPayout,
  buildPolicyCostCheckpoints,
  buildPolicyCostCategoryCards,
  buildLivingBenefitCard,
  buildLivingBenefitCards,
  buildPolicyEconomicsReportDto
};
