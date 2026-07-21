/**
 * Sprint 13.1 — Recruiting workflow context with collected prospect data.
 */

class RecruitingContext {
  /**
   * @param {Object} params
   * @param {Object|null} [params.prospect]
   * @param {Object|null} [params.conversation]
   * @param {Object|null} [params.latestMessage]
   * @param {Object|null} [params.operator]
   * @param {Object|null} [params.workflowState]
   * @param {Object} [params.collectedData]
   * @param {Object|null} [params.aiResult]
   */
  constructor({
    prospect = null,
    conversation = null,
    latestMessage = null,
    operator = null,
    workflowState = null,
    collectedData = {},
    aiResult = null
  } = {}) {
    this.prospect = prospect;
    this.conversation = conversation;
    this.latestMessage = latestMessage;
    this.operator = operator;
    this.workflowState = workflowState;
    this.collectedData = { ...collectedData };
    this.aiResult = aiResult;
  }

  /**
   * @param {import('../WorkflowContext').WorkflowContext} engineContext
   * @returns {RecruitingContext}
   */
  static fromEngineContext(engineContext) {
    const workflowState = engineContext.workflowState;
    const stored = workflowState?.context?.collectedData || workflowState?.context || {};

    return new RecruitingContext({
      prospect: engineContext.prospect,
      conversation: engineContext.conversation,
      latestMessage: engineContext.message,
      operator: engineContext.operator,
      workflowState,
      collectedData: stored.collectedData ? { ...stored.collectedData } : { ...stored },
      aiResult: engineContext.aiResult
    });
  }

  /**
   * Merge AI-extracted fields into collectedData.
   * @returns {string[]} newly collected field names
   */
  mergeExtractedFields() {
    const extracted = this._normalizeExtracted(this.aiResult?.extracted || {});
    const messageExtracted = this._extractFromMessage(this.latestMessage?.text || "");
    const merged = { ...messageExtracted, ...extracted };
    const newlyCollected = [];

    for (const [key, value] of Object.entries(merged)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      if (this.collectedData[key] !== value) {
        this.collectedData[key] = value;
        newlyCollected.push(key);
      }
    }

    return newlyCollected;
  }

  /**
   * @returns {Object}
   */
  toWorkflowContextPatch() {
    return {
      collectedData: { ...this.collectedData },
      lastMessageAt: this.latestMessage?.timestamp || new Date().toISOString(),
      atlasProspectId: this.prospect?.atlasId || this.conversation?.atlasProspectId || null
    };
  }

  /**
   * @param {Object} extracted
   * @returns {Object}
   */
  _normalizeExtracted(extracted) {
    const normalized = { ...extracted };

    if (extracted.authorization !== undefined && extracted.authorizedToWork === undefined) {
      normalized.authorizedToWork = extracted.authorization;
    }

    if (extracted.workAuthorization !== undefined && extracted.authorizedToWork === undefined) {
      normalized.authorizedToWork = extracted.workAuthorization;
    }

    if (extracted.preferredPeriod && !extracted.preferredTime) {
      normalized.preferredTime = extracted.preferredPeriod;
    }

    if (typeof normalized.email === "string") {
      normalized.email = normalized.email.replace(/[,.;]+$/, "");
    }

    return normalized;
  }

  /**
   * Lightweight fallback parsing when AI extraction is unavailable.
   * @param {string} text
   * @returns {Object}
   */
  _extractFromMessage(text) {
    const result = {};
    const trimmed = String(text || "").trim();

    if (!trimmed) {
      return result;
    }

    const emailMatch = trimmed.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);

    if (emailMatch) {
      result.email = emailMatch[0].replace(/[,.;]+$/, "");
    }

    const phoneMatch = trimmed.match(
      /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/
    );

    if (phoneMatch) {
      result.phone = phoneMatch[0].replace(/\s+/g, " ").trim();
    }

    const nameMatch = trimmed.match(
      /(?:my name is|i am|i'm|me llamo|soy)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i
    );

    if (nameMatch) {
      result.name = nameMatch[1].trim();
    }

    const locationMatch = trimmed.match(/^([^,]+),\s*([A-Za-z]{2,})$/);

    if (locationMatch) {
      result.city = locationMatch[1].trim();
      result.state = locationMatch[2].trim().toUpperCase();
    }

    const dateMatch = trimmed.match(
      /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );

    if (dateMatch) {
      result.preferredDate = dateMatch[1];
    }

    const timeMatch = trimmed.match(
      /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|evening|mañana|tarde)\b/i
    );

    if (timeMatch) {
      result.preferredTime = timeMatch[1];
    }

    if (/^(yes|y|si|sí)$/i.test(trimmed)) {
      result.authorizedToWork = true;
    }

    if (/^(no|n)$/i.test(trimmed)) {
      result.authorizedToWork = false;
    }

    if (/\b(office|in person|in-person|presencial)\b/i.test(trimmed)) {
      result.interviewType = "office";
    }

    if (/\b(zoom|virtual|online|remoto)\b/i.test(trimmed)) {
      result.interviewType = "zoom";
    }

    return result;
  }
}

module.exports = {
  RecruitingContext
};
