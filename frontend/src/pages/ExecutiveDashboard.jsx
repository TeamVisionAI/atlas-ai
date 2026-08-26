import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { buildExecutiveDashboardV2ViewModel } from "../engines/executiveDashboardV2ViewModel";
import { buildMissionControlPath } from "../engines/executiveFilterEngine";
import { useExecutiveDashboardV2Data } from "../hooks/useExecutiveDashboardV2Data";
import {
  AppointmentTrendCard,
  ConversationPerformanceCard,
  ExecutiveDashboardHeader,
  ExecutiveDashboardKpiSection,
  InterviewsTodayCard,
  MorningSummaryCard,
  RecentActivityCard,
  RecruitmentFunnelCard,
  TodayAgendaCard,
  TodayPrioritiesCard
} from "../components/executive/v2/ExecutiveDashboardSections";
import "./ExecutiveDashboard.css";

const FOCUS_LABEL_KEYS = {
  conversion: "executiveFocusConversion",
  funnel: "executiveFocusFunnel",
  trends: "executiveFocusTrends",
  kpis: "executiveFocusKpis"
};

function AnalyticsSection({
  viewModel,
  metricsLoading,
  metricsUnavailable,
  activityLoading,
  unavailableMessage,
  retryLabel,
  onRetry,
  translate
}) {
  return (
    <section className="executive-v2__section" aria-busy={metricsLoading || activityLoading || undefined}>
      <h2 className="executive-v2__section-title">{translate("executiveV2SectionAnalytics")}</h2>
      <div className="executive-v2__grid executive-v2__grid--two">
        <AppointmentTrendCard
          trend={viewModel?.trend || []}
          loading={metricsLoading}
          unavailable={metricsUnavailable}
          unavailableMessage={unavailableMessage}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
        <RecentActivityCard activity={viewModel?.recentActivity || []} loading={activityLoading} />
      </div>
    </section>
  );
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { translate } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const {
    executive,
    alphaBrief,
    prospects,
    organizationName,
    phase,
    loadingExecutive,
    metricsLoading,
    metricsUnavailable,
    errors,
    reload
  } = useExecutiveDashboardV2Data();

  const orgLabel = controlPlane
    ? ""
    : organizationName || supportMode?.organizationName || translate("teamDashOrganizationFallback");
  const metricsUnavailableMessage = translate("executiveV2MetricsUnavailable");
  const retryLabel = translate("executiveV2Retry");

  const viewModel = useMemo(() => {
    if (!executive) {
      return null;
    }

    return buildExecutiveDashboardV2ViewModel({
      executive,
      alphaBrief,
      prospects,
      user,
      organizationName: orgLabel,
      translate
    });
  }, [executive, alphaBrief, prospects, user, orgLabel, translate]);

  const focusKey = searchParams.get("focus");
  const fromWorkspace = searchParams.get("from") === "workspace";
  const focusLabelKey = FOCUS_LABEL_KEYS[focusKey];

  function openMissionControl(path) {
    navigate(path || buildMissionControlPath());
  }

  if (controlPlane) {
    return (
      <div className="executive-dashboard executive-dashboard--v2">
        <ControlPlaneEmptyState translate={translate} />
      </div>
    );
  }

  if (errors.executive && !executive) {
    return (
      <div className="executive-dashboard executive-dashboard--v2">
        <div className="executive-error">
          <p>{translate(errors.executive)}</p>
          <button type="button" className="executive-v2__button" onClick={reload}>
            {retryLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="executive-dashboard executive-dashboard--v2">
      {fromWorkspace && focusLabelKey ? (
        <div className="executive-dashboard__focus-banner" role="status">
          <p>{translate("executiveFocusFromWorkspace")}</p>
          <strong>{translate(focusLabelKey)}</strong>
        </div>
      ) : null}

      <ExecutiveDashboardHeader
        header={viewModel?.header}
        organizationName={orgLabel}
        loading={loadingExecutive}
        onOpenMissionControl={() => openMissionControl(viewModel?.header?.missionControlPath)}
      />

      <ExecutiveDashboardKpiSection
        cards={viewModel?.kpiCards || []}
        loading={metricsLoading}
        unavailable={metricsUnavailable}
        unavailableMessage={metricsUnavailableMessage}
        onRetry={reload}
        retryLabel={retryLabel}
      />

      <section className="executive-v2__section">
        <h2 className="executive-v2__section-title">{translate("executiveV2SectionOperations")}</h2>
        <div className="executive-v2__grid executive-v2__grid--three executive-v2__grid--operations">
          <InterviewsTodayCard
            interviews={viewModel?.interviewsToday}
            loading={loadingExecutive}
            onOpen={() => openMissionControl(viewModel?.interviewsToday?.to)}
          />
          <TodayAgendaCard agenda={viewModel?.agenda || []} loading={loadingExecutive} />
          <MorningSummaryCard summary={viewModel?.morningSummary} loading={phase < 2} />
        </div>
      </section>

      <section className="executive-v2__section">
        <h2 className="executive-v2__section-title">{translate("executiveV2SectionInsights")}</h2>
        <div className="executive-v2__grid executive-v2__grid--three executive-v2__grid--insights">
          <RecruitmentFunnelCard
            funnel={viewModel?.funnel}
            loading={metricsLoading}
            unavailable={metricsUnavailable}
            unavailableMessage={metricsUnavailableMessage}
            onRetry={reload}
            retryLabel={retryLabel}
          />
          <ConversationPerformanceCard
            performance={viewModel?.conversationPerformance}
            loading={metricsLoading}
            unavailable={metricsUnavailable}
            unavailableMessage={metricsUnavailableMessage}
            onRetry={reload}
            retryLabel={retryLabel}
          />
          <TodayPrioritiesCard
            priorities={viewModel?.priorities || []}
            loading={!alphaBrief && phase < 2}
          />
        </div>
      </section>

      <AnalyticsSection
        viewModel={viewModel}
        metricsLoading={metricsLoading}
        metricsUnavailable={metricsUnavailable}
        activityLoading={loadingExecutive}
        unavailableMessage={metricsUnavailableMessage}
        retryLabel={retryLabel}
        onRetry={reload}
        translate={translate}
      />

      {errors.alphaBrief ? (
        <p className="executive-v2__inline-notice" role="status">
          {translate(errors.alphaBrief)}
        </p>
      ) : null}
    </div>
  );
}
