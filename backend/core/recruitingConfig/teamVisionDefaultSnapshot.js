/**
 * C1 — Frozen Team Vision recruiting default snapshot.
 * Copy and field order match current production hardcodes. Do not modernize.
 */

const faqCatalog = require("../../knowledge/faq.json");
const licensePath = require("../../knowledge/teamVisionLicensePath.json");
const {
  SCHEMA_VERSION,
  QUALIFICATION_FIELD_IDS,
  PRE_SCHEDULE_FIELD_IDS
} = require("./constants");

const TEAM_VISION_LOCAL_CITIES = Object.freeze([
  "doral",
  "miami",
  "hialeah",
  "homestead",
  "kendall",
  "coral gables",
  "miami beach",
  "fort lauderdale",
  "hollywood",
  "pembroke pines",
  "miramar",
  "weston",
  "davie",
  "plantation",
  "sunrise",
  "miami lakes",
  "miami springs",
  "sweetwater",
  "westchester",
  "south miami",
  "pinecrest",
  "palmetto bay",
  "cutler bay",
  "aventura",
  "sunny isles beach",
  "north miami",
  "north miami beach",
  "tamiami",
  "west miami",
  "medley",
  "virginia gardens"
]);

const TEAM_VISION_OFFICE_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function cloneFaqCatalog() {
  const faq = Object.keys(faqCatalog).map((id) => ({
    id,
    keywords: [...(faqCatalog[id].keywords || [])],
    response_en: faqCatalog[id].response_en,
    response_es: faqCatalog[id].response_es
  }));

  faq.push({
    id: "license_path_2_14_2_15",
    keywords: [
      "2-14",
      "2-15",
      "214",
      "215",
      "which license",
      "what license",
      "cual licencia",
      "que licencia",
      "license path",
      "licensing path",
      "camino de licencia",
      "ruta de licencia"
    ],
    response_en: licensePath.response_en,
    response_es: licensePath.response_es
  });

  return faq;
}

function buildTeamVisionRecruitingDefault() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      industry: "insurance",
      businessName: "Team Vision",
      recruitingObjective:
        "It's an opportunity in financial services where we help families with protection and financial planning. We provide training and support.",
      defaultLanguage: "es",
      supportedLanguages: ["es", "en"],
      tone: "conversational"
    },
    coverage: {
      officeAddress: TEAM_VISION_OFFICE_ADDRESS,
      localCities: [...TEAM_VISION_LOCAL_CITIES],
      localRadiusMiles: 25,
      defaultInterviewMode: "zoom"
    },
    qualification: {
      fieldOrder: [...QUALIFICATION_FIELD_IDS],
      requiredFields: [...PRE_SCHEDULE_FIELD_IDS],
      disqualifiers: [
        {
          fieldId: "authorization",
          when: false,
          action: "current_not_fit",
          messages: {
            es: "Gracias por tu interés. En este momento necesitamos contar con autorización legal vigente para trabajar en Estados Unidos. Cuando cuentes con la documentación requerida, con gusto podemos retomar el proceso.",
            en: "Thank you for your interest. At this time we need current legal authorization to work in the United States. When you have the required documentation, we'd be happy to continue the process."
          }
        }
      ],
      questions: [
        {
          fieldId: "city",
          text_es: "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?",
          text_en: "Hi! Thanks for reaching out. What city and state do you live in?"
        },
        {
          fieldId: "state",
          text_es: "¿En qué estado está ${city}?",
          text_en: "Which state is ${city} in?"
        },
        {
          fieldId: "authorization",
          text_es: "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
          text_en: "Do you have work authorization or legal documentation to work in the United States?"
        },
        {
          fieldId: "interviewType",
          text_es: "Excelente. Estamos realizando las entrevistas por Zoom. ¿Prefieres en la mañana o en la tarde?",
          text_en: "Excellent. We're conducting interviews via Zoom. Do you prefer morning or afternoon?"
        },
        {
          fieldId: "dayPart",
          text_es: "¿Prefieres en la mañana o en la tarde?",
          text_en: "Do you prefer morning or afternoon?"
        },
        {
          fieldId: "name",
          text_es: "¿Cuál es tu nombre completo?",
          text_en: "What is your full name?"
        },
        {
          fieldId: "email",
          text_es: "¿Cuál es tu correo electrónico para enviarte la confirmación de la entrevista?",
          text_en: "What is your email address so we can send your interview confirmation?"
        }
      ]
    },
    scheduling: {
      appointmentPurpose: "recruiting_interview",
      durationMinutes: 30,
      allowedModes: ["in_person", "zoom"]
    },
    conversation: {
      openingInstructions: {
        es: "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?",
        en: "Hi! Thanks for reaching out. What city and state do you live in?"
      },
      faq: cloneFaqCatalog(),
      handoffDisplayName: "Team Vision",
      objectionKeys: [
        "is_this_sales",
        "think_about_it",
        "legitimacy_trust",
        "recruit_role_objection",
        "network_objection"
      ]
    }
  };
}

const TEAM_VISION_RECRUITING_DEFAULT = Object.freeze(buildTeamVisionRecruitingDefault());

function cloneTeamVisionRecruitingDefault() {
  return structuredClone(TEAM_VISION_RECRUITING_DEFAULT);
}

module.exports = {
  TEAM_VISION_OFFICE_ADDRESS,
  TEAM_VISION_LOCAL_CITIES,
  TEAM_VISION_RECRUITING_DEFAULT,
  cloneTeamVisionRecruitingDefault,
  buildTeamVisionRecruitingDefault
};
