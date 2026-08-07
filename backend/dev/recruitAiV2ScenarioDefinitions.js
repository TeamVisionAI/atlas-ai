/**
 * Recruit AI v2 simulator scenario definitions (sanitized, no PII).
 */

const RECRUIT_AI_V2_SCENARIOS = [
  {
    id: "first-production-failure",
    name: "First Production Failure",
    category: "production_defect",
    description: "Hola → Miami → La or → Florida (BR-082)",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "t01",
        text: "Hola",
        inboundMessageId: "sim-wamid.first-prod.t01",
        expect: {
          intent: "greeting",
          messageLanguage: "spanish",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          nextAction: "continue_after_greeting",
          sideEffectsDenied: true
        }
      },
      {
        id: "t02",
        text: "Miami",
        inboundMessageId: "sim-wamid.first-prod.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: null,
          proposedState: "FL",
          cityCertainty: "partial",
          stateCertainty: "proposed",
          requiresClarification: true,
          shouldEscalate: false,
          nextAction: "clarify_location",
          noDayPartScheduling: true,
          sideEffectsDenied: true
        }
      },
      {
        id: "t03",
        text: "La or",
        inboundMessageId: "sim-wamid.first-prod.t03",
        setup: {
          lastQuestionAsked: "ask_day_part",
          lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
          conversation: {
            clarificationCount: 0,
            pendingClarification: null
          }
        },
        expect: {
          notIntent: "provide_name",
          intent: "incomplete_day_part",
          requiresClarification: true,
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "t04",
        text: "Florida",
        inboundMessageId: "sim-wamid.first-prod.t04",
        setup: {
          knownFacts: {
            city: "Miami",
            state: null,
            cityCertainty: "partial",
            stateCertainty: "proposed",
            proposedState: "FL"
          },
          lastQuestionAsked: "confirm_location",
          lastAtlasOutboundText: "Perfecto. ¿Miami, Florida?",
          preferredLanguage: "spanish",
          languageMeta: { source: "active_conversation", spanishEvidenceCount: 1 }
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: "FL",
          cityCertainty: "confirmed",
          stateCertainty: "confirmed",
          nextAction: "continue_qualification",
          stage: "qualification",
          noDayPartScheduling: true,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "time-counteroffers",
    name: "Time Counteroffers",
    category: "scheduling",
    description: "5:00 PM offer → 6? → 6:30? → Yes",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred",
      currentStage: "proposed",
      appointment: {
        status: "proposed",
        previouslyOfferedSlots: [
          { date: null, time: "17:00", timezone: "America/New_York" }
        ]
      },
      conversation: {
        lastQuestionAsked: "offer_time_choices",
        lastAtlasOutboundText: "I can offer 5:00 PM. Does that work?"
      }
    },
    turns: [
      {
        id: "c01",
        text: "6?",
        inboundMessageId: "sim-wamid.counter.t01",
        expect: {
          intent: "scheduling_counteroffer",
          shouldEscalate: false,
          nextAction: "acknowledge_and_check_availability",
          sideEffectsDenied: true
        }
      },
      {
        id: "c02",
        text: "6:30?",
        inboundMessageId: "sim-wamid.counter.t02",
        setup: {
          conversation: {
            lastQuestionAsked: "offer_time_choices",
            lastAtlasOutboundText: "Got it — you prefer 6:00 PM.",
            // Replacement counteroffer — treat as fresh preference (not repeated mismatch).
            counterofferMismatchCount: 0
          },
          appointment: {
            status: "proposed",
            previouslyOfferedSlots: [
              { date: null, time: "17:00", timezone: "America/New_York" }
            ],
            proposedTime: "18:00"
          }
        },
        expect: {
          intent: "scheduling_counteroffer",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "c03",
        text: "Yes that works",
        inboundMessageId: "sim-wamid.counter.t03",
        setup: {
          appointment: { status: "proposed" },
          conversation: {
            lastQuestionAsked: "confirm_slot",
            lastAtlasOutboundText: "Please reply YES to confirm 6:30 PM."
          }
        },
        expect: {
          intent: "schedule_confirm",
          nextAction: "create_appointment",
          authorizationAuthorized: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "spanish-recruiting-flow",
    name: "Spanish Recruiting Flow",
    category: "language",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "s01",
        text: "Hola",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false
        }
      },
      {
        id: "s02",
        text: "Miami",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          preferredLanguage: "spanish",
          requiresClarification: true
        }
      }
    ]
  },
  {
    id: "english-recruiting-flow",
    name: "English Recruiting Flow",
    category: "language",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "e01",
        text: "Hello",
        expect: {
          intent: "greeting",
          preferredLanguage: "english",
          shouldEscalate: false
        }
      },
      {
        id: "e02",
        text: "Tampa",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hi! What city and state do you live in?"
        },
        expect: {
          intent: "provide_location",
          city: "Tampa",
          state: null,
          proposedState: "FL",
          requiresClarification: true
        }
      }
    ]
  },
  {
    id: "language-switch",
    name: "Language Switch",
    category: "language",
    description: "Inferred English adapts; explicit English stays sticky",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "l01",
        text: "Hola",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false
        }
      }
    ]
  },
  {
    id: "language-explicit-english",
    name: "Language Switch (explicit English)",
    category: "language",
    seed: {
      preferredLanguage: "english",
      languageSource: "explicit",
      languageMeta: { source: "explicit" },
      explicitLanguagePreference: "english"
    },
    turns: [
      {
        id: "lx01",
        text: "Hola",
        expect: {
          intent: "greeting",
          preferredLanguage: "english",
          shouldEscalate: false
        }
      }
    ]
  },
  {
    id: "partial-location",
    name: "Partial Location",
    category: "qualification",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "p01",
        text: "Miami",
        setup: { lastQuestionAsked: "ask_location" },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: null,
          proposedState: "FL",
          requiresClarification: true
        }
      },
      {
        id: "p02",
        text: "Doral",
        setup: { lastQuestionAsked: "ask_location" },
        expect: {
          intent: "provide_location",
          city: "Doral",
          state: null,
          proposedState: "FL"
        }
      },
      {
        id: "p03",
        text: "Orlando",
        setup: { lastQuestionAsked: "ask_location" },
        expect: {
          intent: "provide_location",
          city: "Orlando",
          state: null,
          proposedState: "FL"
        }
      },
      {
        id: "p04",
        text: "Florida",
        setup: {
          knownFacts: {
            city: "Orlando",
            state: null,
            cityCertainty: "partial",
            stateCertainty: "proposed",
            proposedState: "FL"
          },
          lastQuestionAsked: "confirm_location",
          lastAtlasOutboundText: "Perfect. Orlando, Florida?"
        },
        expect: {
          intent: "provide_location",
          city: "Orlando",
          state: "FL",
          cityCertainty: "confirmed",
          stateCertainty: "confirmed"
        }
      }
    ]
  },
  {
    id: "typo-fragment-recovery",
    name: "Typo / Fragment Recovery",
    category: "production_defect",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
      }
    },
    turns: [
      {
        id: "f01",
        text: "La or",
        setup: {
          conversation: {
            lastQuestionAsked: "ask_day_part",
            lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
            clarificationCount: 0,
            pendingClarification: null
          }
        },
        expect: {
          notIntent: "provide_name",
          intent: "incomplete_day_part",
          shouldEscalate: false,
          requiresClarification: true
        }
      },
      {
        id: "f02",
        text: "por la",
        setup: {
          conversation: {
            lastQuestionAsked: "ask_day_part",
            lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
            clarificationCount: 0,
            pendingClarification: null
          }
        },
        expect: {
          notIntent: "provide_name",
          intent: "incomplete_day_part",
          shouldEscalate: false
        }
      },
      {
        id: "f03",
        text: "maña",
        setup: {
          conversation: {
            lastQuestionAsked: "ask_day_part",
            lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
            clarificationCount: 0,
            pendingClarification: null
          }
        },
        expect: {
          notIntent: "provide_name",
          intent: "incomplete_day_part",
          shouldEscalate: false
        }
      },
      {
        id: "f04",
        text: "afte",
        setup: {
          conversation: {
            lastQuestionAsked: "ask_day_part",
            lastAtlasOutboundText: "Do you prefer morning or afternoon?",
            clarificationCount: 0,
            pendingClarification: null
          }
        },
        expect: {
          notIntent: "provide_name",
          intent: "incomplete_day_part",
          shouldEscalate: false
        }
      }
    ]
  },
  {
    id: "repeated-ambiguity-human",
    name: "Repeated Ambiguity → Human",
    category: "escalation",
    seed: {
      preferredLanguage: "spanish",
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
        clarificationCount: 1,
        pendingClarification: "clarify_day_part",
        lastClarificationTemplateKey: "clarify_day_part"
      }
    },
    turns: [
      {
        id: "r01",
        text: "La or",
        expect: {
          intent: "incomplete_day_part",
          shouldEscalate: true,
          nextAction: "escalate_to_human",
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "zoom-preference",
    name: "Zoom Preference",
    category: "meeting",
    seed: {
      preferredLanguage: "english",
      knownFacts: { preferredMeetingType: "in_person" },
      appointment: { meetingType: "in_person", status: "none" }
    },
    turns: [
      {
        id: "z01",
        text: "Actually Zoom please",
        expect: {
          intent: "provide_meeting_preference",
          meetingType: "zoom",
          nextAction: "update_meeting_preference",
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "in-person-preference",
    name: "In-Person Preference",
    category: "meeting",
    seed: {
      preferredLanguage: "english",
      knownFacts: { preferredMeetingType: "zoom" },
      appointment: { meetingType: "zoom", status: "none" }
    },
    turns: [
      {
        id: "i01",
        text: "I prefer in person at the office",
        expect: {
          intent: "provide_meeting_preference",
          meetingType: "in_person",
          nextAction: "update_meeting_preference",
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "reschedule-after-confirmation",
    name: "Reschedule After Confirmation",
    category: "scheduling",
    seed: {
      preferredLanguage: "english",
      currentStage: "confirmed",
      appointment: {
        status: "confirmed",
        confirmedTime: "17:00",
        appointmentId: "sim-appt-001"
      },
      conversation: {
        lastAtlasOutboundText: "Your interview is confirmed for 5:00 PM."
      }
    },
    turns: [
      {
        id: "rs01",
        text: "Can we change it?",
        expect: {
          intent: "reschedule_request",
          nextAction: "offer_reschedule_flow",
          stage: "rescheduling",
          sideEffectsDenied: true
        }
      },
      {
        id: "rs02",
        text: "6:30?",
        setup: {
          // Still confirmed so time counteroffer maps to reschedule_request.
          appointment: {
            status: "confirmed",
            confirmedTime: "17:00",
            appointmentId: "sim-appt-001"
          },
          currentStage: "rescheduling"
        },
        expect: {
          intent: "reschedule_request",
          sideEffectsDenied: true,
          authorizationAuthorized: false
        }
      }
    ]
  },
  {
    id: "cancel-appointment",
    name: "Cancel Appointment",
    category: "scheduling",
    seed: {
      preferredLanguage: "english",
      currentStage: "confirmed",
      appointment: {
        status: "confirmed",
        confirmedTime: "17:00",
        appointmentId: "sim-appt-002"
      }
    },
    turns: [
      {
        id: "ca01",
        text: "Please cancel my appointment",
        expect: {
          intent: "cancel_request",
          nextAction: "acknowledge_cancel_no_write",
          sideEffectsDenied: true,
          authorizationAuthorized: false
        }
      }
    ]
  },
  {
    id: "duplicate-message-idempotency",
    name: "Duplicate Message / Idempotency",
    category: "reliability",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "d01",
        text: "Hello",
        inboundMessageId: "sim-wamid.dup.fixed",
        expect: {
          intent: "greeting",
          contextAdvanced: true,
          idempotent: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "d02",
        text: "Hello",
        inboundMessageId: "sim-wamid.dup.fixed",
        expect: {
          intent: "greeting",
          contextAdvanced: false,
          idempotent: true,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "unsupported-question",
    name: "Unsupported Question",
    category: "qualification",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "u01",
        text: "Tell me more about the opportunity",
        expect: {
          intent: "opportunity_question",
          nextAction: "answer_brief_value_prop_then_qualify",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "mixed-language-conversation",
    name: "Mixed-Language Conversation",
    category: "language",
    seed: { preferredLanguage: "english", languageSource: "inferred" },
    turns: [
      {
        id: "m01",
        text: "Hola",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish"
        }
      },
      {
        id: "m02",
        text: "Miami",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          preferredLanguage: "spanish",
          city: "Miami",
          state: null
        }
      }
    ]
  },
  {
    id: "fact-correction-mid-flow-question",
    name: "Fact Correction + Mid-Flow Question",
    category: "production_defect",
    description:
      "Hola → Miami, Florida → Digo, vivo en Doral → Sí tengo permiso → What is this about?",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "fc01",
        text: "Hola",
        inboundMessageId: "sim-wamid.fact-correct.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "fc02",
        text: "Miami, florida",
        inboundMessageId: "sim-wamid.fact-correct.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: "FL",
          cityCertainty: "confirmed",
          stateCertainty: "confirmed",
          shouldEscalate: false,
          nextAction: "continue_qualification",
          sideEffectsDenied: true
        }
      },
      {
        id: "fc03",
        text: "Digo, vivo en Doral",
        inboundMessageId: "sim-wamid.fact-correct.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "correct_location",
          city: "Doral",
          state: "FL",
          cityCertainty: "confirmed",
          stateCertainty: "confirmed",
          shouldEscalate: false,
          nextAction: "acknowledge_correction_then_resume",
          sideEffectsDenied: true
        }
      },
      {
        id: "fc04",
        text: "Si tengo permiso",
        inboundMessageId: "sim-wamid.fact-correct.t04",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Perfecto, gracias por aclararlo. Entonces estás en Doral, Florida. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          shouldEscalate: false,
          nextAction: "capture_authorization_continue",
          sideEffectsDenied: true
        }
      },
      {
        id: "fc05",
        text: "What is this about?",
        inboundMessageId: "sim-wamid.fact-correct.t05",
        setup: {
          lastQuestionAsked: "ask_day_part",
          lastAtlasOutboundText:
            "Perfecto, gracias. Excelente. Estamos realizando las entrevistas en nuestras oficinas."
        },
        expect: {
          intent: "opportunity_question",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          nextAction: "answer_brief_value_prop_then_qualify",
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "license-confusion-orlando-faq-flow",
    name: "License Confusion + Orlando FAQ Flow",
    category: "production_defect",
    description:
      "Orlando + 'sí, tengo licencia' must not satisfy work auth; clarify license; answer insurance/license/compensation FAQs; Zoom for out-of-area.",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "lc01",
        text: "Hola",
        inboundMessageId: "sim-wamid.license-orlando.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "lc02",
        text: "Orlando",
        inboundMessageId: "sim-wamid.license-orlando.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Orlando",
          proposedState: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "lc03",
        text: "sí",
        inboundMessageId: "sim-wamid.license-orlando.t03",
        setup: {
          lastQuestionAsked: "confirm_location",
          lastAtlasOutboundText: "Perfecto. ¿Orlando, Florida?",
          knownFacts: {
            city: "Orlando",
            proposedState: "FL",
            cityCertainty: "partial",
            stateCertainty: "proposed"
          }
        },
        expect: {
          intent: "provide_location",
          city: "Orlando",
          state: "FL",
          shouldEscalate: false,
          nextAction: "continue_qualification",
          sideEffectsDenied: true
        }
      },
      {
        id: "lc04",
        text: "sí, tengo licencia",
        inboundMessageId: "sim-wamid.license-orlando.t04",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "ambiguous_license_statement",
          workAuthorization: null,
          financialLicenseStatus: "unclear",
          shouldEscalate: false,
          nextAction: "clarify_license_type",
          pendingQuestion: "clarify_license_type",
          replyIncludes: ["conducir"],
          sideEffectsDenied: true
        }
      },
      {
        id: "lc05",
        text: "de que se trata?",
        inboundMessageId: "sim-wamid.license-orlando.t05",
        expect: {
          intent: "opportunity_question",
          shouldEscalate: false,
          nextAction: "answer_brief_value_prop_then_qualify",
          pendingQuestion: "clarify_license_type",
          workAuthorization: null,
          sideEffectsDenied: true
        }
      },
      {
        id: "lc06",
        text: "vivo en Orlando, me queda muy lejos, tienes virtual?",
        inboundMessageId: "sim-wamid.license-orlando.t06",
        expect: {
          intent: "provide_meeting_preference",
          meetingType: "zoom",
          workAuthorization: null,
          shouldEscalate: false,
          replyIncludes: ["Zoom"],
          replyExcludes: ["2500 NW 79th"],
          sideEffectsDenied: true
        }
      },
      {
        id: "lc07",
        text: "Is this insurance?",
        inboundMessageId: "sim-wamid.license-orlando.t07",
        expect: {
          intent: "insurance_question",
          shouldEscalate: false,
          nextAction: "answer_insurance_faq_then_resume",
          replyIncludes: ["seguro"],
          sideEffectsDenied: true
        }
      },
      {
        id: "lc08",
        text: "Do I need a license?",
        inboundMessageId: "sim-wamid.license-orlando.t08",
        expect: {
          intent: "license_requirement_question",
          shouldEscalate: false,
          nextAction: "answer_license_requirement_then_resume",
          replyIncludes: ["licenci"],
          sideEffectsDenied: true
        }
      },
      {
        id: "lc09",
        text: "How much money do I make?",
        inboundMessageId: "sim-wamid.license-orlando.t09",
        expect: {
          intent: "compensation_question",
          shouldEscalate: false,
          nextAction: "answer_compensation_faq_then_resume",
          replyExcludes: ["$"],
          sideEffectsDenied: true
        }
      }
    ]
  }
];

module.exports = {
  RECRUIT_AI_V2_SCENARIOS
};
