/**
 * The 7 IUL policy cost categories (BR-144).
 */

const POLICY_COST_CATEGORIES = Object.freeze({
  PERCENT_OF_PREMIUM_EXPENSE_CHARGE: Object.freeze({
    id: "percent_of_premium_expense_charge",
    label: "Percent of Premium Expense Charge",
    number: 1
  }),
  COST_OF_INSURANCE: Object.freeze({
    id: "cost_of_insurance",
    label: "Cost of Insurance / Monthly COI",
    number: 2
  }),
  MONTHLY_EXPENSE_CHARGE: Object.freeze({
    id: "monthly_expense_charge",
    label: "Monthly Expense Charge",
    number: 3
  }),
  MONTHLY_POLICY_FEE: Object.freeze({
    id: "monthly_policy_fee",
    label: "Monthly Policy Fee",
    number: 4
  }),
  MONTHLY_PERCENT_OF_ACCUMULATED_VALUE: Object.freeze({
    id: "monthly_percent_of_accumulated_value",
    label: "Monthly % of Accumulated Value Charge",
    number: 5
  }),
  RIDER_CHARGES: Object.freeze({
    id: "rider_charges",
    label: "Rider Charges",
    number: 6
  }),
  SURRENDER_CHARGES: Object.freeze({
    id: "surrender_charges",
    label: "Surrender Charges",
    number: 7
  })
});

const POLICY_COST_CATEGORY_ORDER = Object.freeze(Object.values(POLICY_COST_CATEGORIES));

module.exports = {
  POLICY_COST_CATEGORIES,
  POLICY_COST_CATEGORY_ORDER
};
