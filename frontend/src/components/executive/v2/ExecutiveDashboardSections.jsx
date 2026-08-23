import { Link } from "react-router-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
import { formatAtlasDateTime } from "../../../utils/dateFormatter";
import { ExecutiveCard, KpiRow, KpiSkeletonRow, Skeleton } from "./ExecutiveDashboardCards";
import { AppointmentTrendChart, ConversationDonut } from "./ExecutiveDashboardCharts";

export function ExecutiveDashboardHeader({
  header,
  organizationName,
  loading = false,
  onOpenMissionControl
}) {
  const { translate } = useLanguage();
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: header?.timeZone || undefined
  });

  return (
    <header className="executive-v2__header">
      <div className="executive-v2__header-copy">
        {loading ? (
          <>
            <Skeleton className="executive-v2__skeleton--title" />
            <Skeleton className="executive-v2__skeleton--subtitle" />
          </>
        ) : (
          <>
            <h1 className="executive-v2__title">{header?.greeting}</h1>
            <p className="executive-v2__subtitle">{header?.subtitle}</p>
          </>
        )}
      </div>

      <div className="executive-v2__header-actions">
        <div className="executive-v2__scope-chip" title={organizationName}>
          {organizationName || translate("teamDashOrganizationFallback")}
        </div>
        <div className="executive-v2__date-chip">{todayLabel}</div>
        <button type="button" className="executive-v2__button" onClick={onOpenMissionControl}>
          {translate("executiveOpenMissionControl")}
        </button>
        {header?.generatedAt ? (
          <p className="executive-v2__updated">
            {translate("executiveV2DataUpdated", {
              time: new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
                timeZone: header?.timeZone || undefined
              }).format(new Date(header.generatedAt))
            })}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export function InterviewsTodayCard({ interviews, loading, onOpen }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard
      title={translate("executiveTodaysInterviews")}
      loading={loading}
      action={
        <button type="button" className="executive-v2__link-button" onClick={onOpen}>
          {translate("executiveV2ViewAllTodayAppointments")}
        </button>
      }
    >
      <div className="executive-v2__hero-metric">{interviews?.total ?? 0}</div>
      <dl className="executive-v2__stat-grid">
        <div>
          <dt>{translate("executiveHeroMine")}</dt>
          <dd>{interviews?.mine ?? 0}</dd>
        </div>
        <div>
          <dt>{translate("executiveHeroTeam")}</dt>
          <dd>{interviews?.team ?? 0}</dd>
        </div>
        <div>
          <dt>{translate("executiveHeroConfirmed")}</dt>
          <dd>{interviews?.confirmed ?? 0}</dd>
        </div>
        <div>
          <dt>{translate("executiveHeroWaitingConfirmation")}</dt>
          <dd>{interviews?.waitingConfirmation ?? 0}</dd>
        </div>
        <div>
          <dt>{translate("executiveHeroOutcomePending")}</dt>
          <dd>{interviews?.outcomePending ?? 0}</dd>
        </div>
        <div>
          <dt>{translate("executiveHeroRescheduled")}</dt>
          <dd>{interviews?.rescheduled ?? 0}</dd>
        </div>
      </dl>
    </ExecutiveCard>
  );
}

export function TodayAgendaCard({ agenda = [], loading }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard
      title={translate("executiveV2AgendaToday")}
      loading={loading}
      action={
        <Link className="executive-v2__link-button" to="/app/mission-control">
          {translate("executiveV2ViewAllAppointments")}
        </Link>
      }
    >
      {agenda.length ? (
        <ul className="executive-v2__agenda-list">
          {agenda.map((item) => (
            <li key={item.id}>
              <Link to={item.to} className="executive-v2__agenda-item">
                <span className="executive-v2__agenda-time">{item.timeLabel}</span>
                <span className="executive-v2__agenda-main">
                  <strong>{item.name}</strong>
                  <span>
                    {item.type} · {item.locationLabel}
                  </span>
                </span>
                <span className={`executive-v2__status executive-v2__status--${item.status}`}>
                  {item.statusLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="executive-v2__empty">{translate("executiveV2AgendaEmpty")}</p>
      )}
    </ExecutiveCard>
  );
}

export function MorningSummaryCard({ summary, loading }) {
  const { translate } = useLanguage();

  if (!summary && loading) {
    return (
      <ExecutiveCard title={translate("executiveMorningBrief")} loading>
        <span />
      </ExecutiveCard>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <ExecutiveCard
      title={translate("executiveMorningBrief")}
      action={
        <Link className="executive-v2__link-button" to={summary.to}>
          {translate("executiveV2ViewFullSummary")}
        </Link>
      }
    >
      <ul className="executive-v2__summary-list">
        {summary.items.map((item) => (
          <li key={item.key}>
            <strong>{item.value}</strong> {item.label}
          </li>
        ))}
      </ul>
    </ExecutiveCard>
  );
}

export function RecruitmentFunnelCard({ funnel, loading }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard title={translate("executiveV2RecruitmentFunnel")} loading={loading}>
      {funnel?.stages?.length ? (
        <>
          <div className="executive-v2__funnel">
            {funnel.stages.map((stage, index) => (
              <div key={stage.key} className="executive-v2__funnel-step">
                <div className="executive-v2__funnel-count">{stage.count}</div>
                <div className="executive-v2__funnel-label">{stage.label}</div>
                <div className="executive-v2__funnel-conversion">
                  {stage.conversionPct ?? "—"}
                </div>
                {index < funnel.stages.length - 1 ? (
                  <span className="executive-v2__funnel-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <p className="executive-v2__funnel-total">{funnel.totalConversionLabel}</p>
        </>
      ) : (
        <p className="executive-v2__empty">—</p>
      )}
    </ExecutiveCard>
  );
}

export function ConversationPerformanceCard({ performance, loading }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard title={translate("executiveV2ConversationPerformance")} loading={loading}>
      {performance ? (
        <>
          <ConversationDonut
            segments={performance.segments}
            total={performance.total}
          />
          <div className="executive-v2__conversation-meta">
            <span>{performance.totalLabel}</span>
            <span>
              {translate("executiveV2AvgResponseTime")}: {performance.averageResponseTimeLabel}
            </span>
          </div>
        </>
      ) : (
        <p className="executive-v2__empty">—</p>
      )}
    </ExecutiveCard>
  );
}

export function TodayPrioritiesCard({ priorities = [], loading }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard title={translate("executiveV2TodayPriorities")} loading={loading}>
      {priorities.length ? (
        <ul className="executive-v2__priority-list">
          {priorities.map((item) => (
            <li key={item.key}>
              <Link to={item.to} className="executive-v2__priority-item">
                <span className="executive-v2__priority-count">{item.count}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="executive-v2__empty">{translate("executiveV2PrioritiesEmpty")}</p>
      )}
    </ExecutiveCard>
  );
}

export function AppointmentTrendCard({ trend = [], loading }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard title={translate("executiveV2AppointmentTrend")} loading={loading}>
      <AppointmentTrendChart series={trend} />
      <div className="executive-v2__chart-legend">
        <span>{translate("executiveV2TrendScheduled")}</span>
        <span>{translate("executiveV2TrendConfirmed")}</span>
        <span>{translate("executiveV2TrendCompleted")}</span>
      </div>
    </ExecutiveCard>
  );
}

export function RecentActivityCard({ activity = [], loading }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard title={translate("executiveRecentActivity")} loading={loading}>
      {activity.length ? (
        <ul className="executive-v2__activity-list">
          {activity.map((item) => (
            <li key={item.id}>
              <Link to={item.to} className="executive-v2__activity-item">
                <span>{item.summary}</span>
                <time dateTime={item.timestamp}>
                  {formatAtlasDateTime(item.timestamp)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="executive-v2__empty">{translate("executiveActivityEmpty")}</p>
      )}
    </ExecutiveCard>
  );
}

export function ExecutiveDashboardKpiSection({ cards, loading }) {
  if (loading && !cards.length) {
    return <KpiSkeletonRow />;
  }

  return <KpiRow cards={cards} />;
}
