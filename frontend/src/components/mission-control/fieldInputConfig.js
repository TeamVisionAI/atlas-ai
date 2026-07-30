/** Input presentation — visibility comes from backend requiredInputs. */
export const FIELD_INPUT_CONFIG = Object.freeze({
  first_name: { type: "text" },
  last_name: { type: "text" },
  email: { type: "email" },
  city: { type: "text" },
  state: { type: "text" },
  occupation: { type: "text" },
  preferred_language: {
    type: "radio",
    options: [
      { value: "english", labelKey: "quickCaptureLanguageEn" },
      { value: "spanish", labelKey: "quickCaptureLanguageEs" }
    ]
  },
  work_authorization_status: {
    type: "select",
    options: [
      { value: "work_permit", labelKey: "conversationOutcomeWorkPermit" },
      { value: "yes", labelKey: "conversationOutcomeAuthorizedYes" },
      { value: "no", labelKey: "conversationOutcomeAuthorizedNo" }
    ],
    placeholderKey: "conversationOutcomeSelectWorkAuthorization"
  },
  interview_type: {
    type: "radio",
    options: [
      { value: "office", labelKey: "missionExecutionInterviewTypeOffice", icon: "🏢" },
      { value: "zoom", labelKey: "missionExecutionInterviewTypeZoom", icon: "💻" },
      { value: "public_location", labelKey: "missionExecutionInterviewTypePublicLocation", icon: "☕" }
    ]
  }
});

export const SOURCE_LABEL_KEYS = Object.freeze({
  stored: "conversationOutcomeSourceStored",
  ai_detected: "conversationOutcomeSourceAiDetected",
  quick_capture: "conversationOutcomeSourceQuickCapture"
});
