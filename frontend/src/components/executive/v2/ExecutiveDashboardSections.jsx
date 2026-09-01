import { Link } from "react-router-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
import { formatAtlasDateTime } from "../../../utils/dateFormatter";
import { ExecutiveCard, KpiRow, KpiSkeletonRow, Skeleton } from "./ExecutiveDashboardCards";
import { AppointmentTrendChart, ConversationDonut } from "./ExecutiveDashboardCharts";

const INTERVIEW_STAT_ROWS = [
  { key: "mine", labelKey: "executiveHeroMine", tone: "blue" },
  { key: "team", labelKey: "executiveHeroTeam", tone: "navy" },
  { key: "confirmed", labelKey: "executiveHeroConfirmed", tone: "green" },
  { key: "waitingConfirmation", labelKey: "executiveHeroWaitingConfirmation", tone: "amber" },
  { key: "outcomePending", labelKey: "executiveHeroOutcomePending", tone: "red" },
  { key: "rescheduled", labelKey: "executiveHeroRescheduled", tone: "purple" }
];

const PRIORITY_TONES = {
  followUps: "urgent",
  pendingConfirmation: "pending",
  newUncontacted: "new",
  outcomes: "urgent",
  stalled: "pending"
};

const ACTIVITY_ICONS = {
  appointment: "calendar",
  message: "message",
  prospect: "user",
  default: "activity"
};

function resolveActivityIcon(summary = "") {
  const value = String(summary).toLowerCase();

  if (value.includes("cita") || value.includes("appointment") || value.includes("interview")) {
    return ACTIVITY_ICONS.appointment;
  }

  if (value.includes("mensaje") || value.includes("message") || value.includes("whatsapp")) {
    return ACTIVITY_ICONS.message;
  }

  if (value.includes("prospect") || value.includes("lead")) {
    return ACTIVITY_ICONS.prospect;
  }

  return ACTIVITY_ICONS.default;
}

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
      <div className="executive-v2__header-main">
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
        </div>
      </div>

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
    </header>
  );
}

export function InterviewsTodayCard({ interviews, loading, onOpen }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard
      title={translate("executiveTodaysInterviews")}
      className="executive-v2__card--interviews"
      loading={loading}
      footer={
        <button type="button" className="executive-v2__button executive-v2__button--secondary" onClick={onOpen}>
          {translate("executiveV2ViewAllTodayAppointments")}
        </button>
      }
    >
      <div className="executive-v2__interviews-hero">{interviews?.total ?? 0}</div>
      <div className="executive-v2__interviews-grid">
        {INTERVIEW_STAT_ROWS.map((row) => (
          <div key={row.key} className="executive-v2__interviews-stat" data-tone={row.tone}>
            <span className="executive-v2__stat-dot" aria-hidden="true" />
            <span className="executive-v2__interviews-stat-label">{translate(row.labelKey)}</span>
            <strong>{interviews?.[row.key] ?? 0}</strong>
          </div>
        ))}
      </div>
    </ExecutiveCard>
  );
}

export function TodayAgendaCard({ agenda = [], loading, onComplete, onRemove }) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard
      title={translate("executiveV2AgendaToday")}
      className="executive-v2__card--agenda"
      loading={loading}
      action={
        <Link className="executive-v2__link-button" to="/app/appointments">
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
              {item.standalone && item.canManage ? (
                <div className="executive-v2__agenda-actions">
                  <Link className="executive-v2__link-button" to="/app/appointments">
                    {translate("agendaEditItem")}
                  </Link>
                  <button
                    type="button"
                    className="executive-v2__link-button"
                    onClick={() => onComplete?.(item)}
                  >
                    {translate("agendaMarkComplete")}
                  </button>
                  <button
                    type="button"
                    className="executive-v2__link-button"
                    onClick={() => onRemove?.(item)}
                  >
                    {translate("agendaRemoveFromAgenda")}
                  </button>
                </div>
              ) : null}
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
      className="executive-v2__card--brief"
      action={
        <Link className="executive-v2__link-button" to={summary.to}>
          {translate("executiveV2ViewFullSummary")}
        </Link>
      }
    >
      <ul className="executive-v2__brief-grid">
        {summary.items.map((item) => (
          <li key={item.key} className="executive-v2__brief-item">
            <span className="executive-v2__brief-value">{item.value}</span>
            <span className="executive-v2__brief-label">{item.label}</span>
          </li>
        ))}
      </ul>
    </ExecutiveCard>
  );
}

export function RecruitmentFunnelCard({
  funnel,
  loading = false,
  unavailable = false,
  unavailableMessage = "",
  onRetry = null,
  retryLabel = "Retry"
}) {
  const { translate } = useLanguage();
  const topCount = funnel?.stages?.[0]?.count || 1;

  return (
    <ExecutiveCard
      title={translate("executiveV2RecruitmentFunnel")}
      className="executive-v2__card--funnel"
      loading={loading}
      unavailable={unavailable}
      unavailableMessage={unavailableMessage}
      onRetry={onRetry}
      retryLabel={retryLabel}
    >
      {funnel?.stages?.length ? (
        <>
          <div className="executive-v2__funnel-viz" role="list">
            {funnel.stages.map((stage, index) => {
              const widthPct = Math.max(32, Math.round((stage.count / topCount) * 100));

              return (
                <div
                  key={stage.key}
                  className="executive-v2__funnel-row"
                  role="listitem"
                  style={{ "--funnel-width": `${widthPct}%` }}
                >
                  <div className="executive-v2__funnel-bar" data-stage={index}>
                    <span className="executive-v2__funnel-bar-label">{stage.label}</span>
                  </div>
                  <div className="executive-v2__funnel-metrics">
                    <strong>{stage.count}</strong>
                    <span>{stage.conversionPct ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="executive-v2__funnel-total">{funnel.totalConversionLabel}</p>
        </>
      ) : (
        <p className="executive-v2__empty">—</p>
      )}
    </ExecutiveCard>
  );
}

export function ConversationPerformanceCard({
  performance,
  loading = false,
  unavailable = false,
  unavailableMessage = "",
  onRetry = null,
  retryLabel = "Retry"
}) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard
      title={translate("executiveV2ConversationPerformance")}
      className="executive-v2__card--conversation"
      loading={loading}
      unavailable={unavailable}
      unavailableMessage={unavailableMessage}
      onRetry={onRetry}
      retryLabel={retryLabel}
    >
      {performance ? (
        <>
          <ConversationDonut segments={performance.segments} total={performance.total} />
          <p className="executive-v2__conversation-total">{performance.totalLabel}</p>
          <p className="executive-v2__conversation-response">
            {translate("executiveV2AvgResponseTime")}:{" "}
            <strong>{performance.averageResponseTimeLabel}</strong>
          </p>
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
    <ExecutiveCard
      title={translate("executiveV2TodayPriorities")}
      className="executive-v2__card--priorities"
      loading={loading}
    >
      {priorities.length ? (
        <ul className="executive-v2__priority-list">
          {priorities.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="executive-v2__priority-item"
                data-tone={PRIORITY_TONES[item.key] || "pending"}
              >
                <span className="executive-v2__priority-icon" aria-hidden="true" />
                <span className="executive-v2__priority-copy">
                  <strong>{item.count}</strong>
                  <span>{item.label}</span>
                </span>
                <span className="executive-v2__priority-arrow" aria-hidden="true">
                  →
                </span>
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

export function AppointmentTrendCard({
  trend = [],
  loading = false,
  unavailable = false,
  unavailableMessage = "",
  onRetry = null,
  retryLabel = "Retry"
}) {
  const { translate } = useLanguage();

  return (
    <ExecutiveCard
      title={translate("executiveV2AppointmentTrend")}
      loading={loading}
      unavailable={unavailable}
      unavailableMessage={unavailableMessage}
      onRetry={onRetry}
      retryLabel={retryLabel}
    >
      <AppointmentTrendChart series={trend} />
      <div className="executive-v2__chart-legend">
        <span className="executive-v2__legend-item executive-v2__legend-item--scheduled">
          {translate("executiveV2TrendScheduled")}
        </span>
        <span className="executive-v2__legend-item executive-v2__legend-item--confirmed">
          {translate("executiveV2TrendConfirmed")}
        </span>
        <span className="executive-v2__legend-item executive-v2__legend-item--completed">
          {translate("executiveV2TrendCompleted")}
        </span>
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
                <span
                  className="executive-v2__activity-icon"
                  data-icon={resolveActivityIcon(item.summary)}
                  aria-hidden="true"
                />
                <span className="executive-v2__activity-copy">{item.summary}</span>
                <time dateTime={item.timestamp} className="executive-v2__activity-time">
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

export function ExecutiveDashboardKpiSection({
  cards,
  loading = false,
  unavailable = false,
  unavailableMessage = "",
  onRetry = null,
  retryLabel = "Retry"
}) {
  if (loading && !cards.length && !unavailable) {
    return <KpiSkeletonRow />;
  }

  return (
    <KpiRow
      cards={cards}
      unavailable={unavailable}
      unavailableMessage={unavailableMessage}
      onRetry={onRetry}
      retryLabel={retryLabel}
    />
  );
}
