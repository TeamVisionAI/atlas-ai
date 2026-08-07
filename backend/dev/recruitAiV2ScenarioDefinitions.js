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
  },
  {
    id: "work-until-5-direct-time-negotiation",
    name: "Work Until 5 + Direct Time Negotiation",
    category: "production_defect",
    description:
      "Availability constraint after 5 → 6? → 6:30? → Mejor 7 → Actually 6:30 → confirm; no handoff (BR-084).",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      currentStage: "qualification",
      knownFacts: {
        city: "Orlando",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        preferredMeetingType: "zoom",
        coverage: "OUTSIDE"
      },
      appointment: {
        status: "none",
        meetingType: "zoom",
        previouslyOfferedSlots: []
      },
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText:
          "Como estás en Orlando, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?"
      }
    },
    turns: [
      {
        id: "wt01",
        text: "Trabajo hasta las 5",
        inboundMessageId: "sim-wamid.work-until.t01",
        expect: {
          intent: "provide_availability_constraint",
          availabilityConstraintEarliest: "17:00",
          proposedTime: null,
          shouldEscalate: false,
          nextAction: "acknowledge_availability_constraint",
          sideEffectsDenied: true
        }
      },
      {
        id: "wt02",
        text: "6?",
        inboundMessageId: "sim-wamid.work-until.t02",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "18:00",
          shouldEscalate: false,
          nextAction: "acknowledge_and_check_availability",
          sideEffectsDenied: true
        }
      },
      {
        id: "wt03",
        text: "6:30?",
        inboundMessageId: "sim-wamid.work-until.t03",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "18:30",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "wt04",
        text: "Mejor 7",
        inboundMessageId: "sim-wamid.work-until.t04",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "19:00",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "wt05",
        text: "Actually 6:30",
        inboundMessageId: "sim-wamid.work-until.t05",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "18:30",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "wt06",
        text: "Sí, 6:30 está bien",
        inboundMessageId: "sim-wamid.work-until.t06",
        setup: {
          appointment: {
            status: "proposed",
            proposedTime: "18:30",
            meetingType: "zoom"
          },
          conversation: {
            lastQuestionAsked: "confirm_slot",
            lastAtlasOutboundText:
              "Entendido — prefieres 6:30 PM. Voy a revisar disponibilidad."
          }
        },
        expect: {
          intent: "schedule_confirm",
          nextAction: "create_appointment",
          shouldEscalate: false,
          authorizationAuthorized: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "orlando-outside-clears-stale-office",
    name: "Orlando Outside Clears Stale Office",
    category: "production_defect",
    description:
      "Doral office path then location correction to Orlando must re-evaluate coverage to OUTSIDE/Zoom and never keep stale office modality.",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      currentStage: "qualification",
      knownFacts: {
        city: "Doral",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        preferredMeetingType: "in_person",
        meetingPreferenceSource: "coverage_default",
        coverage: "LOCAL"
      },
      appointment: {
        status: "none",
        meetingType: "in_person"
      },
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText:
          "Excelente. Estamos realizando las entrevistas en nuestras oficinas ubicadas en 2500 NW 79th Ave, Suite 189, Doral, FL 33122. ¿Prefieres en la mañana o en la tarde?"
      }
    },
    turns: [
      {
        id: "oo01",
        text: "Digo, vivo en Orlando",
        inboundMessageId: "sim-wamid.orlando-outside.t01",
        expect: {
          intent: "correct_location",
          city: "Orlando",
          state: "FL",
          meetingType: "zoom",
          shouldEscalate: false,
          nextAction: "acknowledge_correction_then_resume",
          replyIncludes: ["Zoom", "Orlando"],
          replyExcludes: ["2500 NW 79th"],
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "orlando-clean-zoom-path",
    name: "Orlando Clean Zoom Path",
    category: "production_defect",
    description: "Clean Orlando → FL → work auth must offer Zoom, never Doral office.",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "oz01",
        text: "Hola",
        inboundMessageId: "sim-wamid.orlando-clean.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "oz02",
        text: "Orlando",
        inboundMessageId: "sim-wamid.orlando-clean.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Orlando",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "oz03",
        text: "sí",
        inboundMessageId: "sim-wamid.orlando-clean.t03",
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
          sideEffectsDenied: true
        }
      },
      {
        id: "oz04",
        text: "Sí tengo permiso de trabajo",
        inboundMessageId: "sim-wamid.orlando-clean.t04",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          meetingType: "zoom",
          shouldEscalate: false,
          nextAction: "capture_authorization_continue",
          replyIncludes: ["Zoom"],
          replyExcludes: ["2500 NW 79th", "oficinas"],
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "orlando-scheduling-date-change-cancellation",
    name: "Orlando Scheduling Date Change + Cancellation",
    category: "production_defect",
    description:
      "OUTSIDE in-person travel confirm → after-5 → 7 PM → Monday (keep 7 PM, never 12 AM) → Tuesday → cancel/withdraw (BR-085).",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      currentStage: "scheduling",
      timezone: "America/New_York",
      testNow: "2026-08-07T15:00:00.000-04:00",
      knownFacts: {
        city: "Orlando",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        preferredMeetingType: "zoom",
        meetingPreferenceSource: "coverage_default",
        coverage: "OUTSIDE",
        availabilityConstraint: {
          type: "availability_constraint",
          earliestTime: "17:00",
          dayPart: "evening",
          explicitCandidateTime: null,
          raw: "trabajo hasta las 5"
        },
        preferredDayPart: "evening"
      },
      appointment: {
        status: "proposed",
        meetingType: "zoom",
        proposedTime: "19:00",
        previouslyOfferedSlots: []
      },
      conversation: {
        lastQuestionAsked: "confirm_slot",
        lastAtlasOutboundText:
          "Entendido — prefieres 7:00 PM. Voy a revisar disponibilidad."
      }
    },
    turns: [
      {
        id: "od01",
        text: "pensándolo mejor, prefiero en persona",
        inboundMessageId: "sim-wamid.orlando-date.t01",
        expect: {
          intent: "provide_meeting_preference",
          meetingType: "zoom",
          meetingTypeRequested: "in_person",
          meetingTypeConfirmed: false,
          meetingPreferenceSource: "prospect_requested",
          nextAction: "confirm_in_person_travel",
          replyIncludes: ["Doral", "2500 NW 79th"],
          replyExcludes: ["12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "od02",
        text: "sí, puedo ir a Doral",
        inboundMessageId: "sim-wamid.orlando-date.t02",
        expect: {
          intent: "confirm_in_person_travel",
          meetingType: "in_person",
          meetingTypeConfirmed: true,
          meetingPreferenceSource: "prospect_confirmed",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "od03",
        text: "después de las 5",
        inboundMessageId: "sim-wamid.orlando-date.t03",
        expect: {
          intent: "provide_availability_constraint",
          availabilityConstraintEarliest: "17:00",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "od04",
        text: "puede ser a las 7",
        inboundMessageId: "sim-wamid.orlando-date.t04",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "19:00",
          replyExcludes: ["12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "od05",
        text: "no puedo ni hoy ni mañana, ¿puede ser el lunes?",
        inboundMessageId: "sim-wamid.orlando-date.t05",
        expect: {
          intent: "scheduling_date_proposal",
          proposedDate: "2026-08-10",
          proposedTime: "19:00",
          dateExclusions: ["2026-08-07", "2026-08-08"],
          replyIncludes: ["lunes", "7:00 PM"],
          replyExcludes: ["12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "od06",
        text: "mejor el martes",
        inboundMessageId: "sim-wamid.orlando-date.t06",
        expect: {
          intent: "scheduling_date_proposal",
          proposedDate: "2026-08-11",
          proposedTime: "19:00",
          replyIncludes: ["martes", "7:00 PM"],
          replyExcludes: ["12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "od07",
        text: "mejor cancélalo, cambié de idea",
        inboundMessageId: "sim-wamid.orlando-date.t07",
        expect: {
          intent: "withdraw_interest",
          stage: "withdrawn",
          nextAction: "acknowledge_withdraw_no_write",
          proposedSideEffectsInclude: ["withdraw_prospect", "cancel_appointment"],
          replyExcludes: [
            "12:00 AM",
            "dato que te acabo de pedir",
            "Could you share the detail"
          ],
          authorizationAuthorized: false,
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "natural-language-opt-out",
    name: "Natural Language Opt-Out",
    category: "production_defect",
    description:
      "Stop-contact phrases must become opt_out_request, never correct_location (BR-086).",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      currentStage: "greeting",
      knownFacts: {},
      appointment: { status: "none" },
      conversation: {}
    },
    turns: [
      {
        id: "nl01",
        text: "Hola",
        inboundMessageId: "sim-wamid.nl-optout.t01",
        expect: {
          intent: "greeting",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "nl02",
        text: "Miami, Florida",
        inboundMessageId: "sim-wamid.nl-optout.t02",
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "nl03",
        text: "Sí tengo permiso",
        inboundMessageId: "sim-wamid.nl-optout.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "nl04",
        text: "no more messages",
        inboundMessageId: "sim-wamid.nl-optout.t04",
        expect: {
          intent: "opt_out_request",
          stage: "withdrawn",
          city: "Miami",
          nextAction: "acknowledge_opt_out_no_write",
          proposedSideEffectsInclude: ["communication_opt_out"],
          replyExcludes: [
            "mañana o en la tarde",
            "dato que te acabo de pedir",
            "city and state",
            "¿Prefieres"
          ],
          authorizationAuthorized: false,
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  }
];

module.exports = {
  RECRUIT_AI_V2_SCENARIOS
};
