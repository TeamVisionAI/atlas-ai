import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard } from "../services/api";
import { getExecutiveDashboard } from "../services/executiveDashboardService";
import { buildMissionControlPath } from "../engines/executiveFilterEngine";
import { buildExecutiveDashboardViewModel } from "../engines/executiveDashboardViewModel";
import { useLanguage } from "../i18n/LanguageContext";
import InterviewsHero from "../components/executive/InterviewsHero";
import MorningBrief from "../components/executive/MorningBrief";
import FocusCards from "../components/executive/FocusCards";
import TeamInterviewBoard from "../components/executive/TeamInterviewBoard";
import InterviewPipeline from "../components/executive/InterviewPipeline";
import RecommendationCards from "../components/executive/RecommendationCards";
import ActivityTimeline from "../components/executive/ActivityTimeline";
import AgencyHealth from "../components/executive/AgencyHealth";
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

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const { translate } = useLanguage();
  const [executive, setExecutive] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [executivePayload, dashboardPayload] = await Promise.all([
          getExecutiveDashboard(),
          getDashboard()
        ]);

        if (!cancelled) {
          setExecutive(executivePayload);
          setDashboard(dashboardPayload);
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
      <InterviewsHero
        hero={viewModel.hero}
        onOpenMissionControl={() =>
          openMissionControl({ filter: "interviews-today" })
        }
      />

      <MorningBrief
        brief={viewModel.morningBrief}
        onReview={(phone, filter) => openMissionControl({ phone, filter })}
      />

      <FocusCards
        cards={viewModel.focusCards}
        onNavigate={(filter) => openMissionControl({ filter })}
      />

      <div className="executive-grid-two">
        <TeamInterviewBoard rows={viewModel.teamBoard} />
        <InterviewPipeline pipeline={viewModel.pipeline} />
      </div>

      <div className="executive-grid-two">
        <RecommendationCards
          items={viewModel.recommendations}
          onOpen={(phone, filter) => openMissionControl({ phone, filter })}
        />
        <ActivityTimeline activity={viewModel.activity} />
      </div>

      <AgencyHealth agencyPulse={viewModel.agencyPulse} />
    </div>
  );
}
