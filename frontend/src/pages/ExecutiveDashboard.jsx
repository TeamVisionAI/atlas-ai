import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getDashboard } from "../services/api";
import { getExecutiveDashboard, getAlphaMorningBrief } from "../services/executiveDashboardService";
import { buildExecutiveDashboardViewModel } from "../engines/executiveDashboardViewModel";
import {
  EXECUTIVE_FILTERS,
  buildMissionControlPath
} from "../engines/executiveFilterEngine";
import { useLanguage } from "../i18n/LanguageContext";
import InterviewsHero from "../components/executive/InterviewsHero";
import MorningBrief from "../components/executive/MorningBrief";
import FocusCards from "../components/executive/FocusCards";
import TeamInterviewBoard from "../components/executive/TeamInterviewBoard";
import InterviewPipeline from "../components/executive/InterviewPipeline";
import RecommendationCards from "../components/executive/RecommendationCards";
import ActivityTimeline from "../components/executive/ActivityTimeline";
import AgencyHealth from "../components/executive/AgencyHealth";
import { isMetaReviewWorkspaceActive } from "../config/metaReviewMode";
import { useWorkspace } from "../contexts/WorkspaceContext";
import MetaReviewDashboardCard from "../components/meta-review/MetaReviewDashboardCard";
import "./ExecutiveDashboard.css";

function DashboardSkeleton() {
  return (
    <div className="executive-dashboard">
      <div className="executive-skeleton" style={{ height: 220 }} />
      <div className="executive-skeleton" style={{ height: 160 }} />
      <div className="executive-skeleton" style={{ height: 120 }} />
    </div>
  );
}

const FOCUS_LABEL_KEYS = {
  conversion: "executiveFocusConversion",
  funnel: "executiveFocusFunnel",
  trends: "executiveFocusTrends",
  kpis: "executiveFocusKpis"
};

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { translate } = useLanguage();
  const { user } = useWorkspace();
  const metaReviewWorkspace = isMetaReviewWorkspaceActive(user);
  const [executive, setExecutive] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [alphaBrief, setAlphaBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [executivePayload, dashboardPayload, alphaBriefPayload] = await Promise.all([
          getExecutiveDashboard(),
          getDashboard(),
          getAlphaMorningBrief().catch(() => null)
        ]);

        if (!cancelled) {
          setExecutive(executivePayload);
          setDashboard(dashboardPayload);
          setAlphaBrief(alphaBriefPayload);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError("executiveLoadError");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const viewModel = useMemo(() => {
    if (!executive || !dashboard) {
      return null;
    }

    return buildExecutiveDashboardViewModel(executive, dashboard, translate);
  }, [executive, dashboard, translate]);

  function openMissionControl(options = {}) {
    navigate(buildMissionControlPath(options));
  }

  function openOperationalTarget({ to, phone, filter } = {}) {
    if (to) {
      navigate(to);
      return;
    }

    if (phone || filter) {
      openMissionControl({ phone, filter });
      return;
    }

    openMissionControl({ filter: EXECUTIVE_FILTERS.HIGH_PRIORITY });
  }

  const focusKey = searchParams.get("focus");
  const fromWorkspace = searchParams.get("from") === "workspace";
  const focusLabelKey = FOCUS_LABEL_KEYS[focusKey];

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="executive-dashboard">
        <div className="executive-error">{translate(error)}</div>
      </div>
    );
  }

  if (!viewModel) {
    return (
      <div className="executive-dashboard">
        <p style={{ color: "#64748B" }}>{translate("executiveEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="executive-dashboard">
      {metaReviewWorkspace ? <MetaReviewDashboardCard activity={viewModel.activity} /> : null}

      {fromWorkspace && focusLabelKey ? (
        <div className="executive-dashboard__focus-banner" role="status">
          <p>{translate("executiveFocusFromWorkspace")}</p>
          <strong>{translate(focusLabelKey)}</strong>
        </div>
      ) : null}

      <InterviewsHero
        hero={viewModel.hero}
        onOpenMissionControl={() => navigate(viewModel.hero.to)}
      />

      <MorningBrief
        brief={alphaBrief || viewModel.morningBrief}
        onReview={(phone, filter, to) =>
          openOperationalTarget({
            to,
            phone,
            filter
          })
        }
      />

      <FocusCards
        cards={viewModel.focusCards}
        onNavigate={(to) => navigate(to)}
      />

      <div className="executive-grid-two">
        <TeamInterviewBoard rows={viewModel.teamBoard} />
        <InterviewPipeline pipeline={viewModel.pipeline} />
      </div>

      <div className="executive-grid-two">
        <RecommendationCards
          items={viewModel.recommendations}
          onOpen={(item) => navigate(item.to)}
        />
        <ActivityTimeline activity={viewModel.activity} />
      </div>

      <AgencyHealth agencyPulse={viewModel.agencyPulse} />
    </div>
  );
}
