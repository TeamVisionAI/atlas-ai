/**
 * Synthetic Nationwide COI table fixture (not Test-1).
 * Proves EXTRACTED/CALCULATED annual COI without inventing from AV−CSV.
 */

function nationwideExplicitMonthlyCoiPages() {
  return [
    {
      page: 12,
      text: `
Nationwide IUL Protector II
Cost of Insurance
Policy Year Monthly COI
1 $12.00
2 $13.50
10 $20.00
page 12 of 20
`
    }
  ];
}

function nationwideAvMinusCsvIsNotCoiPages() {
  return [
    {
      page: 22,
      text: `
Nationwide IUL Accumulated Value Protector
End of Year  Age  Premium Outlay  Accumulated Value  Net Surrender Value  Death Benefit
1 55 2,076 5,000 1,000 100,000
page 22 of 34
`
    }
  ];
}

module.exports = {
  nationwideExplicitMonthlyCoiPages,
  nationwideAvMinusCsvIsNotCoiPages
};
