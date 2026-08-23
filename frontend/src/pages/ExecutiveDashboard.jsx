import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
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

function AnalyticsSection({ viewModel, loading, translate }) {
  if (loading || !viewModel) {
    return (
      <section className="executive-v2__section" aria-busy="true">
        <h2 className="executive-v2__section-title">{translate("executiveV2SectionAnalytics")}</h2>
        <div className="executive-v2__grid executive-v2__grid--two">
          <AppointmentTrendCard trend={[]} loading />
          <RecentActivityCard activity={[]} loading />
        </div>
      </section>
    );
  }

  return (
    <section className="executive-v2__section">
      <h2 className="executive-v2__section-title">{translate("executiveV2SectionAnalytics")}</h2>
      <div className="executive-v2__grid executive-v2__grid--two">
        <AppointmentTrendCard trend={viewModel.trend || []} loading={false} />
        <RecentActivityCard activity={viewModel.recentActivity || []} loading={false} />
      </div>
    </section>
  );
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { translate } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const {
    executive,
    alphaBrief,
    prospects,
    organizationName,
    phase,
    loadingExecutive,
    errors
  } = useExecutiveDashboardV2Data();

  const orgLabel =
    organizationName || supportMode?.organizationName || translate("teamDashOrganizationFallback");

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

  if (errors.executive && !executive) {
    return (
      <div className="executive-dashboard executive-dashboard--v2">
        <div className="executive-error">{translate(errors.executive)}</div>
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
        loading={loadingExecutive}
      />

      <section className="executive-v2__section">
        <h2 className="executive-v2__section-title">{translate("executiveV2SectionOperations")}</h2>
        <div className="executive-v2__grid executive-v2__grid--three">
          <InterviewsTodayCard
            interviews={viewModel?.interviewsToday}
            loading={loadingExecutive}
            onOpen={() => openMissionControl(viewModel?.interviewsToday?.to)}
          />
          <TodayAgendaCard agenda={viewModel?.agenda || []} loading={loadingExecutive} />
          <MorningSummaryCard summary={viewModel?.morningSummary} loading={phase < 2} />
        </div>
      </section>

      {phase >= 2 ? (
        <section className="executive-v2__section">
          <h2 className="executive-v2__section-title">{translate("executiveV2SectionInsights")}</h2>
          <div className="executive-v2__grid executive-v2__grid--three">
            <RecruitmentFunnelCard funnel={viewModel?.funnel} loading={!viewModel?.hasV2Metrics} />
            <ConversationPerformanceCard
              performance={viewModel?.conversationPerformance}
              loading={!viewModel?.hasV2Metrics}
            />
            <TodayPrioritiesCard
              priorities={viewModel?.priorities || []}
              loading={!alphaBrief && phase < 2}
            />
          </div>
        </section>
      ) : (
        <section className="executive-v2__section" aria-busy="true">
          <h2 className="executive-v2__section-title">{translate("executiveV2SectionInsights")}</h2>
          <div className="executive-v2__grid executive-v2__grid--three">
            <RecruitmentFunnelCard funnel={null} loading />
            <ConversationPerformanceCard performance={null} loading />
            <TodayPrioritiesCard priorities={[]} loading />
          </div>
        </section>
      )}

      <AnalyticsSection
        viewModel={viewModel}
        loading={loadingExecutive}
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
