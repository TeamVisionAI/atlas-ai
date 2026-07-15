// Atlas Response Engine v1

const responses = {

    PRIMERICA: {
      en: `Yes, this opportunity is with Primerica, one of the largest financial services companies in North America.
  
  I'd be happy to answer any questions you have.
  
  Now let's continue where we left off.`,
  
      es: `Sí, esta oportunidad es con Primerica, una de las compañías de servicios financieros más grandes de Norteamérica.
  
  Con gusto responderé todas tus preguntas.
  
  Ahora continuemos donde nos quedamos.`
    },
  
    COST: {
      en: `That's a great question.
  
  During the interview we'll explain the complete opportunity, answer all of your questions, and explain how the process works before you make any decision.
  
  For now I'd simply like to determine if this opportunity is a good fit for you.`,
  
      es: `Excelente pregunta.
  
  Durante la entrevista te explicaremos toda la oportunidad, responderemos todas tus preguntas y conocerás cómo funciona todo antes de tomar cualquier decisión.
  
  Por ahora solo quiero ayudarte a determinar si esta oportunidad es adecuada para ti.`
    },
  
    REMOTE: {
      en: `Many activities can be performed remotely depending on your training and role.
  
  We'll explain everything during the interview.`,
  
      es: `Muchas actividades pueden realizarse de forma remota dependiendo del entrenamiento y del rol.
  
  Durante la entrevista te explicaremos todos los detalles.`
    }
  
  };
  
  function getResponse(intent, language = "en") {
  
    if (!responses[intent]) {
      return null;
    }
  
    return responses[intent][language] || responses[intent].en;
  
  }
  
  module.exports = {
    getResponse
  };