function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }
  
  function determineInterviewType(city = "") {
    const normalizedCity = normalize(city);
  
    const inPersonCities = [
      "miami",
      "doral",
      "hialeah",
      "homestead",
      "kendall",
      "coral gables",
      "miami lakes"
    ];
  
    return inPersonCities.includes(normalizedCity) ? "In Person" : "Zoom";
  }
  
  function evaluateWorkAuthorization(workStatus = "") {
    const normalizedStatus = normalize(workStatus);
  
    if (
      normalizedStatus.includes("citizen") ||
      normalizedStatus.includes("ciudadan") ||
      normalizedStatus.includes("resident") ||
      normalizedStatus.includes("residente") ||
      normalizedStatus.includes("valid permit") ||
      normalizedStatus.includes("permiso vigente")
    ) {
      return {
        qualified: true,
        humanReview: false,
        reason: null
      };
    }
  
    if (
      normalizedStatus.includes("renewal") ||
      normalizedStatus.includes("renovacion") ||
      normalizedStatus.includes("renovación") ||
      normalizedStatus.includes("receipt") ||
      normalizedStatus.includes("recibo")
    ) {
      return {
        qualified: true,
        humanReview: true,
        reason: "Verify work authorization during interview"
      };
    }
  
    return {
      qualified: false,
      humanReview: true,
      reason: "Work authorization requires review"
    };
  }
  
  function evaluateCandidate(candidate = {}) {
    const workAuthorization = evaluateWorkAuthorization(
      candidate.workStatus || candidate.workAuthorization
    );
  
    const interviewType = determineInterviewType(candidate.city);
  
    return {
      qualified: workAuthorization.qualified,
      interviewType,
      humanReview: workAuthorization.humanReview,
      reviewReason: workAuthorization.reason,
      nextAction: workAuthorization.qualified
        ? "Schedule Interview"
        : "Human Review",
      candidate: {
        name: candidate.name || null,
        city: candidate.city || null,
        state: candidate.state || null,
        occupation: candidate.occupation || null,
        workStatus:
          candidate.workStatus || candidate.workAuthorization || null
      }
    };
  }
  
  module.exports = {
    determineInterviewType,
    evaluateWorkAuthorization,
    evaluateCandidate
  };