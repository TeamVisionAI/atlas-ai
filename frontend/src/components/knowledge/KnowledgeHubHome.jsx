import MarkdownViewer from "./MarkdownViewer";
import { KNOWLEDGE_QUICK_LINKS } from "../../config/knowledgeQuickLinks";
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

export default function KnowledgeHubHome({
  t,
  dashboard,
  homeDocument,
  recentlyOpened,
  recentlyViewed,
  selectedPath,
  onSelectDocument,
  onGoHome
}) {
  return (
    <div className="knowledge-home">
      <div className="knowledge-home__hero">
        <div>
          <p className="knowledge-home__eyebrow">{t.knowledgeHubHomeEyebrow}</p>
          <h2>{t.knowledgeHubHomeTitle}</h2>
          {dashboard.lastUpdated ? (
            <p className="knowledge-home__meta">
              {t.knowledgeHubLastUpdated}: {dashboard.lastUpdated}
            </p>
          ) : null}
        </div>
        <button type="button" className="knowledge-home__refresh" onClick={onGoHome}>
          {t.knowledgeHubRefreshHome}
        </button>
      </div>

      <div className="knowledge-home__grid">
        <DashboardCard label={t.knowledgeHubDashCurrentSprint}>
          <p className="knowledge-home__highlight">{dashboard.currentSprint || "—"}</p>
          {dashboard.productStage ? (
            <p className="knowledge-home__muted">{dashboard.productStage}</p>
          ) : null}
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubDashOverallStatus}>
          <p className="knowledge-home__status">{dashboard.overallStatus || "—"}</p>
        </DashboardCard>

        <DashboardCard label={t.knowledgeHubDashObjective} className="knowledge-home__card--wide">
          {dashboard.currentObjective ? (
            <MarkdownViewer content={dashboard.currentObjective} />
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
                {new Date(homeDocument.updatedAt).toLocaleString()}
              </p>
            ) : null}
          </header>
          <MarkdownViewer content={homeDocument.content} />
        </section>
      ) : null}
    </div>
  );
}
