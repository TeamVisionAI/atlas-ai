import { useLanguage } from "../../i18n/LanguageContext";
import StatusBadge from "../ui/StatusBadge";
import RecruitingJourneyProgress from "./RecruitingJourneyProgress";
import "./MissionControlWorkspaceHeader.css";

function resolveMilestoneVariant(milestone, canonicalMilestone) {
  const value = String(canonicalMilestone || milestone || "").toLowerCase();

  if (value.includes("stall") || value.includes("follow")) {
    return "warning";
  }

  if (value.includes("lost") || value.includes("closed") || value.includes("archive")) {
    return "danger";
  }

  if (
    value.includes("recruit") ||
    value.includes("orientation") ||
    value.includes("onboarding") ||
    value.includes("complete")
  ) {
    return "success";
  }

  if (
    value.includes("interview") ||
    value.includes("qualif") ||
    value.includes("schedule")
  ) {
    return "info";
  }

  return "neutral";
}

function ContactField({ label, value }) {
  if (!value || value === "—") {
    return null;
  }

  return (
    <div className="mc-cockpit__contact">
      <span className="mc-cockpit__contact-label">{label}</span>
      <span className="mc-cockpit__contact-value">{value}</span>
    </div>
  );
}

/**
 * Mission Control cockpit — one unified workspace header for the active prospect.
 */
export default function MissionControlWorkspaceHeader({
  prospect,
  recruitingStatus,
  currentIndex,
  totalProspects,
  previousProspect,
  nextProspect,
  onPrevious,
  onNext
}) {
  const { translate } = useLanguage();
  const position = totalProspects ? currentIndex + 1 : 0;
  const displayName =
    prospect?.name && prospect.name !== "—"
      ? prospect.name
      : translate("missionControlUnnamedProspect");
  const milestoneLabel = prospect?.milestone || translate("workspaceStatusSummaryUnknown");
  const milestoneVariant = resolveMilestoneVariant(
    prospect?.milestone,
    prospect?.canonicalMilestone
  );

  return (
    <header className="mc-cockpit" aria-label={translate("missionControlWorkspaceHeaderLabel")}>
      <div className="mc-cockpit__hero">
        <h1 className="mc-cockpit__name">{displayName}</h1>
        <StatusBadge variant={milestoneVariant}>{milestoneLabel}</StatusBadge>
      </div>

      <RecruitingJourneyProgress recruitingStatus={recruitingStatus} />

      <div className="mc-cockpit__contact-row">
        <ContactField label={translate("missionControlRowPhone")} value={prospect?.phone} />
        <ContactField label={translate("missionControlRowLocation")} value={prospect?.location} />
        <ContactField label={translate("missionControlRowLanguage")} value={prospect?.language} />
        <ContactField
          label={translate("missionControlRowInterviewType")}
          value={prospect?.interviewType}
        />
        <ContactField
          label={translate("missionControlRowWorkflowOwner")}
          value={prospect?.workflowOwnership}
        />
      </div>

      <nav className="mc-cockpit__queue" aria-label={translate("missionControlProspectNavigation")}>
        <button
          type="button"
          className="mc-cockpit__queue-link"
          onClick={onPrevious}
          disabled={!previousProspect}
        >
          {translate("missionControlPreviousProspect")}
          {previousProspect?.name ? (
            <span className="mc-cockpit__queue-hint">{previousProspect.name}</span>
          ) : null}
        </button>

        <span className="mc-cockpit__queue-position">
          {translate("missionControlProspectPosition", {
            position,
            total: totalProspects
          })}
        </span>

        <button
          type="button"
          className="mc-cockpit__queue-link mc-cockpit__queue-link--next"
          onClick={onNext}
          disabled={!nextProspect}
        >
          {translate("missionControlNextProspect")}
          {nextProspect?.name ? (
            <span className="mc-cockpit__queue-hint">{nextProspect.name}</span>
          ) : null}
        </button>
      </nav>
    </header>
  );
}
