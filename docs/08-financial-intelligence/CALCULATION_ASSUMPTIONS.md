# Financial Intelligence — Calculation Assumptions (RC3)

## Invest-the-Difference Strategy Evaluation

```text
totalProposedMonthlyOutlay = currentIulMonthlyPremium
proposedTermDeathBenefit = currentIulDeathBenefit
unboundedPremiumDifference = currentIulMonthlyPremium - proposedTermMonthlyPremium
monthlyInvestmentDifference = max(0, unboundedPremiumDifference)
proposedMutualFundContribution = monthlyInvestmentDifference
```

Validation (currency tolerance `$0.02`):

```text
proposedTermMonthlyPremium + proposedMutualFundContribution ≈ totalProposedMonthlyOutlay
```

Atlas does not silently raise monthly outlay. Overrides require a documented reason and create a new evaluation version.

## Educational projection scenarios

| Scenario | Illustrative annual return |
|----------|----------------------------|
| Conservative | 4% |
| Moderate Growth | 7% |
| Aggressive Growth | 10% |

Methodology: future value of an ordinary annuity with monthly contributions and monthly compounding.

Labels required on every surface: **Hypothetical · Educational · Non-guaranteed**.

Fee methodology (RC3): figures are **before** investment fees, expenses, taxes, and inflation unless separately disclosed.

Outputs returned separately:

- Total client contributions
- Illustrative growth
- Illustrative ending value

Investment projection horizon is representative-entered and must remain distinct from term duration.
