-- C1 — Seed Team Vision recruiting config into organization_settings.settings.recruiting
-- Does not overwrite settings.scheduling or other keys.

DO $$
DECLARE
  recruiting_json jsonb := $recruiting$
{
  "schemaVersion": 1,
  "profile": {
    "industry": "insurance",
    "businessName": "Team Vision",
    "recruitingObjective": "It's an opportunity in financial services where we help families with protection and financial planning. We provide training and support.",
    "defaultLanguage": "es",
    "supportedLanguages": [
      "es",
      "en"
    ],
    "tone": "conversational"
  },
  "coverage": {
    "officeAddress": "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    "localCities": [
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
    ],
    "localRadiusMiles": 25,
    "defaultInterviewMode": "zoom"
  },
  "qualification": {
    "fieldOrder": [
      "city",
      "state",
      "authorization",
      "interviewType",
      "dayPart",
      "schedule",
      "name",
      "email"
    ],
    "requiredFields": [
      "city",
      "state",
      "authorization",
      "interviewType",
      "dayPart"
    ],
    "disqualifiers": [
      {
        "fieldId": "authorization",
        "when": false,
        "action": "current_not_fit",
        "messages": {
          "es": "Gracias por tu interés. En este momento necesitamos contar con autorización legal vigente para trabajar en Estados Unidos. Cuando cuentes con la documentación requerida, con gusto podemos retomar el proceso.",
          "en": "Thank you for your interest. At this time we need current legal authorization to work in the United States. When you have the required documentation, we'd be happy to continue the process."
        }
      }
    ],
    "questions": [
      {
        "fieldId": "city",
        "text_es": "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?",
        "text_en": "Hi! Thanks for reaching out. What city and state do you live in?"
      },
      {
        "fieldId": "state",
        "text_es": "¿En qué estado está ${city}?",
        "text_en": "Which state is ${city} in?"
      },
      {
        "fieldId": "authorization",
        "text_es": "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
        "text_en": "Do you have work authorization or legal documentation to work in the United States?"
      },
      {
        "fieldId": "interviewType",
        "text_es": "Excelente. Estamos realizando las entrevistas por Zoom. ¿Prefieres en la mañana o en la tarde?",
        "text_en": "Excellent. We're conducting interviews via Zoom. Do you prefer morning or afternoon?"
      },
      {
        "fieldId": "dayPart",
        "text_es": "¿Prefieres en la mañana o en la tarde?",
        "text_en": "Do you prefer morning or afternoon?"
      },
      {
        "fieldId": "name",
        "text_es": "¿Cuál es tu nombre completo?",
        "text_en": "What is your full name?"
      },
      {
        "fieldId": "email",
        "text_es": "¿Cuál es tu correo electrónico para enviarte la confirmación de la entrevista?",
        "text_en": "What is your email address so we can send your interview confirmation?"
      }
    ]
  },
  "scheduling": {
    "appointmentPurpose": "recruiting_interview",
    "durationMinutes": 30,
    "allowedModes": [
      "in_person",
      "zoom"
    ]
  },
  "conversation": {
    "openingInstructions": {
      "es": "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?",
      "en": "Hi! Thanks for reaching out. What city and state do you live in?"
    },
    "faq": [
      {
        "id": "what_is_the_job",
        "keywords": [
          "is this a job",
          "is this employment",
          "what kind of job",
          "business opportunity",
          "esto es un trabajo",
          "es un trabajo",
          "es un empleo",
          "trabajo de verdad",
          "tipo de trabajo",
          "oportunidad de negocio",
          "part time",
          "full time",
          "part-time",
          "full-time",
          "job",
          "work",
          "position",
          "empleo",
          "what is the job",
          "de que trata",
          "de qué trata",
          "what is this about",
          "more information",
          "mas informacion",
          "más información",
          "info"
        ],
        "response_en": "This is an opportunity in financial services (advisory and distribution), not a guaranteed salaried or hourly job. No experience is required, and during the interview you'll learn the details so you can decide if it's a good fit.",
        "response_es": "Es una oportunidad en servicios financieros (asesoría y distribución), no un empleo asalariado u por hora garantizado. No se requiere experiencia; durante la entrevista te dan todos los detalles para que decidas si es una buena opción para ti."
      },
      {
        "id": "insurance",
        "keywords": [
          "insurance",
          "seguro",
          "is it insurance",
          "is this insurance",
          "es seguro",
          "vender seguros"
        ],
        "response_en": "Yes — this opportunity is in the financial services industry and includes insurance and related financial products. No prior experience is required; during the interview we'll explain how the business works so you can decide if it's a good fit. This is not a guaranteed salaried job offer.",
        "response_es": "Sí — esta oportunidad es en servicios financieros e incluye seguros y productos financieros relacionados. No se requiere experiencia previa; durante la entrevista te explicamos cómo funciona el negocio para que decidas si es una buena opción. No es una oferta de empleo asalariado garantizado."
      },
      {
        "id": "pay",
        "keywords": [
          "hour",
          "salary",
          "pay",
          "per hour",
          "hora",
          "sueldo",
          "salario",
          "pagan",
          "cuanto pagan",
          "cuánto pagan",
          "how much money",
          "how much do i make",
          "how much can i make",
          "compensation",
          "commission",
          "comision",
          "comisión",
          "cuánto se gana",
          "cuanto se gana"
        ],
        "response_en": "This isn't an hourly or guaranteed-salary position. Compensation depends on the role, licensing, and production, and we'll explain the structure during the interview without promising a specific income. You can decide then if it's a good fit.",
        "response_es": "No es un puesto por hora ni con sueldo garantizado. La compensación depende del rol, las licencias y la producción; durante la entrevista te explicamos la estructura sin prometer un ingreso específico. Ahí podrás decidir si te conviene."
      },
      {
        "id": "sales",
        "keywords": [
          "is this sales",
          "is this selling",
          "esto es de ventas",
          "es esto ventas",
          "es de ventas",
          "se trata de ventas",
          "sell",
          "sales",
          "selling",
          "vender",
          "ventas"
        ],
        "response_en": "This is a financial-services business opportunity. Licensed representatives may offer financial products and services, and helping and educating families is a major part of the work. Training and licensing are part of the path — it isn't a traditional employee job.",
        "response_es": "Es una oportunidad de negocio en servicios financieros. Los representantes licenciados pueden ofrecer productos y servicios financieros, y una parte importante del trabajo es ayudar y educar a las familias. Entrenamiento y licencia forman parte del camino; no es un empleo tradicional de empleado."
      },
      {
        "id": "legitimacy",
        "keywords": [
          "scam",
          "legit",
          "legitimate",
          "estafa",
          "legitimo",
          "legítimo",
          "piramide",
          "pirámide"
        ],
        "response_en": "I understand wanting to be careful. This is a real financial-services opportunity with training and licensing requirements — we don't invent ratings or guarantees. The interview is a good place to ask detailed questions.",
        "response_es": "Entiendo la precaución. Es una oportunidad real de servicios financieros con entrenamiento y requisitos de licencia; no inventamos cifras ni promesas. La entrevista es el mejor lugar para hacer preguntas detalladas."
      },
      {
        "id": "clients",
        "keywords": [
          "clients",
          "customers",
          "find clients",
          "buscar clientes",
          "clientes"
        ],
        "response_en": "You'll receive training and work alongside experienced leaders while you learn. During the interview we'll explain how that process works.",
        "response_es": "Recibirás entrenamiento y trabajarás acompañado por un líder mientras aprendes. Durante la entrevista te explicarán cómo funciona ese proceso."
      },
      {
        "id": "experience",
        "keywords": [
          "experience",
          "experiencia"
        ],
        "response_en": "No experience is required. Most people who start with us have never worked in financial services before because we provide the training.",
        "response_es": "No se requiere experiencia. La mayoría de las personas que comienzan con nosotros nunca han trabajado en servicios financieros porque nosotros les enseñamos."
      },
      {
        "id": "english",
        "keywords": [
          "english",
          "ingles",
          "inglés",
          "speak english"
        ],
        "response_en": "Speaking English isn't required to get started. We have Spanish-speaking leaders and training available.",
        "response_es": "No es necesario hablar inglés para comenzar. Contamos con líderes y entrenamiento completamente en español."
      },
      {
        "id": "study",
        "keywords": [
          "study",
          "license",
          "licensed",
          "estudiar",
          "licencia"
        ],
        "response_en": "Since it's a licensed profession, everyone completes a licensing course. During the interview we'll explain how the process works and how we'll help you through it.",
        "response_es": "Como es una profesión licenciada, todos realizan un curso de licencia. Durante la entrevista te explicarán cómo funciona el proceso y cómo te acompañaremos en cada paso."
      },
      {
        "id": "work_from_home",
        "keywords": [
          "home",
          "remote",
          "work from home",
          "casa",
          "remoto",
          "desde casa"
        ],
        "response_en": "Depending on your training and responsibilities, there are opportunities to work remotely, in person, or with a hybrid schedule. During the interview we'll explain the options available.",
        "response_es": "Dependiendo de tu entrenamiento y tus responsabilidades, existen oportunidades presenciales, remotas o híbridas. Durante la entrevista te explicarán las opciones disponibles."
      },
      {
        "id": "flexible",
        "keywords": [
          "flexible",
          "schedule",
          "hours",
          "horario",
          "tiempo",
          "flexibilidad"
        ],
        "response_en": "Yes. One of the advantages of this opportunity is the flexibility to build your schedule around your personal and family commitments. During the interview you'll learn how that works.",
        "response_es": "Sí. Una de las ventajas de esta oportunidad es la flexibilidad para organizar tu horario alrededor de tus compromisos personales y familiares. Durante la entrevista te explicarán cómo funciona."
      },
      {
        "id": "license_path_2_14_2_15",
        "keywords": [
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
        "response_en": "In Florida, the primary licensing path is the 2-14. If that path is not completed or passed successfully, Team Vision may offer the 2-15 option. During the interview we'll explain how the process works and how we'll support you.",
        "response_es": "En Florida, el camino principal de licencia es el 2-14. Si no se completa o no se aprueba ese camino, Team Vision puede ofrecer la opción del 2-15. Durante la entrevista te explican cómo funciona el proceso y cómo te acompañan."
      }
    ],
    "handoffDisplayName": "Team Vision",
    "objectionKeys": [
      "is_this_sales",
      "think_about_it",
      "legitimacy_trust",
      "recruit_role_objection",
      "network_objection"
    ]
  }
}
$recruiting$::jsonb;
BEGIN
  UPDATE organization_settings
  SET
    settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{recruiting}', recruiting_json, true),
    updated_at = now()
  WHERE organization_id = '00000000-0000-4000-8000-000000000001';

  IF NOT FOUND THEN
    INSERT INTO organization_settings (organization_id, settings, created_at, updated_at)
    VALUES (
      '00000000-0000-4000-8000-000000000001',
      jsonb_build_object('recruiting', recruiting_json),
      now(),
      now()
    );
  END IF;
END $$;
