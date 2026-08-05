/**
 * RC4 M1.1 — Financial Intelligence educational report presentation dictionary.
 * Presentation only. Does not recalculate or mutate evaluation data.
 */

export const FI_REPORT_LOCALES = Object.freeze({
  en: "en-US",
  es: "es-US"
});

const STATUS_KEYS = Object.freeze({
  DRAFT_MISSING_POLICY_DATA: "fiStatusMissingPolicyData",
  DRAFT_TERM_QUOTE_REQUIRED: "fiStatusTermQuoteRequired",
  DRAFT_TERM_CONFIRMATION_REQUIRED: "fiStatusTermConfirmationRequired",
  DRAFT_INVESTMENT_HORIZON_REQUIRED: "fiStatusInvestmentHorizonRequired",
  DRAFT_RISK_PROFILE_REQUIRED: "fiStatusRiskProfileRequired",
  DRAFT_REPLACEMENT_REVIEW_REQUIRED: "fiStatusReplacementReviewRequired",
  READY_FOR_REPRESENTATIVE_REVIEW: "fiStatusReadyForReview",
  REPRESENTATIVE_ADJUSTED: "fiStatusRepresentativeAdjusted",
  CLIENT_DISCUSSION_VERSION: "fiStatusClientDiscussion",
  SUPERSEDED: "fiStatusSuperseded"
});

const SCENARIO_LABEL_KEYS = Object.freeze({
  conservative: "fiScenarioConservative",
  moderate_growth: "fiScenarioModerate",
  aggressive_growth: "fiScenarioAggressive"
});

/** Stable fingerprints for backend English warning/disclaimer strings (historical rows). */
const MESSAGE_FINGERPRINTS = Object.freeze({
  "upload or confirm the current iul statement: monthly premium and death benefit are required.":
    "fiWarnMissingIul",
  "obtain an official primerica term quote or enter a representative-confirmed premium.":
    "fiWarnTermQuoteRequired",
  "the representative must confirm the longest available primerica term and official premium.":
    "fiWarnConfirmTermPremium",
  "displayed term premium is a preliminary estimate — not an official premium.":
    "fiWarnPreliminaryPremium",
  "confirm the investment time horizon before emphasizing a projected result.":
    "fiWarnHorizonRequired",
  "complete replacement review acknowledgements before client discussion.":
    "fiWarnReplacementAckRequired",
  "complete the client risk-profile process before emphasizing an investment scenario.":
    "fiWarnRiskProfileRequired",
  "no monthly premium difference is available for mutual-fund illustration.":
    "fiWarnNoDifference",
  "do not cancel or surrender the existing policy before new coverage is approved, issued, accepted, paid, and confirmed in force.":
    "fiReplaceDoNotCancel",
  "the proposed term coverage may be declined, rated, delayed, or modified through underwriting.":
    "fiReplaceMayBeDeclined",
  "replacement forms and procedures may be required.":
    "fiReplaceFormsRequired",
  "existing surrender charges, loans, tax consequences, riders, guarantees, contestability periods, and other policy differences must be reviewed.":
    "fiReplaceReviewDifferences",
  "term insurance does not build cash value and expires after the selected term.":
    "fiReplaceTermNoCashValue",
  "mutual funds fluctuate and may lose value.":
    "fiReplaceFundsFluctuate",
  "investment returns are not guaranteed.":
    "fiReplaceReturnsNotGuaranteed",
  "planning illustration for representative discussion only. not a client recommendation.":
    "fiDisclaimerPlanningOnly",
  "atlas informs. representatives recommend. clients decide.":
    "fiDisclaimerBr066",
  "investment projections are hypothetical and non-guaranteed.":
    "fiDisclaimerHypothetical",
  "specific mutual-fund symbols are not recommended in this evaluation.":
    "fiDisclaimerNoSymbols",
  "official product eligibility, premiums, replacement requirements, and investment suitability must be verified outside any preliminary estimate.":
    "fiDisclaimerVerifyOutside"
});

export const fiReportMessages = Object.freeze({
  en: {
    fiReportEyebrow: "Financial Intelligence Report",
    fiReportTitle: "Possible Discussion Scenarios for the Primerica Representative",
    fiReportLede:
      "Educational planning illustration for representative review. Atlas informs. Representatives recommend. Clients decide. Values shown are provided by the Atlas Financial Intelligence API.",
    fiEducationalIllustration: "Educational Illustration",
    fiSectionCurrentSituation: "Current situation",
    fiSectionProposedTerm: "Proposed term strategy",
    fiSectionMonthlyDifference: "Monthly difference",
    fiSectionHypotheticalGrowth: "Hypothetical growth illustrations",
    fiSectionImportantSafeguards: "Important safeguards",
    fiHeroDifferenceLabel: "Invest-the-Difference amount",
    fiHeroDifferenceHint: "Monthly amount available for educational investment illustration",
    fiProposedTermPremium: "Proposed term insurance premium",
    fiTermDuration: "Term duration",
    fiYearsUnit: "{years} years",
    fiHypotheticalBadge: "Hypothetical",
    fiComparisonBarsCaption:
      "Relative comparison of backend-provided hypothetical ending values only. Not a time-series forecast. No rate is promised, expected, or recommended.",
    fiReportLanguageLabel: "Report language",
    fiReportLanguageEn: "English",
    fiReportLanguageEs: "Spanish",
    fiEducationalStatus: "Educational illustration · Non-guaranteed",
    fiStatus: "Status",
    fiCurrentVersion: "Current version",
    fiGenerated: "Generated",
    fiSupersededNotForClient: "(superseded — not for client discussion)",
    fiPreliminaryEstimate: "Preliminary planning estimate — not an official Primerica quote.",
    fiExistingIulSummary: "Existing IUL summary",
    fiProduct: "Product",
    fiCurrentMonthlyPremium: "Current monthly premium",
    fiCurrentDeathBenefit: "Current death benefit",
    fiCarrier: "Carrier",
    fiDiscussionComparison: "Discussion scenario comparison",
    fiCategory: "Category",
    fiExistingIul: "Existing IUL",
    fiDiscussionScenario: "Discussion Scenario",
    fiDeathBenefit: "Death benefit",
    fiSameAmountInTerm: "Same amount in term",
    fiExplicitAdjustment: "Explicit representative adjustment",
    fiMonthlyInsurancePremium: "Monthly insurance premium",
    fiSource: "Source",
    fiMonthlyInvestmentAmount: "Monthly investment amount",
    fiNotEvaluated: "Not evaluated",
    fiTotalMonthlyOutlay: "Total monthly outlay",
    fiTermDurationMeta: "Representative-entered term duration: {years} years",
    fiHorizonMeta: "Investment projection horizon: {years} years (distinct field)",
    fiQuoteDateMeta: "Quote date: {date}",
    fiDeathBenefitAdjustment: "Explicit death-benefit adjustment.",
    fiOverrideReason: "Representative reason: {reason}",
    fiOverrideReasonRequired: "Representative reason required for audit.",
    fiConfirmLongestTerm:
      "The representative must confirm the longest available Primerica term and official premium.",
    fiInvestTheDifference: "Invest the Difference",
    fiUnboundedDifference: "Unbounded premium difference",
    fiMonthlyDifference: "Monthly difference",
    fiProposedContribution: "Proposed monthly investment contribution",
    fiSameOutlayValidation: "Same-outlay validation",
    fiPasses: "Passes",
    fiReviewRequired: "Review required",
    fiPendingTermPremium: "Pending term premium",
    fiNegativeDifferenceWarning:
      "Term premium exceeds current IUL monthly outlay. Investment contribution is zero. Negative investment contributions are not shown. Representative review required.",
    fiEducationalProjections: "Educational investment projections",
    fiProjectionsNote:
      "Hypothetical · Educational · Non-guaranteed. Before investment fees, expenses, taxes, and inflation unless separately disclosed. General categories only — fund symbols are not presented as client recommendations. Projection math is computed by the backend.",
    fiIllustrativeAnnualReturn: "Illustrative annual return: {rate}",
    fiAnnualHypotheticalRate: "Annual hypothetical rate",
    fiMonthlyContribution: "Monthly contribution: {amount}",
    fiHorizonYears: "Horizon: {years} years",
    fiInvestmentHorizon: "Investment horizon",
    fiScenarioAligned: "Scenario most aligned with the information currently available",
    fiTotalContributions: "Total contributions",
    fiIllustrativeGrowth: "Illustrative growth",
    fiHypotheticalProjectedValue: "Hypothetical projected value",
    fiProjectionsPending:
      "Projections appear after a confirmed term premium and investment horizon are provided to the Financial Intelligence API.",
    fiRiskProfileGate:
      "Complete the client risk-profile process before emphasizing an investment scenario. Scenarios remain unranked educational illustrations until a representative records a risk-profile classification. Arithmetic completion alone does not make the evaluation client-ready.",
    fiRiskProfileRecorded:
      "Risk-profile classification recorded: {profile}. Emphasis follows the representative-entered planning classification and does not constitute a suitability determination.",
    fiProjectionAssumptions: "Projection assumptions",
    fiIllustrativeRates: "Illustrative rates: {rates}",
    fiRatesCanonical:
      "Rates sourced from canonical backend configuration (4% / 7% / 10% educational assumptions).",
    fiCompoundingNote: "Monthly compounding · ordinary-annuity timing · educational / non-guaranteed.",
    fiAssumptionsDefaultRates:
      "Illustrative annual returns use canonical backend educational assumptions (typically 4%, 7%, and 10%).",
    fiAssumptionsCompounding: "Monthly compounding and ordinary-annuity contribution timing.",
    fiAssumptionsNotGuaranteed:
      "Not guaranteed or expected returns. Not an official Primerica illustration.",
    fiMissingInformation: "Missing information",
    fiReplacementSafeguards: "Replacement safeguards",
    fiReplacementAcknowledgement:
      "Replacement acknowledgement recorded. Acknowledgement does not complete all legal or company replacement requirements.",
    fiRepresentativeNotes: "Representative notes",
    fiEducationalDisclaimers: "Educational disclaimers",
    fiDisclaimerHypotheticalReturns:
      "These projections are hypothetical and educational. They are not guaranteed or expected returns and must not be presented as such.",
    fiDisclaimerNoSurrender:
      "Atlas does not instruct cancellation or surrender of existing coverage. Replacement decisions remain with the licensed representative and client under applicable rules.",
    fiNotARecommendation: "This is not a recommendation.",
    fiRegisteredRepHandoff:
      "Any discussion involving specific investment products or securities must be handled by an appropriately registered representative.",
    fiNonGuaranteed: "Non-guaranteed",
    fiScenarioConservative: "Conservative",
    fiScenarioModerate: "Moderate Growth",
    fiScenarioAggressive: "Aggressive Growth",
    fiStatusMissingPolicyData: "Missing policy data",
    fiStatusTermQuoteRequired: "Term quote required",
    fiStatusTermConfirmationRequired: "Term confirmation required",
    fiStatusInvestmentHorizonRequired: "Investment horizon required",
    fiStatusRiskProfileRequired: "Risk-profile process incomplete",
    fiStatusReplacementReviewRequired: "Replacement review required",
    fiStatusReadyForReview: "Ready for representative review",
    fiStatusRepresentativeAdjusted: "Representative adjusted",
    fiStatusClientDiscussion: "Client-discussion version",
    fiStatusSuperseded: "Superseded",
    fiWarnMissingIul:
      "Upload or confirm the current IUL statement: monthly premium and death benefit are required.",
    fiWarnTermQuoteRequired:
      "Obtain an official Primerica term quote or enter a representative-confirmed premium.",
    fiWarnConfirmTermPremium:
      "The representative must confirm the longest available Primerica term and official premium.",
    fiWarnPreliminaryPremium:
      "Displayed term premium is a preliminary estimate — not an official premium.",
    fiWarnHorizonRequired:
      "Confirm the investment time horizon before emphasizing a projected result.",
    fiWarnReplacementAckRequired:
      "Complete replacement review acknowledgements before client discussion.",
    fiWarnRiskProfileRequired:
      "Complete the client risk-profile process before emphasizing an investment scenario.",
    fiWarnNoDifference: "No monthly premium difference is available for investment illustration.",
    fiReplaceDoNotCancel:
      "Do not cancel or surrender the existing policy before new coverage is approved, issued, accepted, paid, and confirmed in force.",
    fiReplaceMayBeDeclined:
      "The proposed term coverage may be declined, rated, delayed, or modified through underwriting.",
    fiReplaceFormsRequired: "Replacement forms and procedures may be required.",
    fiReplaceReviewDifferences:
      "Existing surrender charges, loans, tax consequences, riders, guarantees, contestability periods, and other policy differences must be reviewed.",
    fiReplaceTermNoCashValue:
      "Term insurance does not build cash value and expires after the selected term.",
    fiReplaceFundsFluctuate: "Investment values fluctuate and may lose value.",
    fiReplaceReturnsNotGuaranteed: "Investment returns are not guaranteed.",
    fiDisclaimerPlanningOnly:
      "Planning illustration for representative discussion only. Not a client recommendation.",
    fiDisclaimerBr066: "Atlas informs. Representatives recommend. Clients decide.",
    fiDisclaimerHypothetical: "Investment projections are hypothetical and non-guaranteed.",
    fiDisclaimerNoSymbols: "Specific mutual-fund symbols are not recommended in this evaluation.",
    fiDisclaimerVerifyOutside:
      "Official product eligibility, premiums, replacement requirements, and investment suitability must be verified outside any preliminary estimate.",
    fiPanelCreateScenario: "Create Discussion Scenario",
    fiPanelNoEvaluation:
      "No Financial Intelligence strategy evaluation has been created for this policy review.",
    fiPanelNoPermission: "You do not have permission to create evaluations.",
    fiPanelVersionCurrent: "(current)",
    fiPanelVersionSuperseded: "(superseded)",
    fiPanelQuoteRequired:
      "Enter or attach the representative-confirmed term illustration to calculate the invest-the-difference scenario.",
    fiPanelPrintReport: "Print report",
    fiPanelStatus: "Status",
    fiPanelVersion: "Version",
    fiPanelReview: "Review"
  },
  es: {
    fiReportEyebrow: "Informe de Inteligencia Financiera",
    fiReportTitle: "Posibles escenarios para conversación del representante de Primerica",
    fiReportLede:
      "Ilustración educativa de planificación para revisión del representante. Atlas informa. Los representantes recomiendan. Los clientes deciden. Los valores mostrados provienen de la API de Inteligencia Financiera de Atlas.",
    fiEducationalIllustration: "Ilustración educativa",
    fiSectionCurrentSituation: "Situación actual",
    fiSectionProposedTerm: "Estrategia propuesta a término",
    fiSectionMonthlyDifference: "Diferencia mensual",
    fiSectionHypotheticalGrowth: "Ilustraciones de crecimiento hipotético",
    fiSectionImportantSafeguards: "Salvaguardas importantes",
    fiHeroDifferenceLabel: "Monto de Invertir la diferencia",
    fiHeroDifferenceHint: "Monto mensual disponible para la ilustración educativa de inversión",
    fiProposedTermPremium: "Prima propuesta del seguro a término",
    fiTermDuration: "Duración del término",
    fiYearsUnit: "{years} años",
    fiHypotheticalBadge: "Hipotético",
    fiComparisonBarsCaption:
      "Comparación relativa solo de los valores finales hipotéticos proporcionados por el backend. No es una proyección serie temporal. Ninguna tasa está prometida, esperada ni recomendada.",
    fiReportLanguageLabel: "Idioma del informe",
    fiReportLanguageEn: "Inglés",
    fiReportLanguageEs: "Español",
    fiEducationalStatus: "Ilustración educativa · No garantizado",
    fiStatus: "Estado",
    fiCurrentVersion: "Versión actual",
    fiGenerated: "Generado",
    fiSupersededNotForClient: "(reemplazada — no apta para conversación con el cliente)",
    fiPreliminaryEstimate:
      "Estimación preliminar de planificación — no es una cotización oficial de Primerica.",
    fiExistingIulSummary: "Resumen del IUL actual",
    fiProduct: "Producto",
    fiCurrentMonthlyPremium: "Prima mensual actual",
    fiCurrentDeathBenefit: "Beneficio por fallecimiento actual",
    fiCarrier: "Aseguradora",
    fiDiscussionComparison: "Comparación del escenario para conversación",
    fiCategory: "Categoría",
    fiExistingIul: "IUL actual",
    fiDiscussionScenario: "Escenario para conversación",
    fiDeathBenefit: "Beneficio por fallecimiento",
    fiSameAmountInTerm: "Mismo monto en el seguro a término",
    fiExplicitAdjustment: "Ajuste explícito del representante",
    fiMonthlyInsurancePremium: "Prima mensual de seguro",
    fiSource: "Fuente",
    fiMonthlyInvestmentAmount: "Monto mensual de inversión",
    fiNotEvaluated: "No evaluado",
    fiTotalMonthlyOutlay: "Desembolso mensual total",
    fiTermDurationMeta: "Duración del término ingresada por el representante: {years} años",
    fiHorizonMeta: "Horizonte de inversión para proyección: {years} años (campo distinto)",
    fiQuoteDateMeta: "Fecha de cotización: {date}",
    fiDeathBenefitAdjustment: "Ajuste explícito del beneficio por fallecimiento.",
    fiOverrideReason: "Motivo del representante: {reason}",
    fiOverrideReasonRequired: "Se requiere el motivo del representante para auditoría.",
    fiConfirmLongestTerm:
      "El representante debe confirmar el término más largo disponible de Primerica y la prima oficial.",
    fiInvestTheDifference: "Invertir la diferencia",
    fiUnboundedDifference: "Diferencia de prima sin límite",
    fiMonthlyDifference: "Diferencia mensual",
    fiProposedContribution: "Aportación mensual de inversión propuesta",
    fiSameOutlayValidation: "Validación de mismo desembolso",
    fiPasses: "Cumple",
    fiReviewRequired: "Requiere revisión",
    fiPendingTermPremium: "Pendiente de prima a término",
    fiNegativeDifferenceWarning:
      "La prima a término supera el desembolso mensual actual del IUL. La aportación de inversión es cero. No se muestran aportaciones negativas. Se requiere revisión del representante.",
    fiEducationalProjections: "Proyecciones educativas de inversión",
    fiProjectionsNote:
      "Hipotético · Educativo · No garantizado. Antes de comisiones, gastos, impuestos e inflación, salvo que se indiquen por separado. Solo categorías generales — no se presentan símbolos de fondos como recomendaciones al cliente. El cálculo de proyección lo realiza el backend.",
    fiIllustrativeAnnualReturn: "Rendimiento anual ilustrativo: {rate}",
    fiAnnualHypotheticalRate: "Tasa anual hipotética",
    fiMonthlyContribution: "Aportación mensual: {amount}",
    fiHorizonYears: "Horizonte: {years} años",
    fiInvestmentHorizon: "Horizonte de inversión",
    fiScenarioAligned: "Escenario más alineado con la información disponible actualmente",
    fiTotalContributions: "Aportaciones totales",
    fiIllustrativeGrowth: "Crecimiento ilustrativo",
    fiHypotheticalProjectedValue: "Valor hipotético proyectado",
    fiProjectionsPending:
      "Las proyecciones aparecen después de proporcionar una prima a término confirmada y un horizonte de inversión a la API de Inteligencia Financiera.",
    fiRiskProfileGate:
      "Complete el proceso de perfil de riesgo del cliente antes de enfatizar un escenario de inversión. Los escenarios permanecen como ilustraciones educativas sin clasificación hasta que el representante registre un perfil de riesgo. Completar la aritmética por sí sola no hace que la evaluación esté lista para el cliente.",
    fiRiskProfileRecorded:
      "Clasificación de perfil de riesgo registrada: {profile}. El énfasis sigue la clasificación de planificación ingresada por el representante y no constituye una determinación de idoneidad.",
    fiProjectionAssumptions: "Supuestos de proyección",
    fiIllustrativeRates: "Tasas ilustrativas: {rates}",
    fiRatesCanonical:
      "Tasas tomadas de la configuración canónica del backend (supuestos educativos del 4 %, 7 % y 10 %).",
    fiCompoundingNote:
      "Capitalización mensual · timing de anualidad ordinaria · educativo / no garantizado.",
    fiAssumptionsDefaultRates:
      "Los rendimientos anuales ilustrativos usan los supuestos educativos canónicos del backend (típicamente 4 %, 7 % y 10 %).",
    fiAssumptionsCompounding: "Capitalización mensual y timing de aportaciones de anualidad ordinaria.",
    fiAssumptionsNotGuaranteed:
      "No son rendimientos garantizados ni esperados. No es una ilustración oficial de Primerica.",
    fiMissingInformation: "Información faltante",
    fiReplacementSafeguards: "Salvaguardas sobre el reemplazo",
    fiReplacementAcknowledgement:
      "Reconocimiento sobre el reemplazo registrado. El reconocimiento no completa todos los requisitos legales o de la compañía para el reemplazo.",
    fiRepresentativeNotes: "Notas del representante",
    fiEducationalDisclaimers: "Divulgaciones educativas",
    fiDisclaimerHypotheticalReturns:
      "Estas proyecciones son hipotéticas y educativas. No son rendimientos garantizados ni esperados y no deben presentarse como tales.",
    fiDisclaimerNoSurrender:
      "Atlas no indica cancelar ni entregar la cobertura existente. Las decisiones de reemplazo corresponden al representante autorizado y al cliente conforme a las normas aplicables.",
    fiNotARecommendation: "Esto no constituye una recomendación.",
    fiRegisteredRepHandoff:
      "Toda conversación relacionada con productos específicos de inversión o valores debe ser atendida por un representante debidamente registrado.",
    fiNonGuaranteed: "No garantizado",
    fiScenarioConservative: "Conservador",
    fiScenarioModerate: "Crecimiento moderado",
    fiScenarioAggressive: "Crecimiento agresivo",
    fiStatusMissingPolicyData: "Faltan datos de la póliza",
    fiStatusTermQuoteRequired: "Se requiere cotización a término",
    fiStatusTermConfirmationRequired: "Se requiere confirmación del término",
    fiStatusInvestmentHorizonRequired: "Se requiere horizonte de inversión",
    fiStatusRiskProfileRequired: "Proceso de perfil de riesgo incompleto",
    fiStatusReplacementReviewRequired: "Se requiere revisión de reemplazo",
    fiStatusReadyForReview: "Lista para revisión del representante",
    fiStatusRepresentativeAdjusted: "Ajustada por el representante",
    fiStatusClientDiscussion: "Versión para conversación con el cliente",
    fiStatusSuperseded: "Reemplazada",
    fiWarnMissingIul:
      "Cargue o confirme el estado de cuenta del IUL actual: se requieren la prima mensual y el beneficio por fallecimiento.",
    fiWarnTermQuoteRequired:
      "Obtenga una cotización oficial a término de Primerica o ingrese una prima confirmada por el representante.",
    fiWarnConfirmTermPremium:
      "El representante debe confirmar el término más largo disponible de Primerica y la prima oficial.",
    fiWarnPreliminaryPremium:
      "La prima a término mostrada es una estimación preliminar — no es una prima oficial.",
    fiWarnHorizonRequired:
      "Confirme el horizonte de inversión antes de enfatizar un resultado proyectado.",
    fiWarnReplacementAckRequired:
      "Complete los reconocimientos de revisión de reemplazo antes de la conversación con el cliente.",
    fiWarnRiskProfileRequired:
      "Complete el proceso de perfil de riesgo del cliente antes de enfatizar un escenario de inversión.",
    fiWarnNoDifference:
      "No hay diferencia de prima mensual disponible para la ilustración de inversión.",
    fiReplaceDoNotCancel:
      "No cancele ni entregue la póliza existente antes de que la nueva cobertura esté aprobada, emitida, aceptada, pagada y confirmada en vigor.",
    fiReplaceMayBeDeclined:
      "La cobertura a término propuesta puede ser declinada, clasificada, retrasada o modificada en el proceso de suscripción.",
    fiReplaceFormsRequired: "Pueden requerirse formularios y procedimientos de reemplazo.",
    fiReplaceReviewDifferences:
      "Deben revisarse cargos por entrega, préstamos, consecuencias fiscales, endosos, garantías, períodos de impugnabilidad y otras diferencias de la póliza.",
    fiReplaceTermNoCashValue:
      "El seguro a término no acumula valor en efectivo y vence al finalizar el término seleccionado.",
    fiReplaceFundsFluctuate: "Los valores de inversión fluctúan y pueden perder valor.",
    fiReplaceReturnsNotGuaranteed: "Los rendimientos de inversión no están garantizados.",
    fiDisclaimerPlanningOnly:
      "Ilustración de planificación solo para conversación del representante. No es una recomendación al cliente.",
    fiDisclaimerBr066: "Atlas informa. Los representantes recomiendan. Los clientes deciden.",
    fiDisclaimerHypothetical: "Las proyecciones de inversión son hipotéticas y no garantizadas.",
    fiDisclaimerNoSymbols:
      "En esta evaluación no se recomiendan símbolos específicos de fondos mutuos.",
    fiDisclaimerVerifyOutside:
      "La elegibilidad oficial del producto, las primas, los requisitos de reemplazo y la idoneidad de la inversión deben verificarse fuera de cualquier estimación preliminar.",
    fiPanelCreateScenario: "Crear escenario para conversación",
    fiPanelNoEvaluation:
      "Aún no se ha creado una evaluación de estrategia de Inteligencia Financiera para esta revisión de póliza.",
    fiPanelNoPermission: "No tiene permiso para crear evaluaciones.",
    fiPanelVersionCurrent: "(actual)",
    fiPanelVersionSuperseded: "(reemplazada)",
    fiPanelQuoteRequired:
      "Ingrese o adjunte la ilustración a término confirmada por el representante para calcular el escenario de Invertir la diferencia.",
    fiPanelPrintReport: "Imprimir informe",
    fiPanelStatus: "Estado",
    fiPanelVersion: "Versión",
    fiPanelReview: "Revisión"
  }
});

function interpolate(template, params = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) =>
    params[key] == null ? "" : String(params[key])
  );
}

export function normalizeFiLanguage(language) {
  return String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

export function getFiReportCatalog(language) {
  const lang = normalizeFiLanguage(language);
  return fiReportMessages[lang] || fiReportMessages.en;
}

export function translateFiReport(language, key, params) {
  const catalog = getFiReportCatalog(language);
  const fallback = fiReportMessages.en[key] ?? key;
  const template = catalog[key] ?? fallback;
  return params ? interpolate(template, params) : template;
}

/**
 * Format an unknown FI status code for safe display (never throw).
 * Example: READY_FOR_FOO → "READY FOR FOO"
 */
export function formatUnknownFiStatusCode(statusCode) {
  if (statusCode == null || statusCode === "") {
    return "—";
  }
  return String(statusCode).replace(/_/g, " ").trim() || "—";
}

export function localizeFiStatus(language, statusCode) {
  const key = STATUS_KEYS[statusCode];
  if (!key) {
    // Fail closed for display: readable fallback, never crash the page.
    return formatUnknownFiStatusCode(statusCode);
  }
  return translateFiReport(language, key);
}

export function localizeFiScenarioLabel(language, scenario) {
  if (!scenario) {
    return "—";
  }
  const key = SCENARIO_LABEL_KEYS[scenario.id];
  if (key) {
    return translateFiReport(language, key);
  }
  return scenario.label || scenario.id || "—";
}

export function localizeFiBackendMessage(language, message) {
  if (!message) {
    return "";
  }
  if (typeof message === "object" && message.messageKey) {
    return translateFiReport(language, message.messageKey);
  }
  const text = String(message).trim();
  const fingerprint = text.toLowerCase();
  const key = MESSAGE_FINGERPRINTS[fingerprint];
  if (key) {
    return translateFiReport(language, key);
  }
  // Unknown historical English text: show as-is (never invent securities content).
  return text;
}

export function formatFiMoney(value, language, { cents = true } = {}) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  const locale = FI_REPORT_LOCALES[normalizeFiLanguage(language)] || "en-US";
  return Number(value).toLocaleString(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  });
}

export function formatFiPercent(rate) {
  if (rate == null) {
    return "—";
  }
  return `${(Number(rate) * 100).toFixed(0)}%`;
}

export function formatFiTimestamp(value, language) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const locale = FI_REPORT_LOCALES[normalizeFiLanguage(language)] || "en-US";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Build a presentation view from one backend evaluation.
 * Numeric fields are copied by reference from the evaluation — never recalculated.
 */
export function buildLocalizedFiReportView(evaluation, language = "en") {
  const lang = normalizeFiLanguage(language);
  const t = (key, params) => translateFiReport(lang, key, params);
  const projections = evaluation?.projectionOutputs?.scenarios || [];

  return {
    language: lang,
    evaluationId: evaluation?.id ?? null,
    version: evaluation?.version ?? null,
    statusCode: evaluation?.status ?? null,
    statusLabel: localizeFiStatus(lang, evaluation?.status),
    sectionTitle: t("fiReportTitle"),
    monthlyInvestmentDifference: evaluation?.monthlyInvestmentDifference ?? null,
    totalProposedMonthlyOutlay: evaluation?.totalProposedMonthlyOutlay ?? null,
    currentIulMonthlyPremium: evaluation?.currentIulMonthlyPremium ?? null,
    projectionScenarios: projections.map((scenario) => ({
      id: scenario.id,
      label: localizeFiScenarioLabel(lang, scenario),
      annualReturn: scenario.annualReturn,
      monthlyContribution: scenario.monthlyContribution,
      timeHorizonYears: scenario.timeHorizonYears,
      totalContributions: scenario.totalContributions,
      illustrativeGrowth: scenario.illustrativeGrowth,
      illustrativeProjectedValue: scenario.illustrativeProjectedValue
    })),
    missingDataWarnings: (evaluation?.missingDataWarnings || []).map((item) =>
      localizeFiBackendMessage(lang, item)
    ),
    replacementWarnings: (evaluation?.replacementWarnings || []).map((item) =>
      localizeFiBackendMessage(lang, item)
    ),
    disclaimers: (evaluation?.disclaimers || []).map((item) =>
      localizeFiBackendMessage(lang, item)
    ),
    registeredRepHandoff: t("fiRegisteredRepHandoff"),
    notARecommendation: t("fiNotARecommendation"),
    strings: getFiReportCatalog(lang)
  };
}

export function assertSameNumericEvaluation(a, b) {
  return (
    a?.evaluationId === b?.evaluationId &&
    a?.version === b?.version &&
    a?.monthlyInvestmentDifference === b?.monthlyInvestmentDifference &&
    a?.totalProposedMonthlyOutlay === b?.totalProposedMonthlyOutlay &&
    a?.currentIulMonthlyPremium === b?.currentIulMonthlyPremium &&
    JSON.stringify(a?.projectionScenarios?.map((s) => ({
      id: s.id,
      annualReturn: s.annualReturn,
      monthlyContribution: s.monthlyContribution,
      totalContributions: s.totalContributions,
      illustrativeGrowth: s.illustrativeGrowth,
      illustrativeProjectedValue: s.illustrativeProjectedValue
    }))) ===
      JSON.stringify(b?.projectionScenarios?.map((s) => ({
        id: s.id,
        annualReturn: s.annualReturn,
        monthlyContribution: s.monthlyContribution,
        totalContributions: s.totalContributions,
        illustrativeGrowth: s.illustrativeGrowth,
        illustrativeProjectedValue: s.illustrativeProjectedValue
      })))
  );
}
