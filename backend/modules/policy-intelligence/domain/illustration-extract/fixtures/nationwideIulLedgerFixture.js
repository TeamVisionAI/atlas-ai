/**
 * Anonymized Nationwide-style IUL ledger fixture (BR-060).
 * Numbers follow a typical dual-column non-guaranteed illustration.
 * Not a client PDF and contains no PII.
 */

function nationwideIllustratedPages() {
  const header = `
Nationwide IUL Accumulated Value Protector
Specified Amount: $100,000
Death benefit Option 1 (Level)
Planned Premium: $173.00 Monthly
Non-Guaranteed - Current   Non-Guaranteed - Assumed
Assumed Interest
End of Year  Age  Premium Outlay  Accumulated Value  Net Surrender Value  Death Benefit
`;

  const page22 = `${header}
1 55 2,076 1,422 0 100,000 1,422 0 100,000
2 56 2,076 2,950 270 100,000 2,996 316 100,000
3 57 2,076 4,487 1,807 100,000 4,644 1,964 100,000
4 58 2,076 6,041 3,361 100,000 6,378 3,698 100,000
5 59 2,076 7,608 5,152 100,000 8,202 5,745 100,000
6 60 2,076 9,196 6,963 100,000 10,125 7,892 100,000
7 61 2,076 10,801 8,791 100,000 12,153 10,143 100,000
8 62 2,076 12,424 10,638 100,000 14,290 12,503 100,000
9 63 2,076 14,061 12,498 100,000 16,539 14,976 100,000
10 64 2,076 15,710 14,370 100,000 18,907 17,567 100,000
page 22 of 34
`;

  const page23 = `${header}
11 65 2,076 17,375 16,258 100,000 21,402 20,286 100,000
12 66 2,076 19,054 18,160 100,000 24,033 23,140 100,000
13 67 2,076 20,744 20,074 100,000 26,804 26,134 100,000
14 68 2,076 22,440 21,993 100,000 29,722 29,275 100,000
15 69 2,076 24,139 23,916 100,000 32,791 32,568 100,000
16 70 0 24,154 24,154 100,000 34,334 34,334 100,000
17 71 0 24,136 24,136 100,000 35,953 35,953 100,000
18 72 0 24,071 24,071 100,000 37,637 37,637 100,000
19 73 0 23,950 23,950 100,000 39,383 39,383 100,000
20 74 0 23,761 23,761 100,000 41,190 41,190 100,000
page 23 of 34
`;

  const guaranteed = `
Guaranteed
End of Year Age Premium Outlay Accumulated Value Net Surrender Value Death Benefit
1 55 2,076 297 0 100,000
2 56 2,076 555 0 100,000
3 57 2,076 767 0 100,000
4 58 2,076 930 0 100,000
5 59 2,076 1,039 0 100,000
6 60 2,076 1,094 0 100,000
7 61 2,076 1,091 0 100,000
8 62 2,076 1,026 0 100,000
9 63 2,076 889 0 100,000
10 64 2,076 678 0 100,000
page 20 of 34
`;

  const summary = `
End of Year Age Premium Accumulated Value Death Benefit
5 59 10,380 0 100,000 1,908 100,000 5,745 100,000
10 64 20,760 0 100,000 7,112 100,000 17,567 100,000
16 70 31,140 0 100,000 10,714 100,000 34,334 100,000
20 74 31,140 0 100,000 4,577 100,000 41,190 100,000
page 18 of 34
`;

  const surrender = `
Table of Surrender Charges
Policy Year Surrender Charge
1 $2,680.00
2 $2,680.00
5 $2,456.76
10 $1,786.76
16 $0.00
page 13 of 34
`;

  const riders = `
Living Benefit for Terminal Illness
The maximum amount of the accelerated death benefit cannot exceed 50% of the base policy
death benefit. The accelerated death benefit payment must be at least $10,000 and shall not exceed $250,000.
There is no upfront charge for this rider; however, charges and adjustments will apply at the time a claim is paid.
The remaining death benefit, after acceleration of the death benefit, must be at the policy minimum.

Chronic Illness Rider
An administrative charge of up to $250 dollars is deducted from the benefit payment.
The Specified Amount and other policy values are reduced each time an accelerated death benefit payment is made.
The reduction in the Specified Amount will be more than one dollar for each dollar of benefit received based on
factors that exist at the time of claim including interest rates and age of insured at the time of claim.

Critical Illness Rider
The maximum annual benefit is the lesser of 10% of the specified amount or $25,000 per event and is paid as
described in the rider when the Insured is diagnosed with any of the following as described in the rider.
page 15 of 34
`;

  return [
    { page: 13, text: surrender },
    { page: 15, text: riders },
    { page: 18, text: summary },
    { page: 20, text: guaranteed },
    { page: 22, text: page22 },
    { page: 23, text: page23 }
  ];
}

module.exports = {
  nationwideIllustratedPages
};
