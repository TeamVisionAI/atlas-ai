import { MILESTONES } from "../types/milestones";

export const RECRUIT_ONBOARDING_PACKAGE_ID = "recruit-onboarding";

/**
 * Journey package definitions — architecture only, no backend yet.
 */
export const JOURNEY_PACKAGES = {
  [RECRUIT_ONBOARDING_PACKAGE_ID]: {
    id: RECRUIT_ONBOARDING_PACKAGE_ID,
    title: "Recruit Onboarding Package",
    actionLabel: "Send Onboarding Package",
    items: [
      { id: "welcome", label: "Welcome Message" },
      { id: "ucanpass", label: "UCANPASS Link" },
      { id: "registration-video", label: "Registration Video" },
      { id: "study-guide", label: "Study Guide PDF" },
      { id: "orientation", label: "Orientation Confirmation" },
      { id: "location-info", label: "Zoom or Office Information" }
    ]
  }
};

/**
 * Returns packages available for the current workspace context.
 */
export function getAvailableJourneyPackages(context) {
  const packages = [];
  const milestone = context.milestone;
  const recruited =
    context.workflowState?.outcome === "Recruited" ||
    context.workflowState?.onboardingUnlocked ||
    milestone === MILESTONES.ORIENTATION_SCHEDULED ||
    milestone === MILESTONES.ONBOARDING ||
    milestone === MILESTONES.RECRUITED;

  if (recruited) {
    packages.push({
      ...JOURNEY_PACKAGES[RECRUIT_ONBOARDING_PACKAGE_ID],
      language: context.language
    });
  }

  return packages;
}

export function resolvePackageDeliveryInfo(packageId, context) {
  const interviewType = context.interviewType;

  if (packageId !== RECRUIT_ONBOARDING_PACKAGE_ID) {
    return null;
  }

  return {
    locationItemLabel:
      interviewType === "Office" ? "Office Information" : "Zoom Information"
  };
}
