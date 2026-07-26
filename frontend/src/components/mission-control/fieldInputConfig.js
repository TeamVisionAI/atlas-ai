/** Input presentation — visibility comes from backend requiredInputs. */
export const FIELD_INPUT_CONFIG = Object.freeze({
  first_name: { type: "text" },
  last_name: { type: "text" },
  email: { type: "email" },
  city: { type: "text" },
  state: { type: "text" },
  occupation: { type: "text" },
  preferred_language: {
    type: "select",
    options: [
      { value: "english", labelKey: "quickCaptureLanguageEn" },
      { value: "spanish", labelKey: "quickCaptureLanguageEs" }
    ],
    placeholderKey: "conversationOutcomeSelectLanguage"
  },
  work_authorization_status: {
    type: "select",
    options: [
      { value: "work_permit", labelKey: "conversationOutcomeWorkPermit" },
      { value: "yes", labelKey: "conversationOutcomeAuthorizedYes" },
      { value: "no", labelKey: "conversationOutcomeAuthorizedNo" }
    ],
    placeholderKey: "conversationOutcomeSelectWorkAuthorization"
  }
});

export const SOURCE_LABEL_KEYS = Object.freeze({
  stored: "conversationOutcomeSourceStored",
  ai_detected: "conversationOutcomeSourceAiDetected",
  quick_capture: "conversationOutcomeSourceQuickCapture"
});
