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
          state: "FL",
          cityCertainty: "confirmed",
          stateCertainty: "confirmed",
          proposedState: null,
          requiresClarification: false,
          shouldEscalate: false,
          nextAction: "continue_qualification",
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
          city: "Miami",
          state: "FL",
          requiresClarification: false
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
          state: "FL",
          proposedState: null,
          requiresClarification: false
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
          state: "FL",
          proposedState: null,
          requiresClarification: false
        }
      },
      {
        id: "p02",
        text: "Doral",
        setup: { lastQuestionAsked: "ask_location" },
        expect: {
          intent: "provide_location",
          city: "Doral",
          state: "FL",
          proposedState: null
        }
      },
      {
        id: "p03",
        text: "Orlando",
        setup: { lastQuestionAsked: "ask_location" },
        expect: {
          intent: "provide_location",
          city: "Orlando",
          state: "FL",
          proposedState: null
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
          intent: "job_opportunity_question",
          nextAction: "answer_job_opportunity_then_resume",
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
          state: "FL"
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
          intent: "job_opportunity_question",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          nextAction: "answer_job_opportunity_then_resume",
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
          state: "FL",
          proposedState: null,
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
          intent: "job_opportunity_question",
          shouldEscalate: false,
          nextAction: "answer_job_opportunity_then_resume",
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
            // BR-103 — "revisar disponibilidad" is not a confirmable proposal.
            lastQuestionAsked: "awaiting_availability",
            lastAtlasOutboundText:
              "Entendido — prefieres 6:30 PM. Voy a revisar disponibilidad."
          }
        },
        expect: {
          intent: "soft_acknowledgement",
          nextAction: "acknowledge_soft_continue",
          shouldEscalate: false,
          authorizationAuthorized: false,
          sideEffectsDenied: true,
          replyExcludes: [
            "anoté tu confirmación",
            "compañero finalizará",
            "teammate will finalize"
          ]
        }
      },
      {
        id: "wt07",
        text: "ok",
        inboundMessageId: "sim-wamid.work-until.t07",
        setup: {
          appointment: {
            status: "proposed",
            proposedTime: "18:30",
            proposedDate: "2026-08-11",
            meetingType: "zoom",
            previouslyOfferedSlots: [
              { date: "2026-08-11", time: "18:30", timezone: "America/New_York" }
            ]
          },
          conversation: {
            lastQuestionAsked: "confirm_slot",
            lastAtlasOutboundText:
              "Tenemos disponible el lunes a las 6:30 PM por Zoom. ¿Te funciona?"
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
  },
  {
    id: "long-scheduling-memory-modality-zoom-link",
    name: "Long Scheduling Memory + Modality + Zoom Link",
    category: "production_defect",
    description:
      "Preserve Tue 6:30 / after-5 across in-person↔Zoom; Zoom-link logistics; repetition; Wednesday date change; clean withdraw (BR-087).",
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
        meetingTypeConfirmed: true,
        coverage: "OUTSIDE",
        availabilityConstraint: {
          type: "availability_constraint",
          earliestTime: "17:00",
          dayPart: "evening",
          explicitCandidateTime: null,
          raw: "despues de las 5"
        },
        preferredDayPart: "evening"
      },
      appointment: {
        status: "proposed",
        meetingType: "zoom",
        proposedTime: "18:30",
        proposedDate: "2026-08-11",
        proposedDateLabel: "martes",
        previouslyOfferedSlots: [],
        location: null
      },
      conversation: {
        lastQuestionAsked: "confirm_slot",
        lastAtlasOutboundText:
          "Entendido — prefieres el martes a las 6:30 PM. ¿Te funciona?"
      }
    },
    turns: [
      {
        id: "sm01",
        text: "Prefiero en persona",
        inboundMessageId: "sim-wamid.sched-memory.t01",
        expect: {
          intent: "provide_meeting_preference",
          meetingType: "zoom",
          meetingTypeRequested: "in_person",
          meetingTypeConfirmed: false,
          proposedTime: "18:30",
          proposedDate: "2026-08-11",
          nextAction: "confirm_in_person_travel",
          replyIncludes: ["Doral"],
          replyExcludes: ["mañana o en la tarde", "12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sm02",
        text: "Sí, puedo ir a Doral",
        inboundMessageId: "sim-wamid.sched-memory.t02",
        expect: {
          intent: "confirm_in_person_travel",
          meetingType: "in_person",
          meetingTypeConfirmed: true,
          proposedTime: "18:30",
          proposedDate: "2026-08-11",
          replyIncludes: ["Doral", "6:30"],
          replyExcludes: ["mañana o en la tarde", "12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sm03",
        text: "Actually, mejor Zoom",
        inboundMessageId: "sim-wamid.sched-memory.t03",
        expect: {
          intent: "provide_meeting_preference",
          meetingType: "zoom",
          proposedTime: "18:30",
          proposedDate: "2026-08-11",
          replyIncludes: ["Zoom", "6:30"],
          replyExcludes: ["2500 NW 79th", "mañana o en la tarde", "oficinas"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sm04",
        text: "¿Me puedes mandar el link?",
        inboundMessageId: "sim-wamid.sched-memory.t04",
        expect: {
          intent: "meeting_access_request",
          nextAction: "acknowledge_meeting_access",
          proposedTime: "18:30",
          proposedDate: "2026-08-11",
          proposedSideEffectsInclude: ["share_zoom_link"],
          replyIncludes: ["confirmemos", "6:30"],
          replyExcludes: ["zoom.us", "mañana o en la tarde", "dato que te acabo de pedir"],
          authorizationAuthorized: false,
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sm05",
        text: "ya te dije que despues de las 5",
        inboundMessageId: "sim-wamid.sched-memory.t05",
        expect: {
          availabilityConstraintEarliest: "17:00",
          proposedTime: "18:30",
          proposedDate: "2026-08-11",
          replyIncludes: ["razón", "5"],
          replyExcludes: ["mañana o en la tarde"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sm06",
        text: "Cámbialo para el miércoles",
        inboundMessageId: "sim-wamid.sched-memory.t06",
        expect: {
          intent: "scheduling_date_proposal",
          proposedDate: "2026-08-12",
          proposedTime: "18:30",
          replyIncludes: ["miércoles", "6:30"],
          replyExcludes: ["12:00 AM", "mañana o en la tarde"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sm07",
        text: "Mejor cancélalo, cambié de idea",
        inboundMessageId: "sim-wamid.sched-memory.t07",
        expect: {
          intent: "withdraw_interest",
          stage: "withdrawn",
          nextAction: "acknowledge_withdraw_no_write",
          proposedSideEffectsInclude: ["withdraw_prospect", "cancel_appointment"],
          replyIncludes: ["Gracias", "éxito"],
          replyExcludes: [
            "Un compañero puede reabrirlo",
            "reabrir",
            "dato que te acabo de pedir",
            "12:00 AM"
          ],
          authorizationAuthorized: false,
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "tampa-faq-day-part-continuity",
    name: "Tampa FAQ + Day-Part Continuity",
    category: "production_defect",
    description:
      "Job/compensation FAQ outranks scheduling; mañana=morning; meta-conversation explains pending time (BR-088).",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      currentStage: "greeting",
      timezone: "America/New_York",
      testNow: "2026-08-07T15:00:00.000-04:00",
      knownFacts: {},
      appointment: { status: "none" },
      conversation: {}
    },
    turns: [
      {
        id: "tf01",
        text: "Hola",
        inboundMessageId: "sim-wamid.tampa-faq.t01",
        expect: {
          intent: "greeting",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf02",
        text: "Tampa, Florida",
        inboundMessageId: "sim-wamid.tampa-faq.t02",
        expect: {
          intent: "provide_location",
          city: "Tampa",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf03",
        text: "Sí tengo permiso de trabajo",
        inboundMessageId: "sim-wamid.tampa-faq.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          meetingType: "zoom",
          replyIncludes: ["Zoom", "mañana"],
          replyExcludes: ["2500 NW 79th"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf04",
        text: "Esto es un trabajo",
        inboundMessageId: "sim-wamid.tampa-faq.t04",
        expect: {
          intent: "job_opportunity_question",
          nextAction: "answer_job_opportunity_then_resume",
          replyIncludes: ["oportunidad", "servicios financieros"],
          replyExcludes: [
            "Esa hora puede no estar disponible",
            "dato que te acabo de pedir",
            "Continuemos."
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf05",
        text: "¿Esto es un trabajo?",
        inboundMessageId: "sim-wamid.tampa-faq.t05",
        expect: {
          intent: "job_opportunity_question",
          replyIncludes: ["oportunidad"],
          replyExcludes: [
            "Esa hora puede no estar disponible",
            "dato que te acabo de pedir"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf06",
        text: "¿Es salario o comisión?",
        inboundMessageId: "sim-wamid.tampa-faq.t06",
        expect: {
          intent: "compensation_question",
          replyIncludes: ["mañana"],
          replyExcludes: ["Esa hora puede no estar disponible", "Continuemos."],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf07",
        text: "mañana",
        inboundMessageId: "sim-wamid.tampa-faq.t07",
        expect: {
          intent: "provide_day_part",
          nextAction: "acknowledge_day_part_ask_time",
          replyIncludes: ["hora", "mañana"],
          replyExcludes: ["Continuemos.", "Esa hora puede no estar disponible"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "tf08",
        text: "continuemos con que?",
        inboundMessageId: "sim-wamid.tampa-faq.t08",
        expect: {
          intent: "conversation_clarification_request",
          nextAction: "explain_pending_then_ask",
          replyIncludes: ["hora", "mañana"],
          replyExcludes: [
            "dato que te acabo de pedir",
            "Continuemos.",
            "Esa hora puede no estar disponible"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "license-requirement-preserves-day-part",
    name: "License Requirement Preserves Day-Part",
    category: "production_defect",
    description:
      "¿Tengo que tener licencia? is license FAQ (not ambiguous); mañana after FAQ remains morning (BR-089).",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation",
      currentStage: "greeting",
      timezone: "America/New_York",
      testNow: "2026-08-07T15:00:00.000-04:00",
      knownFacts: {},
      appointment: { status: "none" },
      conversation: {}
    },
    turns: [
      {
        id: "lr01",
        text: "Hola",
        inboundMessageId: "sim-wamid.license-req.t01",
        expect: {
          intent: "greeting",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "lr02",
        text: "Tampa, Florida",
        inboundMessageId: "sim-wamid.license-req.t02",
        expect: {
          intent: "provide_location",
          city: "Tampa",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "lr03",
        text: "Sí tengo permiso de trabajo",
        inboundMessageId: "sim-wamid.license-req.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          meetingType: "zoom",
          replyIncludes: ["Zoom", "mañana"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "lr04",
        text: "¿Tengo que tener licencia?",
        inboundMessageId: "sim-wamid.license-req.t04",
        expect: {
          intent: "license_requirement_question",
          nextAction: "answer_license_requirement_then_resume",
          pendingQuestion: "ask_day_part",
          replyIncludes: ["licenci", "mañana"],
          replyExcludes: [
            "conducir",
            "Esa hora puede no estar disponible",
            "2-14",
            "2-15",
            "214",
            "215",
            "$"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "lr05",
        text: "mañana",
        inboundMessageId: "sim-wamid.license-req.t05",
        expect: {
          intent: "provide_day_part",
          nextAction: "acknowledge_day_part_ask_time",
          replyIncludes: ["hora", "mañana"],
          replyExcludes: ["sábado", "Continuemos.", "12:00 AM"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "puerto-rico-fixed-employment-real-world",
    name: "Puerto Rico Work Auth + Fixed-Employment Preference",
    category: "real_world_regression",
    description:
      "BR-090 — Kissimmee/PR work-auth, job FAQ interrupt, fixed-employment preference, polite not-now closure",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation"
    },
    turns: [
      {
        id: "pr01",
        text: "¡Hola! Quiero más información",
        inboundMessageId: "sim-wamid.pr-fixed.t01",
        expect: {
          intent: "job_opportunity_question",
          replyIncludes: ["pediste más información", "ciudad y estado"],
          replyExcludes: ["servicios financieros"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "pr02",
        text: "Kissimmee fl",
        inboundMessageId: "sim-wamid.pr-fixed.t02",
        expect: {
          intent: "provide_location",
          city: "Kissimmee",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "pr03",
        text: "Si soy de PR",
        inboundMessageId: "sim-wamid.pr-fixed.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          meetingType: "zoom",
          replyIncludes: ["Zoom"],
          replyExcludes: [
            "permiso de trabajo",
            "documentación legal",
            "país extranjero",
            "foreign"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "pr04",
        text: "De q trata el trabajo?",
        inboundMessageId: "sim-wamid.pr-fixed.t04",
        expect: {
          intent: "job_opportunity_question",
          nextAction: "answer_job_opportunity_then_resume",
          replyExcludes: [
            "Esa hora puede no estar disponible",
            "permiso de trabajo"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "pr05",
        text: "No es un sueldo fijo",
        inboundMessageId: "sim-wamid.pr-fixed.t05",
        expect: {
          intent: "compensation_question",
          nextAction: "answer_compensation_faq_then_resume",
          replyIncludes: ["sueldo"],
          replyExcludes: ["$", "ganarás", "te garantizamos"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "pr06",
        text: "Estoy buscando empleo fijo",
        inboundMessageId: "sim-wamid.pr-fixed.t06",
        expect: {
          intent: "fixed_employment_preference",
          nextAction: "acknowledge_fixed_employment_preference",
          replyIncludes: ["sueldo fijo"],
          replyExcludes: [
            "mañana",
            "tarde",
            "te deseo mucho éxito",
            "no recibir más mensajes",
            "conectarte con"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "pr07",
        text: "Por el momento mi enfoque es encontrar trabajo",
        inboundMessageId: "sim-wamid.pr-fixed.t07",
        expect: {
          intent: "current_not_fit",
          nextAction: "acknowledge_current_not_fit_no_write",
          stage: "current_not_fit",
          replyIncludes: ["éxito"],
          replyExcludes: [
            "mañana",
            "tarde",
            "licencia",
            "no recibir más mensajes",
            "conectarte con",
            "compañero",
            "¿"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "direct-no-interest-withdrawal",
    name: "Direct No-Interest Withdrawal",
    category: "real_world_regression",
    description:
      "BR-091 — bare 'No me interesa' withdraws recruiting without opt-out or scheduling resume",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "active_conversation"
    },
    turns: [
      {
        id: "ni01",
        text: "Hola",
        inboundMessageId: "sim-wamid.direct-no-interest.t01",
        expect: {
          intent: "greeting",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "ni02",
        text: "Kissimmee, Florida",
        inboundMessageId: "sim-wamid.direct-no-interest.t02",
        expect: {
          intent: "provide_location",
          city: "Kissimmee",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "ni03",
        text: "Sí tengo permiso de trabajo",
        inboundMessageId: "sim-wamid.direct-no-interest.t03",
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
        id: "ni04",
        text: "No me interesa",
        inboundMessageId: "sim-wamid.direct-no-interest.t04",
        expect: {
          intent: "withdraw_interest",
          stage: "withdrawn",
          nextAction: "acknowledge_withdraw_no_write",
          replyIncludes: ["Gracias", "éxito"],
          replyExcludes: [
            "mañana",
            "tarde",
            "permiso",
            "no recibir más mensajes",
            "compañero",
            "conectarte",
            "¿"
          ],
          proposedSideEffectsInclude: ["withdraw_prospect"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "city-state-abbreviation-normalization",
    name: "City-State Abbreviation Normalization",
    category: "production_defect",
    description:
      "BR-094 — Hola → miami fl (confirmed Miami/FL) → work auth; correction Miami FL → Orlando FL",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "cs01",
        text: "Hola",
        inboundMessageId: "sim-wamid.city-state-abbr.t01",
        expect: {
          intent: "greeting",
          messageLanguage: "spanish",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cs02",
        text: "miami fl",
        inboundMessageId: "sim-wamid.city-state-abbr.t02",
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
          requiresClarification: false,
          shouldEscalate: false,
          nextAction: "continue_qualification",
          replyIncludes: ["permiso"],
          replyExcludes: [
            "Con gusto te ayudo",
            "ciudad y estado",
            "¿en qué ciudad"
          ],
          sideEffectsDenied: true
        }
      },
      {
        id: "cs03",
        text: "Sí tengo permiso de trabajo",
        inboundMessageId: "sim-wamid.city-state-abbr.t03",
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
        id: "cs04",
        text: "Actually Orlando FL",
        inboundMessageId: "sim-wamid.city-state-abbr.t04",
        expect: {
          intent: "correct_location",
          city: "Orlando",
          state: "FL",
          cityCertainty: "confirmed",
          stateCertainty: "confirmed",
          preferredMeetingType: "zoom",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "faq-priority-experience-insurance",
    name: "FAQ Priority — Experience + Insurance",
    category: "production_defect",
    description:
      "BR-098 — experience/insurance FAQs outrank location; day-part preserved after overview.",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "fe01",
        text: "Hola",
        inboundMessageId: "sim-wamid.faq-priority.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "fe02",
        text: "Miami FL",
        inboundMessageId: "sim-wamid.faq-priority.t02",
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
          sideEffectsDenied: true
        }
      },
      {
        id: "fe03",
        text: "residente",
        inboundMessageId: "sim-wamid.faq-priority.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          shouldEscalate: false,
          pendingQuestion: "ask_day_part",
          sideEffectsDenied: true
        }
      },
      {
        id: "fe04",
        text: "de que se trata",
        inboundMessageId: "sim-wamid.faq-priority.t04",
        expect: {
          intent: "job_opportunity_question",
          shouldEscalate: false,
          pendingQuestion: "ask_day_part",
          replyIncludes: ["servicios financieros"],
          replyExcludes: ["asalariado", "No se requiere experiencia"],
          sideEffectsDenied: true
        }
      },
      {
        id: "fe05",
        text: "necesito experiencia?",
        inboundMessageId: "sim-wamid.faq-priority.t05",
        expect: {
          intent: "experience_question",
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          pendingQuestion: "ask_day_part",
          replyIncludes: ["experiencia previa", "mañana o en la tarde"],
          replyExcludes: [
            "Necesito Experiencia",
            "¿En qué estado",
            "Con gusto te ayudo"
          ],
          sideEffectsDenied: true
        }
      },
      {
        id: "fe06",
        text: "es de seguros?",
        inboundMessageId: "sim-wamid.faq-priority.t06",
        expect: {
          intent: "insurance_question",
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          pendingQuestion: "ask_day_part",
          replyExcludes: [
            "Necesito Experiencia",
            "Con gusto te ayudo",
            "compañero de Team Vision te contactará"
          ],
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "acknowledgement-not-confirmation-network-objection",
    name: "Acknowledgement Not Confirmation + Network Objection",
    category: "production_defect",
    description:
      "BR-103 — ok after availability-pending is not appointment confirm; no conozco a nadie is network_objection.",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "an01",
        text: "hola",
        inboundMessageId: "sim-wamid.ack-network.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "an02",
        text: "florida",
        inboundMessageId: "sim-wamid.ack-network.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          state: "FL",
          pendingQuestion: "ask_city",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "an03",
        text: "Orlando",
        inboundMessageId: "sim-wamid.ack-network.t03",
        expect: {
          intent: "provide_location",
          city: "Orlando",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "an04",
        text: "si soy residente",
        inboundMessageId: "sim-wamid.ack-network.t04",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          pendingQuestion: "ask_day_part",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "an05",
        text: "en la manana",
        inboundMessageId: "sim-wamid.ack-network.t05",
        expect: {
          intent: "provide_day_part",
          dayPart: "morning",
          pendingQuestion: "ask_time_preference",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "an06",
        text: "10",
        inboundMessageId: "sim-wamid.ack-network.t06",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "10:00",
          pendingQuestion: "awaiting_availability",
          shouldEscalate: false,
          sideEffectsDenied: true,
          replyExcludes: ["anoté tu confirmación", "compañero finalizará"]
        }
      },
      {
        id: "an07",
        text: "ok",
        inboundMessageId: "sim-wamid.ack-network.t07",
        expect: {
          intent: "soft_acknowledgement",
          nextAction: "acknowledge_soft_continue",
          proposedTime: "10:00",
          pendingQuestion: "awaiting_availability",
          shouldEscalate: false,
          sideEffectsDenied: true,
          replyExcludes: [
            "anoté tu confirmación",
            "compañero finalizará",
            "dato que te acabo"
          ]
        }
      },
      {
        id: "an08",
        text: "no conozco a nadie",
        inboundMessageId: "sim-wamid.ack-network.t08",
        expect: {
          intent: "network_objection",
          proposedTime: "10:00",
          dayPart: "morning",
          pendingQuestion: "awaiting_availability",
          replyIncludes: ["entrenamiento", "red de contactos"],
          replyExcludes: [
            "dato que te acabo",
            "compañero de Team Vision te contactará",
            "garantiz",
            "te conseguimos clientes",
            "te damos leads"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "sales-objection-not-location",
    name: "Sales Objection Not Location",
    category: "production_defect",
    description:
      "BR-099 — 'no se vender' is a sales objection, never city/correction Vender.",
    seed: {
      preferredLanguage: "english",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "so01",
        text: "Hola",
        inboundMessageId: "sim-wamid.sales-objection.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "so02",
        text: "Miami FL",
        inboundMessageId: "sim-wamid.sales-objection.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "so03",
        text: "residente",
        inboundMessageId: "sim-wamid.sales-objection.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          pendingQuestion: "ask_day_part",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "so04",
        text: "de que se trata",
        inboundMessageId: "sim-wamid.sales-objection.t04",
        expect: {
          intent: "job_opportunity_question",
          pendingQuestion: "ask_day_part",
          replyIncludes: ["servicios financieros"],
          replyExcludes: ["asalariado"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "so05",
        text: "no se vender",
        inboundMessageId: "sim-wamid.sales-objection.t05",
        expect: {
          intent: "sales_objection",
          city: "Miami",
          state: "FL",
          pendingQuestion: "ask_day_part",
          replyIncludes: ["saber vender", "mañana o en la tarde"],
          replyExcludes: [
            "Vender",
            "corrección",
            "¿En qué estado",
            "esto no es ventas",
            "compañero de Team Vision te contactará"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "compensation-faq-during-ask-time",
    name: "Compensation FAQ During Ask Time",
    category: "production_defect",
    description:
      "BR-104 — entonces como voy a ganar dinero during ask_time is compensation_question; resume afternoon time ask.",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "cf01",
        text: "hola",
        inboundMessageId: "sim-wamid.comp-faq.t01",
        expect: {
          intent: "greeting",
          preferredLanguage: "spanish",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cf02",
        text: "Miami FL",
        inboundMessageId: "sim-wamid.comp-faq.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cf03",
        text: "si",
        inboundMessageId: "sim-wamid.comp-faq.t03",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cf04",
        text: "si soy residente",
        inboundMessageId: "sim-wamid.comp-faq.t04",
        setup: {
          lastQuestionAsked: "ask_authorization",
          lastAtlasOutboundText:
            "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
        },
        expect: {
          intent: "provide_authorization",
          workAuthorization: true,
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cf05",
        text: "de que se trata",
        inboundMessageId: "sim-wamid.comp-faq.t05",
        expect: {
          intent: "job_opportunity_question",
          shouldEscalate: false,
          replyExcludes: ["Con gusto te ayudo"],
          sideEffectsDenied: true
        }
      },
      {
        id: "cf06",
        text: "no conozco a nadie",
        inboundMessageId: "sim-wamid.comp-faq.t06",
        expect: {
          intent: "network_objection",
          city: "Miami",
          state: "FL",
          workAuthorization: true,
          shouldEscalate: false,
          replyExcludes: ["Con gusto te ayudo", "dato que te acabo"],
          sideEffectsDenied: true
        }
      },
      {
        id: "cf07",
        text: "tarde",
        inboundMessageId: "sim-wamid.comp-faq.t07",
        setup: {
          lastQuestionAsked: "ask_day_part",
          lastAtlasOutboundText:
            "Excelente. Estamos realizando las entrevistas en nuestras oficinas ubicadas en 2500 NW 79th Ave, Suite 189, Doral, FL 33122. ¿Prefieres en la mañana o en la tarde?"
        },
        expect: {
          intent: "provide_day_part",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cf08",
        text: "entonces como voy a ganar dinero?",
        inboundMessageId: "sim-wamid.comp-faq.t08",
        expect: {
          intent: "compensation_question",
          nextAction: "answer_compensation_faq_then_resume",
          city: "Miami",
          state: "FL",
          workAuthorization: true,
          dayPart: "afternoon",
          meetingType: "in_person",
          pendingQuestion: "ask_time_preference",
          shouldEscalate: false,
          sideEffectsDenied: true,
          replyIncludes: ["producción", "hora en la tarde"],
          replyExcludes: [
            "Con gusto te ayudo",
            "dato que te acabo",
            "ilimitad",
            "garantizado $",
            "compañero de Team Vision te contactará",
            "mañana o en la tarde",
            "Por cierto"
          ]
        }
      }
    ]
  },
  {
    id: "constraint-preserving-resume-compensation",
    name: "Constraint-Preserving Resume + Direct Compensation",
    category: "production_defect",
    description:
      "BR-105 — after-5 earliestTime survives FAQ interruptions; resume asks after-5 time; direct commission/salary/hourly answers; no Por cierto.",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "cp01",
        text: "hola",
        inboundMessageId: "sim-wamid.constraint-resume.t01",
        expect: {
          intent: "greeting",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp02",
        text: "miami fl",
        inboundMessageId: "sim-wamid.constraint-resume.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          state: "FL",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp03",
        text: "si soy residente",
        inboundMessageId: "sim-wamid.constraint-resume.t03",
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
        id: "cp04",
        text: "de que se trata",
        inboundMessageId: "sim-wamid.constraint-resume.t04",
        expect: {
          intent: "job_opportunity_question",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp05",
        text: "no conozco a nadie",
        inboundMessageId: "sim-wamid.constraint-resume.t05",
        expect: {
          intent: "network_objection",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp06",
        text: "tarde",
        inboundMessageId: "sim-wamid.constraint-resume.t06",
        setup: {
          lastQuestionAsked: "ask_day_part",
          lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
        },
        expect: {
          intent: "provide_day_part",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp07",
        text: "entonces como voy a ganar dinero?",
        inboundMessageId: "sim-wamid.constraint-resume.t07",
        expect: {
          intent: "compensation_question",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          replyExcludes: ["Por cierto", "Con gusto te ayudo"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp08",
        text: "despues de las 5",
        inboundMessageId: "sim-wamid.constraint-resume.t08",
        expect: {
          intent: "provide_availability_constraint",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          replyIncludes: ["después de las 5"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp09",
        text: "a como la hora?",
        inboundMessageId: "sim-wamid.constraint-resume.t09",
        expect: {
          intent: "compensation_question",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          replyIncludes: ["No.", "después de las 5"],
          replyExcludes: [
            "Por cierto",
            "hora en la tarde te funciona",
            "$",
            "Con gusto te ayudo"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp10",
        text: "es salario fijo?",
        inboundMessageId: "sim-wamid.constraint-resume.t10",
        expect: {
          intent: "compensation_question",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          replyIncludes: ["No.", "después de las 5"],
          replyExcludes: ["Por cierto", "hora en la tarde te funciona"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "cp11",
        text: "es por comision?",
        inboundMessageId: "sim-wamid.constraint-resume.t11",
        expect: {
          intent: "compensation_question",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          replyIncludes: ["Sí.", "producción", "después de las 5"],
          replyExcludes: [
            "Por cierto",
            "hora en la tarde te funciona",
            "%",
            "ilimitad"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "short-pay-mechanics-como-pagan",
    name: "Short Pay-Mechanics: como pagan",
    category: "production_defect",
    description:
      "BR-106 — como pagan is pay_how compensation during awaiting_availability; no Continuemos; preserve 17:30 preference.",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "inferred"
    },
    turns: [
      {
        id: "sp01",
        text: "hola",
        inboundMessageId: "sim-wamid.short-pay.t01",
        expect: {
          intent: "greeting",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp02",
        text: "Miami",
        inboundMessageId: "sim-wamid.short-pay.t02",
        setup: {
          lastQuestionAsked: "ask_location",
          lastAtlasOutboundText: "Hola, ¿en qué ciudad y estado vives?"
        },
        expect: {
          intent: "provide_location",
          city: "Miami",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp03",
        text: "si",
        inboundMessageId: "sim-wamid.short-pay.t03",
        setup: {
          lastQuestionAsked: "confirm_location",
          lastAtlasOutboundText: "Perfecto. ¿Miami, Florida?"
        },
        expect: {
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp04",
        text: "soy residente",
        inboundMessageId: "sim-wamid.short-pay.t04",
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
        id: "sp05",
        text: "tarde",
        inboundMessageId: "sim-wamid.short-pay.t05",
        setup: {
          lastQuestionAsked: "ask_day_part",
          lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
        },
        expect: {
          intent: "provide_day_part",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp06",
        text: "despues de las 5",
        inboundMessageId: "sim-wamid.short-pay.t06",
        expect: {
          intent: "provide_availability_constraint",
          dayPart: "afternoon",
          pendingQuestion: "ask_time_preference",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp07",
        text: "5:30",
        inboundMessageId: "sim-wamid.short-pay.t07",
        expect: {
          intent: "scheduling_counteroffer",
          proposedTime: "17:30",
          pendingQuestion: "awaiting_availability",
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp08",
        text: "ok",
        inboundMessageId: "sim-wamid.short-pay.t08",
        expect: {
          intent: "soft_acknowledgement",
          proposedTime: "17:30",
          pendingQuestion: "awaiting_availability",
          shouldEscalate: false,
          sideEffectsDenied: true,
          replyExcludes: ["anoté tu confirmación", "compañero finalizará"]
        }
      },
      {
        id: "sp09",
        text: "a como la hora?",
        inboundMessageId: "sim-wamid.short-pay.t09",
        expect: {
          intent: "compensation_question",
          proposedTime: "17:30",
          pendingQuestion: "awaiting_availability",
          replyIncludes: ["No."],
          replyExcludes: ["Continuemos", "Por cierto", "$"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      },
      {
        id: "sp10",
        text: "como pagan?",
        inboundMessageId: "sim-wamid.short-pay.t10",
        expect: {
          intent: "compensation_question",
          proposedTime: "17:30",
          pendingQuestion: "awaiting_availability",
          replyIncludes: ["producción"],
          replyExcludes: [
            "Continuemos",
            "Gracias — eso ayuda",
            "Por cierto",
            "anoté tu confirmación",
            "$",
            "%"
          ],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "readonly-slot-offering-after-constraint",
    name: "BR-107/108 Read-only rolling slot offering after constraint",
    category: "scheduling",
    description:
      "BR-108 — after-5 without date uses rolling fixture search and offers real Tuesday slots.",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "inferred",
      agentId: "agent-fixture-br107",
      testNow: "2026-08-07T15:00:00.000-04:00",
      availabilityFixture: {
        timezone: "America/New_York",
        slots: [
          { dateKey: "2026-08-11", timeKey: "17:30" },
          { dateKey: "2026-08-11", timeKey: "18:00" },
          { dateKey: "2026-08-11", timeKey: "19:00" }
        ]
      },
      knownFacts: {
        city: "Miami",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        preferredDayPart: "afternoon",
        preferredMeetingType: "in_person"
      },
      currentStage: "scheduling",
      conversation: {
        lastQuestionAsked: "ask_time_preference",
        lastAtlasOutboundText: "¿Qué hora en la tarde te funciona mejor?"
      }
    },
    turns: [
      {
        id: "ro01",
        text: "despues de las 5",
        inboundMessageId: "sim-wamid.readonly-slots.t01",
        expect: {
          intent: "provide_availability_constraint",
          nextAction: "offer_available_slots",
          replyIncludes: ["Tengo disponible", "5:30 PM", "7:00 PM"],
          replyExcludes: ["anoto que puedes", "Qué día", "Continuemos"],
          shouldEscalate: false,
          sideEffectsDenied: true
        }
      }
    ]
  },
  {
    id: "rolling-availability-after-constraint",
    name: "BR-108 Rolling Saturday + Monday offer",
    category: "scheduling",
    description:
      "BR-108 — late Friday after-5 offers Saturday 18:00 + Monday 17:30 when Sunday empty.",
    seed: {
      preferredLanguage: "spanish",
      languageSource: "inferred",
      agentId: "agent-fixture-br108",
      testNow: "2026-08-07T21:00:00.000-04:00",
      availabilityFixture: {
        timezone: "America/New_York",
        slots: [
          { dateKey: "2026-08-08", timeKey: "18:00" },
          { dateKey: "2026-08-10", timeKey: "17:30" }
        ]
      },
      knownFacts: {
        city: "Miami",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        preferredDayPart: "afternoon"
      },
      currentStage: "scheduling",
      conversation: {
        lastQuestionAsked: "ask_time_preference"
      }
    },
    turns: [
      {
        id: "roll01",
        text: "después de las 5",
        inboundMessageId: "sim-wamid.rolling-slots.t01",
        expect: {
          intent: "provide_availability_constraint",
          nextAction: "offer_available_slots",
          replyIncludes: ["Tengo disponible", "6:00 PM", "5:30 PM", "lunes"],
          replyExcludes: ["anoto que puedes", "Qué día te funciona"],
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
