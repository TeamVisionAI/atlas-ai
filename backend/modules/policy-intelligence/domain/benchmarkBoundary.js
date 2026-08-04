/**
 * Benchmark engine boundary (BR-054).
 * Benchmarks operate only on anonymous insurance characteristics.
 */

const { toIntelligencePayload } = require("./PolicyExtractionModel");

function toBenchmarkFeatures(extractedData) {
  const data = toIntelligencePayload(extractedData);

  return {
    boundary: "benchmark_engine",
    piiAllowed: false,
    features: {
      carrier: data.carrier,
      productType: data.productType || data.product,
      gender: data.insured?.gender ?? null,
      issueAge: data.insured?.issueAge ?? null,
      underwritingClass: data.insured?.underwritingClass ?? null,
      tobaccoStatus: data.insured?.tobaccoStatus ?? null,
      premiumAmount: data.premium?.amount ?? null,
      premiumFrequency: data.premium?.frequency ?? null,
      faceAmount: data.faceAmount,
      riderTypes: (data.riders || []).map((rider) => rider.type).filter(Boolean),
      coverageTypes: (data.coverages || []).map((coverage) => coverage.type).filter(Boolean),
      indexNames: (data.indexes || []).map((index) => index.name).filter(Boolean)
    }
  };
}

module.exports = {
  toBenchmarkFeatures
};
