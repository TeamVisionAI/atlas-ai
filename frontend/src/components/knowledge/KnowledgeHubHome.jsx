import MarkdownViewer from "./MarkdownViewer";
import { KNOWLEDGE_QUICK_LINKS } from "../../config/knowledgeQuickLinks";
import {
  formatBannerDescription,
  formatGeneratedTimestamp,
  formatMetaReviewStatus,
  formatPlatformTitle,
  formatReleaseBadge,
  formatSprintLabel
} from "../../utils/platformStatusDisplay";
import "./KnowledgeHubHome.css";

function DashboardCard({ label, children, className = "" }) {
  return (
    <section className={`knowledge-home__card ${className}`.trim()}>
      <h3>{label}</h3>
      <div className="knowledge-home__card-body">{children}</div>
    </section>
  );
}

function ActivityList({ items, emptyLabel, onSelect, selectedPath }) {
  if (!items.length) {
    return <p className="knowledge-home__empty">{emptyLabel}</p>;
  }

  return (
    <ul className="knowledge-home__list">
      {items.map((item) => (
        <li key={item.path}>
          <button
            type="button"
            className={`knowledge-home__list-button${selectedPath === item.path ? " is-active" : ""}`}
            onClick={() => onSelect(item)}
          >
            <span className="knowledge-home__list-title">{item.title}</span>
            <span className="knowledge-home__list-path">{item.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FreshnessBadge({ freshness, t }) {
  const label =
    freshness === "live"
      ? t.knowledgeHubPlatformStatusLive
      : freshness === "cached"
        ? t.knowledgeHubPlatformStatusCached
        : t.knowledgeHubPlatformStatusUnknown;

  return (
    <span className={`knowledge-home__freshness knowledge-home__freshness--${freshness}`}>
      {label}
    </span>
  );
}

export default function KnowledgeHubHome({
  t,
  locale,
  homeDocument,
  recentlyOpened,
  recentlyViewed,
  selectedPath,
  onSelectDocument,
  onRefreshHome,
  platformStatus,
  platformStatusLoading,
  platformStatusRefreshError,
  platformStatusFreshness
}) {
  const platform = platformStatus?.platform;
  const sprint = platformStatus?.sprint;
  const git = platformStatus?.git;
  const external = platformStatus?.external;
  const environmentHealth = platformStatus?.environmentHealth || [];

  const sprintLabel = formatSprintLabel(sprint) || t.knowledgeHubSprintUnknown;
  const releaseBadge = formatReleaseBadge(platform);
  const bannerTitle = formatPlatformTitle(platform);
  const bannerDescription = formatBannerDescription(platform, sprint);
  const lastUpdated =
    platformStatus?.documentation?.lastUpdated || platformStatus?.generatedAt || null;
  const generatedLabel = formatGeneratedTimestamp(platformStatus?.generatedAt, locale);

  return (
    <div className="knowledge-home">
      {releaseBadge ? (
        <section className="knowledge-home__rc1-banner" aria-label={bannerTitle}>
          <div className="knowledge-home__rc1-banner-content">
            <span className="knowledge-home__rc1-badge">{releaseBadge}</span>
            <h2 className="knowledge-home__rc1-title">{bannerTitle}</h2>
            {bannerDescription ? (
              <p className="knowledge-home__rc1-description">{bannerDescription}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="knowledge-home__hero">
        <div>
          <p className="knowledge-home__eyebrow">{t.knowledgeHubHomeEyebrow}</p>
          <h2>{t.knowledgeHubHomeTitle}</h2>
          <div className="knowledge-home__version">
            <p>{formatPlatformTitle(platform)}</p>
            {platform?.releaseLabel && platform.releaseLabel !== "Unknown" ? (
              <p>
                {t.knowledgeHubVersionReleasePrefix} {platform.releaseLabel}
              </p>
            ) : null}
            {platform?.certification && platform.certification !== "Unknown" ? (
              <p className="knowledge-home__version-certified">{platform.certification}</p>
            ) : null}
            {platform?.certificationDate ? (
              <p className="knowledge-home__version-date">{platform.certificationDate}</p>
            ) : null}
          </div>
          {lastUpdated ? (
            <p className="knowledge-home__meta">
              {t.knowledgeHubLastUpdated}: {formatGeneratedTimestamp(lastUpdated, locale)}
            </p>
          ) : null}
          {generatedLabel ? (
            <p className="knowledge-home__meta">
              {t.knowledgeHubGeneratedAt}: {generatedLabel}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="knowledge-home__refresh"
          onClick={onRefreshHome}
          disabled={platformStatusLoading}
        >
          {platformStatusLoading ? t.loading : t.knowledgeHubRefreshHome}
        </button>
      </div>

      <section className="knowledge-home__status-row" aria-label={t.knowledgeHubPlatformStatusLabel}>
        <FreshnessBadge freshness={platformStatusFreshness} t={t} />
        {git?.branch ? (
          <span className="knowledge-home__status-item">
            {t.knowledgeHubGitBranch}: {git.branch}
            {git.shortCommit ? ` @ ${git.shortCommit}` : ""}
          </span>
        ) : null}
        {git?.commitMessage ? (
          <span className="knowledge-home__status-item knowledge-home__status-item--commit">
            {t.knowledgeHubGitCommit}: {git.commitMessage}
          </span>
        ) : null}
        <span className="knowledge-home__status-item">
          {t.knowledgeHubMetaReviewStatus}:{" "}
          {formatMetaReviewStatus(external?.metaTechProviderStatus, t)}
          <span className="knowledge-home__status-external"> ({t.knowledgeHubMetaReviewExternal})</span>
        </span>
      </section>

      {platformStatusRefreshError ? (
        <p className="knowledge-home__refresh-warning" role="status">
          {t.knowledgeHubRefreshWarning}
        </p>
      ) : null}

      <div className="knowledge-home__grid">
        <DashboardCard label={t.knowledgeHubDashCurrentSprint}>
          <p className="knowledge-home__highlight">{sprintLabel}</p>
          {sprint?.phase ? <p className="knowledge-home__muted">{sprint.phase}</p> : null}
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubDashOverallStatus}>
          <p className="knowledge-home__status knowledge-home__status--certified">
            {platform?.overallStatus && platform.overallStatus !== "Unknown"
              ? platform.overallStatus
              : "—"}
          </p>
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubDashPhase}>
          <p className="knowledge-home__highlight">
            {sprint?.phase || "—"}
          </p>
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubDashObjective} className="knowledge-home__card--wide">
          {sprint?.objective ? (
            <p className="knowledge-home__objective">{sprint.objective}</p>
          ) : (
            <p className="knowledge-home__empty">{t.knowledgeHubDashEmpty}</p>
          )}
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubSystemHealthTitle} className="knowledge-home__card--wide">
          {environmentHealth.length ? (
            <ul className="knowledge-home__health-list">
              {environmentHealth.map((item) => (
                <li key={item.component} className="knowledge-home__health-row">
                  <span className="knowledge-home__health-label">{item.component}</span>
                  <span className="knowledge-home__health-status">{item.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="knowledge-home__empty">{t.knowledgeHubDashEmpty}</p>
          )}
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubRecentlyOpened}>
          <ActivityList
            items={recentlyOpened}
            emptyLabel={t.knowledgeHubRecentEmpty}
            onSelect={onSelectDocument}
            selectedPath={selectedPath}
          />
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubRecentlyViewed}>
          <ActivityList
            items={recentlyViewed}
            emptyLabel={t.knowledgeHubRecentEmpty}
            onSelect={onSelectDocument}
            selectedPath={selectedPath}
          />
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubQuickLinksTitle}>
          <ul className="knowledge-home__quick-links">
            {KNOWLEDGE_QUICK_LINKS.map((link) => (
              <li key={link.path}>
                <button
                  type="button"
                  className="knowledge-home__quick-link"
                  onClick={() => onSelectDocument({ path: link.path, title: t[link.labelKey] })}
                >
                  {t[link.labelKey]}
                </button>
              </li>
            ))}
          </ul>
        </DashboardCard>
      </div>

      {homeDocument ? (
        <section className="knowledge-home__current-state">
          <header className="knowledge-home__current-state-header">
            <h2>{homeDocument.title}</h2>
            {homeDocument.updatedAt ? (
              <p>
                {t.knowledgeHubUpdatedAt}:{" "}
                {new Date(homeDocument.updatedAt).toLocaleString(locale)}
              </p>
            ) : null}
          </header>
          <MarkdownViewer content={homeDocument.content} />
        </section>
      ) : null}
    </div>
  );
}
