import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import Skeleton from "../../../components/ui/Skeleton";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";

function MetricCard({ label, value, highlight = false }) {
  return (
    <div className={`prospect-workspace-metric-card ${highlight ? "is-highlight" : ""}`.trim()}>
      <span className="prospect-workspace-metric-card__label">{label}</span>
      <strong className="prospect-workspace-metric-card__value">{value}</strong>
    </div>
  );
}

function MissionControlContextPanel({ prospectContext, loading, error }) {
  const { translate } = useLanguage();

  return (
    <section
      className="prospect-workspace-panel prospect-workspace-panel--mission"
      aria-label={translate("workspaceSectionMissionControl")}
    >
      <h2 className="workspace-eyebrow">{translate("workspaceSectionMissionControl")}</h2>

      {loading ? (
        <div className="prospect-workspace-panel__grid prospect-workspace-panel__grid--cards" aria-busy="true">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : null}

      {error ? (
        <ErrorState
          title={translate("workspaceMissionControlLoadError")}
          body={translate("workspacePanelErrorHint")}
        />
      ) : null}

      {!loading && !error && prospectContext ? (
        <div className="prospect-workspace-panel__grid prospect-workspace-panel__grid--cards">
          <MetricCard
            label={translate("workspaceMissionControlActive")}
            value={
              prospectContext.isActive
                ? translate("workspaceMissionControlActiveYes")
                : translate("workspaceMissionControlActiveNo")
            }
            highlight={prospectContext.isActive}
          />
          <MetricCard
            label={translate("workspaceMissionControlOrgActive")}
            value={prospectContext.activeProspectCount}
          />
          <MetricCard
            label={translate("workspaceMissionControlContactAttempts")}
            value={prospectContext.contactAttempts}
          />
          <MetricCard
            label={translate("workspaceMissionControlInterviews")}
            value={`${prospectContext.completedInterviews}/${prospectContext.scheduledInterviews}`}
          />
        </div>
      ) : null}

      {!loading && !error && !prospectContext ? (
        <EmptyState
          title={translate("workspaceMissionControlUnavailable")}
          body={translate("workspacePanelEmptyHint")}
        />
      ) : null}
    </section>
  );
}

export default memo(MissionControlContextPanel);
