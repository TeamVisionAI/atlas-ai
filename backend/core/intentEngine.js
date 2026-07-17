// ==========================================
// Atlas Intent Engine v2
// Team Vision Recruiting Brain
// ==========================================

function detectIntent(message) {
  const text = String(message || "")
    .trim()
    .toLowerCase();

  // ==========================
  // GREETINGS
  // ==========================
  const greetingPatterns = [
    "hi",
    "hello",
    "hey",
    "hola",
    "buenas",
    "good morning",
    "good afternoon",
    "good evening",
    "buenos días",
    "buenos dias",
    "buenas tardes",
    "buenas noches"
  ];

  if (
    greetingPatterns.some(
      greeting => text === greeting || text.startsWith(greeting + " ")
    )
  ) {
    return "GREETING";
  }

  // ==========================
  // AVAILABLE
  // ==========================
  const availablePatterns = [
    "still available",
    "is this available",
    "available",
    "still hiring",
    "are you hiring",
    "are you still hiring",
    "still looking",
    "position available",
    "job available",

    "sigue disponible",
    "todavía disponible",
    "todavia disponible",
    "aún disponible",
    "aun disponible",
    "aún están contratando",
    "aun estan contratando",
    "todavía están contratando",
    "todavia estan contratando",
    "aún buscan",
    "aun buscan",
    "siguen buscando",
    "hay cupos"
  ];

  if (availablePatterns.some(pattern => text.includes(pattern))) {
    return "AVAILABLE";
  }

  // ==========================
  // WHAT IS THE JOB
  // ==========================
  const jobPatterns = [
    "what is the job",
    "what's the job",
    "what do i do",
    "what would i do",
    "what is this about",
    "tell me more",
    "more information",
    "more info",
    "what do you do",
    "job description",

    "de qué trata",
    "de que trata",
    "qué tendría que hacer",
    "que tendria que hacer",
    "qué trabajo es",
    "que trabajo es",
    "más información",
    "mas informacion",
    "información",
    "informacion",
    "explícame",
    "explicame",
    "info"
  ];

  if (jobPatterns.some(pattern => text.includes(pattern))) {
    return "WHAT_IS_THE_JOB";
  }

  // ==========================
  // COST
  // ==========================
  const costPatterns = [
    "do i have to pay",
    "is there any cost",
    "how much does it cost",
    "application fee",
    "monthly fee",
    "registration fee",

    "tengo que pagar",
    "tiene costo",
    "tiene algún costo",
    "tiene algun costo",
    "cuánto cuesta",
    "cuanto cuesta",
    "hay que pagar",
    "mensualidad",
    "es gratis"
  ];

  if (costPatterns.some(pattern => text.includes(pattern))) {
    return "COST";
  }

  // ==========================
  // SALARY
  // ==========================
  const salaryPatterns = [
    "salary",
    "hourly",
    "per hour",
    "pay rate",
    "income",
    "how much can i make",
    "how much do you pay",

    "sueldo",
    "salario",
    "cuánto se gana",
    "cuanto se gana",
    "ganancias",
    "cuánto pagan",
    "cuanto pagan"
  ];

  if (salaryPatterns.some(pattern => text.includes(pattern))) {
    return "SALARY";
  }

  // ==========================
  // PRIMERICA
  // ==========================
  if (text.includes("primerica")) {
    return "PRIMERICA";
  }

  // ==========================
  // REMOTE
  // ==========================
  const remotePatterns = [
    "remote",
    "work from home",
    "home office",
    "from home",

    "remoto",
    "desde casa",
    "trabajo desde casa"
  ];

  if (remotePatterns.some(pattern => text.includes(pattern))) {
    return "REMOTE";
  }

  // ==========================
  // LICENSE
  // ==========================
  const licensePatterns = [
    "license",
    "licensed",
    "licensing",

    "licencia",
    "licenciar",
    "licenciado"
  ];

  if (licensePatterns.some(pattern => text.includes(pattern))) {
    return "LICENSE";
  }

  // ==========================
  // UNKNOWN
  // ==========================
  return "UNKNOWN";
}

module.exports = {
  detectIntent
};