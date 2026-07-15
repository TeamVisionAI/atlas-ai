// Atlas Intent Engine v1

function detectIntent(message) {
    const text = String(message || "")
      .trim()
      .toLowerCase();
  
    // Greetings
    if (
      /^(hi|hello|hey|hola|buenas|buenos días|buenos dias|good morning|good afternoon)\b/.test(
        text
      )
    ) {
      return "GREETING";
    }
  
    // Interested / requesting information
    if (
      text.includes("interested") ||
      text.includes("more info") ||
      text.includes("information") ||
      text.includes("interesado") ||
      text.includes("interesada") ||
      text.includes("información") ||
      text.includes("informacion")
    ) {
      return "INTERESTED";
    }
  
    // COST

const costPatterns = [
  "do i have to pay",
  "is there any cost",
  "how much",
  "how much does it cost",
  "is it free",
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
  "es gratis",
  "mensualidad"
];

if (costPatterns.some(pattern => text.includes(pattern))) {
  return "COST";
}
  
    // Salary / earnings
    if (
      text.includes("salary") ||
      text.includes("pay rate") ||
      text.includes("income") ||
      text.includes("how much can i make") ||
      text.includes("sueldo") ||
      text.includes("salario") ||
      text.includes("cuánto se gana") ||
      text.includes("cuanto se gana") ||
      text.includes("ganancias")
    ) {
      return "SALARY";
    }
  
    // Primerica
    if (text.includes("primerica")) {
      return "PRIMERICA";
    }
  
    // Remote work
    if (
      text.includes("remote") ||
      text.includes("work from home") ||
      text.includes("remoto") ||
      text.includes("desde casa")
    ) {
      return "REMOTE";
    }
  
    // License
    if (
      text.includes("license") ||
      text.includes("licensed") ||
      text.includes("licensing") ||
      text.includes("licencia") ||
      text.includes("licenciar")
    ) {
      return "LICENSE";
    }
  
    return "UNKNOWN";
  }
  
  module.exports = {
    detectIntent
  };