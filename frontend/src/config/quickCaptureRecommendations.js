/** Maps backend recommendedAction codes to i18n step label keys. */
export const QUICK_CAPTURE_RECOMMENDATION_STEP_KEYS = Object.freeze({
  required_information: "quickCaptureRecommendationRequiredInformation",
  schedule_interview: "quickCaptureRecommendationScheduleInterview",
  conversation_outcome: "quickCaptureRecommendationConversationOutcome",
  complete_fna: "quickCaptureRecommendationCompleteFna",
  start_orientation: "quickCaptureRecommendationStartOrientation",
  collect_license: "quickCaptureRecommendationCollectLicense",
  follow_up: "quickCaptureRecommendationFollowUp",
  send_zoom_link: "quickCaptureRecommendationSendZoomLink"
});

export function resolveRecommendationStepKey(recommendedAction) {
  return (
    QUICK_CAPTURE_RECOMMENDATION_STEP_KEYS[recommendedAction] ||
    QUICK_CAPTURE_RECOMMENDATION_STEP_KEYS.required_information
  );
}
