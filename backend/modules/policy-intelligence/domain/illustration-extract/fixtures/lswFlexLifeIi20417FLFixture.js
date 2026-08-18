/**
 * Anonymized LSW FlexLife II (20417FL) ledger fixture.
 * Column shapes follow National Life pages; not a client PDF and contains no PII.
 */

function identityHeader() {
  return `
Life Insurance Company of the Southwest, Addison, Texas.
FlexLife II Indexed Universal Life, 2017 Series II
Form Series 20417FL
`;
}

function guaranteedPages() {
  const header = `${identityHeader()}
FlexLife II
Ledger
This illustration of FlexLife II values assumes payments are made in the amounts shown and that the Guaranteed
Illustrated Rate and maximum monthly deductions will continue in the future. The interest rate used in the calculation of
guaranteed values is 2.50%. The annual floor is 0%.
Guaranteed Illustrated Rate Illustrated Loan Rate: 4.40%
Policy Year Age Planned Annualized Premium Planned Annual Income Planned Annual Loan Accumulated Loan
Accumulated Value Cash Surrender Value Net Death Benefit
`;

  return [
    {
      page: 19,
      text: `${header}
1 35 $2,991.53 $0 $0 $0 $1,631 $0 $294,631
2 36 2,991.53 0 0 0 3,282 0 296,282
3 37 2,991.53 0 0 0 4,954 281 297,954
4 38 2,991.53 0 0 0 6,638 2,381 299,638
5 39 2,991.53 0 0 0 8,336 4,507 301,336
Page 19 of 30
`
    },
    {
      page: 20,
      text: `${header}
6 40 2,991.53 0 0 0 10,046 6,814 303,046
33 67 0.00 7,370 8,129 18,300 Lapse Lapse Lapse
The policy as shown using the Guaranteed Illustrated Rate will lapse in policy year 33 unless a higher premium is paid.
Page 20 of 30
`
    }
  ];
}

function dualPages() {
  const header = `${identityHeader()}
FlexLife II
Ledger
Alternative Current Illustrated Rate* Current Illustrated Rate*
Illustrated Loan Rate: 4.40% Illustrated Loan Rate: 5.88%
Policy Year Age Planned Annualized Premium Planned Annual Income
Weighted Average Interest Rate Accumulated Value Cash Surrender Value Death Benefit
Weighted Average Interest Rate Accumulated Value Cash Surrender Value Death Benefit
`;

  return [
    {
      page: 21,
      text: `${header}
1 35 $2,991.53 $0 3.00 % $1,896 $0 $294,896 5.52 % $1,921 $0 $294,921
2 36 2,991.53 0 3.00 % 3,815 0 296,815 6.05 % 3,930 0 296,930
3 37 2,991.53 0 3.00 % 5,770 1,097 298,770 6.28 % 6,048 1,375 299,048
4 38 2,991.53 0 3.00 % 7,768 3,510 300,768 6.42 % 8,292 4,035 301,292
5 39 2,991.53 0 3.00 % 9,814 5,985 302,814 6.51 % 10,677 6,848 303,677
10 44 2,991.53 0 3.00 % 20,579 19,897 313,579 6.68 % 24,793 24,110 317,793
20 54 2,991.53 0 3.00 % 54,192 54,192 347,192 6.83 % 82,512 82,512 375,512
Page 21 of 30
`
    },
    {
      page: 22,
      text: `${header}
36 70 0.00 17,265 Lapse Lapse Lapse Lapse 6.83 % 270,705 167,905 391,294
The policy as shown using the Alternative Current Illustrated Rate will lapse in policy year 36 unless a higher premium is paid.
Page 22 of 30
`
    }
  ];
}

function distributionsPages() {
  const header = `${identityHeader()}
FlexLife II
Distributions Ledger
Current Illustrated Rate* Illustrated Loan Rate: 5.88%
Policy Year Age Planned Annualized Premium Planned Annual Income Planned Annual Loan Accumulated Loan
Weighted Average Interest Rate Accumulated Value Cash Surrender Value Death Benefit
`;

  return [
    {
      page: 25,
      text: `${header}
1 35 $2,991.53 $0 $0 $0 5.52 % $1,921 $0 $294,921
2 36 2,991.53 0 0 0 6.05 % 3,930 0 296,930
5 39 2,991.53 0 0 0 6.51 % 10,677 6,848 303,677
10 44 2,991.53 0 0 0 6.68 % 24,793 24,110 317,793
20 54 2,991.53 0 0 0 6.83 % 82,512 82,512 375,512
86 120 0.00 17,265 377,676 6,889,734 6.88 % 8,760,818 1,871,085 1,871,085
Page 25 of 30
`
    }
  ];
}

function riderAndChargePages() {
  return [
    {
      page: 6,
      text: `${identityHeader()}
You can accelerate up to 100% of the death benefit, subject to an ABR Benefit limit of $1,500,000 for terminal and chronic
illness and an ABR Benefit limit of $1,000,000 for critical illness and critical injury on the total death benefit accelerated under
all policies on the life of the insured. For chronic illness, the death benefit you can accelerate is subject to a monthly limit to the
lesser of 2% of the discounted death benefit or $30,000. The death benefit will be reduced by the amount of the death benefit
you decide to accelerate. A discount factor will be applied to the death benefit accelerated because it is being paid prior to the
actual death benefit. As a result, the actual benefit paid will be less than the amount of death benefit accelerated.
The sample benefits shown assume current accelerated benefits mortality tables and interest at 6.5%. The benefits and values
Accelerated Benefits Riders are optional, available with no additional premium, and may not be available in all states.
`
    },
    {
      page: 7,
      text: `${identityHeader()}
A surrender charge is assessed on full surrender of a policy in the first ten policy years from the date of issue or the date
of an increase in face amount.
The Accumulated Value Enhancement Rider [Form Series 20430FL], provides FlexLife II with an annual Accumulated
Value Enhancement. The rates for the Percent of Premium Expense Charge, Monthly Cost of Insurance, Monthly Expense Charge, Monthly
Policy Fee, Monthly Percent of Accumulated Value Charge and Rider Charge, if any, will be determined by the Company.
`
    },
    {
      page: 9,
      text: `${identityHeader()}
Accelerated Benefits Rider (ABR) [Form Series 8052FL], if the insured is diagnosed by a physician as having a terminal
illness expected to result in death in 24 months or less.
Accelerated Benefits Rider (ABR) [Form Series 8095FL], if the insured is unable to perform 2 of 6 activities of daily living
or has a severe cognitive impairment.
Accelerated Benefits Rider (ABR) [Form Series 20287FL], covered conditions include cancer, heart attack, stroke.
Accelerated Benefits Rider (ABR) [Form Series 20288FL], covered conditions include coma, paralysis, severe burns.
right to change these limits in the future, however the limit will never be less than $500,000. The maximum death benefit
that may be accelerated under chronic illness in any year is the lesser of 24% of the death benefit in effect on the initial
election date or $360,000.
`
    },
    {
      page: 10,
      text: `${identityHeader()}
Charitable Matching Gift Death Benefit Rider (CMG) [Form Series 20186FL], provides up to $5,860 of the base face
amount will be matched by National Life Group if a charitable beneficiary is named.
Death Benefit Protection Rider (DBPR) [Form Series 20223FL], provides that the policy will not lapse in the first 25
policy years even if the net cash surrender value is less than or equal to zero provided that premiums paid reduced by
withdrawals meet the Monthly Guarantee Premium.
Interest Crediting Strategies Rider (ICSR) [Form Series 20256FL, 20257FL, 20258FL, 20259FL, 20260FL, 20432FL],
provides FlexLife II with Basic Strategies, a Fixed-Term Strategy and Multiple Indexed Strategies.
Lifetime Income Benefit Rider (LIBR) [Form Series 20266FL]. The Lifetime Income Benefit Rider provides a benefit for
the life of the insured in exchange for a charge from the accumulated value and provided that certain conditions are met.
Overloan Protection Rider (OPR) [Form Series 8315], when exercised under certain conditions, will prevent the policy
from lapsing. There is no premium for this rider, however, there is a fee when the rider is exercised.
Systematic Allocation Rider (SAR) [Form Series 20431], allows Net Premiums in excess of the Basic Strategy Minimum
Value to be transferred to a systematic allocation account.
`
    },
    {
      page: 17,
      text: `${identityHeader()}
FlexLife II Indexed Universal Life insurance has a 10 year declining surrender charge. Surrender charges may reduce the
`
    },
    {
      page: 18,
      text: `${identityHeader()}
policy's cash value in early years. The policy's cash surrender value is the accumulated value less the surrender charges
less any debt due to policy loans.
`
    }
  ];
}

function lswFlexLifeIi20417FLPages() {
  return [...riderAndChargePages(), ...guaranteedPages(), ...dualPages(), ...distributionsPages()];
}

module.exports = {
  lswFlexLifeIi20417FLPages
};
