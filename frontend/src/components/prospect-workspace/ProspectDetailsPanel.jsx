import { useLanguage } from "../../i18n/LanguageContext";
import WorkspaceSection from "./WorkspaceSection";
import { formatInterviewDateTime } from "../../adapters/prospectWorkspaceAdapter";
import {
  buildCaptureAccordionSummary,
  buildCoachAccordionSummary,
  buildInterviewAccordionSummary,
  buildStatusAccordionSummary
} from "../../engines/prospectWorkspaceViewModel";

export default function ProspectDetailsPanel({
  interview,
  status,
  capture,
  owner,
  collapsible = true,
  onCommunicationLanguageChange,
  communicationLanguageSaving = false,
  communicationLanguageError = null
}) {
  const { translate } = useLanguage();

  const interviewSummary = buildInterviewAccordionSummary(interview, translate);
  const statusSummary = buildStatusAccordionSummary(status, translate);
  const captureSummary = buildCaptureAccordionSummary(capture, owner, translate);
  const coachSummary = buildCoachAccordionSummary(translate);

  return (
    <div className="prospect-details">
      <h2 className="workspace-eyebrow workspace-eyebrow--desktop-only">
        {translate("workspaceSectionDetails")}
      </h2>

      <WorkspaceSection
        title={translate("workspaceDetailsInterview")}
        summary={interviewSummary}
        collapsible={collapsible}
        defaultExpanded={!collapsible}
      >
        <dl className="prospect-details__list">
          <div>
            <dt>{translate("workspaceDetailsInterviewWhen")}</dt>
            <dd>
              {interview?.datetime
                ? formatInterviewDateTime(interview.datetime)
                : translate("workspaceInterviewSummaryNone")}
            </dd>
          </div>
          <div>
            <dt>{translate("workspaceDetailsInterviewType")}</dt>
            <dd>{interview?.type || "—"}</dd>
          </div>
          <div>
            <dt>{translate("workspaceDetailsInterviewOutcome")}</dt>
            <dd>{interview?.outcome || "—"}</dd>
          </div>
          {interview?.gateActive ? (
            <div>
              <dt>{translate("workspaceDetailsInterviewGate")}</dt>
              <dd>{translate("workspaceDetailsInterviewGateActive")}</dd>
            </div>
          ) : null}
        </dl>
      </WorkspaceSection>

      <WorkspaceSection
        title={translate("workspaceDetailsStatus")}
        summary={statusSummary}
        collapsible={collapsible}
        defaultExpanded={!collapsible}
      >
        <dl className="prospect-details__list">
          <div>
            <dt>{translate("missionControlRowMilestone")}</dt>
            <dd>{status?.milestone || "—"}</dd>
          </div>
          <div>
            <dt>{translate("missionControlRowWorkflowOwner")}</dt>
            <dd>{status?.workflowOwnership || "—"}</dd>
          </div>
          {status?.priorityTier ? (
            <div>
              <dt>{translate("workspaceDetailsPriority")}</dt>
              <dd>{status.priorityTier.replace(/_/g, " ")}</dd>
            </div>
          ) : null}
          {status?.stalledAt ? (
            <div>
              <dt>{translate("workspaceDetailsStalled")}</dt>
              <dd>{translate("workspaceStatusSummaryStalled")}</dd>
            </div>
          ) : null}
        </dl>
      </WorkspaceSection>

      <WorkspaceSection
        title={translate("workspaceDetailsCapture")}
        summary={captureSummary}
        collapsible={collapsible}
        defaultExpanded={!collapsible}
      >
        <dl className="prospect-details__list">
          <div>
            <dt>{translate("workspaceDetailsCommunicationLanguage")}</dt>
            <dd>
              <div className="prospect-details__segmented" role="group">
                <button
                  type="button"
                  className={`prospect-details__segment${
                    capture?.communicationLanguage === "es"
                      ? " prospect-details__segment--active"
                      : ""
                  }`}
                  disabled={communicationLanguageSaving}
                  onClick={() => onCommunicationLanguageChange?.("es")}
                >
                  {translate("quickCaptureLanguageEs")}
                </button>
                <button
                  type="button"
                  className={`prospect-details__segment${
                    capture?.communicationLanguage === "en"
                      ? " prospect-details__segment--active"
                      : ""
                  }`}
                  disabled={communicationLanguageSaving}
                  onClick={() => onCommunicationLanguageChange?.("en")}
                >
                  {translate("quickCaptureLanguageEn")}
                </button>
              </div>
              {communicationLanguageError ? (
                <span className="prospect-details__field-error">{communicationLanguageError}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{translate("quickCaptureHowDidYouMeet")}</dt>
            <dd>{capture?.source?.replace(/_/g, " ") || "—"}</dd>
          </div>
          <div>
            <dt>{translate("workspaceDetailsEntryMethod")}</dt>
            <dd>{capture?.entryMethod?.replace(/_/g, " ") || "—"}</dd>
          </div>
          <div>
            <dt>{translate("workspaceDetailsOwner")}</dt>
            <dd>{owner?.display_name || "—"}</dd>
          </div>
          {capture?.preferredChannel ? (
            <div>
              <dt>{translate("workspaceDetailsPreferredChannel")}</dt>
              <dd>{capture.preferredChannel}</dd>
            </div>
          ) : null}
        </dl>
      </WorkspaceSection>

      <WorkspaceSection
        title={translate("workspaceDetailsCoach")}
        summary={coachSummary}
        collapsible={collapsible}
        defaultExpanded={false}
      >
        <div className="prospect-coach-placeholder">
          <p className="prospect-coach-placeholder__eyebrow">
            {translate("workspaceCoachComingSoon")}
          </p>
          <p>{translate("workspaceCoachDescription")}</p>
        </div>
      </WorkspaceSection>
    </div>
  );
}
