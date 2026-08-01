/**
 * Sprint 13.1 — Preferred Language vs Conversation Language (BR-041).
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectLanguage } = require("../core/semanticConversationEngine");
const { resolveConversationLanguage } = require("../core/conversationLanguage");
const { buildConfidenceProfile } = require("../core/alphaConfidenceEngine");
const { buildProspectIdentity } = require("../core/prospectWorkspaceReadModel");
const { buildOutboundCommunicationPayload } = require("../core/communicationOutboundPayloadEngine");
const { composeWhatsAppMessage, WHATSAPP_TEMPLATES } = require("../core/whatsappCommunicationEngine");

const ORG = "00000000-0000-4000-8000-000000000001";

describe("Sprint 13.1 — BR-041 preferred vs conversation language", () => {
  it("detectLanguage remains conversation language (en) before Spanish messages", () => {
    const prospect = {
      preferred_language: "spanish"
    };

    assert.equal(detectLanguage(prospect, ""), "en");
    assert.equal(resolveConversationLanguage(prospect, ""), "en");
  });

  it("detectLanguage still switches on inbound Spanish message", () => {
    const prospect = {
      preferred_language: "english",
      language: "en"
    };

    assert.equal(detectLanguage(prospect, "Estoy desempleado y busco trabajo"), "es");
  });

  it("getMissionControlState exposes preferred_language independent of brain.language", async () => {
    const supabaseService = require("../services/supabaseService");
    const originalFind = supabaseService.findProspectInOrganization;

    supabaseService.findProspectInOrganization = async () => ({
      id: "prospect-1",
      phone: "+15555550100",
      name: "Maria Lopez",
      preferred_language: "spanish",
      city: "Miami",
      state: "FL"
    });

    try {
      delete require.cache[require.resolve("../core/missionControlReadModel")];
      const { getMissionControlState } = require("../core/missionControlReadModel");
      const state = await getMissionControlState("+15555550100", {
        organizationId: ORG,
        tenantScoped: true
      });

      assert.equal(state.prospect.preferred_language, "spanish");
      assert.equal(state.prospect.preferred_language_label, "Spanish");
      assert.equal(state.brain.language, "en");
    } finally {
      supabaseService.findProspectInOrganization = originalFind;
    }
  });

  it("buildProspectIdentity resolves preferred_language for workspace read model", () => {
    const identity = buildProspectIdentity({
      phone: "+15555550100",
      name: "Maria Lopez",
      preferred_language: "spanish"
    });

    assert.equal(identity.preferred_language, "spanish");
    assert.equal(identity.preferred_language_label, "Spanish");
  });

  it("buildConfidenceProfile displays preferred language, not brain.language", () => {
    const profile = buildConfidenceProfile({
      prospect: { preferred_language: "spanish" },
      brain: { language: "en" }
    });

    assert.equal(profile.language, "Spanish");
  });

  it("outbound communication payload keeps template language aligned with preferred_language", () => {
    const built = {
      template: WHATSAPP_TEMPLATES.INTERVIEW_REMINDER,
      message: composeWhatsAppMessage(WHATSAPP_TEMPLATES.INTERVIEW_REMINDER, {
        language: "es",
        prospectName: "Maria Lopez",
        recruiterName: "Ana Rivera",
        interviewAtMs: Date.parse("2026-08-01T15:00:00.000Z"),
        timezone: "America/New_York",
        interviewType: "zoom",
        zoomUrl: "https://zoom.us/j/123",
        organizationName: "Team Vision"
      }),
      language: "es",
      phone: "+15555550100",
      context: {
        language: "es",
        prospectName: "Maria Lopez",
        recruiterName: "Ana Rivera",
        interviewAtMs: Date.parse("2026-08-01T15:00:00.000Z"),
        timezone: "America/New_York",
        interviewType: "zoom",
        organizationName: "Team Vision"
      }
    };

    const payload = buildOutboundCommunicationPayload({
      built,
      prospect: {
        name: "Maria Lopez",
        phone: "+15555550100",
        preferred_language: "spanish"
      }
    });

    assert.equal(payload.preferredLanguage, "spanish");
    assert.equal(payload.languageLabel, "Spanish");
    assert.ok(payload.message.includes("Maria"));
  });
});
