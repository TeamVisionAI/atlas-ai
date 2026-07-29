function logQualificationBrainTurn(payload = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "qualification_brain",
      phone: payload.phone || null,
      messagePreview: String(payload.message || "").slice(0, 120),
      qualificationData: payload.qualificationData || {},
      captureState: payload.captureState || {},
      missingFields: payload.missingFields || [],
      nextField: payload.nextField || null,
      canBeginScheduling: Boolean(payload.canBeginScheduling),
      schedulingEligibleReason: payload.schedulingEligibleReason || null,
      isLocal: payload.isLocal ?? null,
      calendarChecked: Boolean(payload.calendarChecked),
      handoffRequired: Boolean(payload.handoffRequired),
      handoffReason: payload.handoffReason || null,
      profileCity: payload.profileCity || null,
      profileState: payload.profileState || null,
      seededCityBypassBlocked: Boolean(payload.seededCityBypassBlocked)
    })
  );
}

module.exports = {
  logQualificationBrainTurn
};
