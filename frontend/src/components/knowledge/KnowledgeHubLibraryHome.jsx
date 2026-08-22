import { KNOWLEDGE_CATEGORY_BY_ID } from "../../config/knowledgeHubCategories";
import {
  enrichArticleForDisplay,
  formatArticleUpdatedAt,
  formatReadTimeLabel,
  getArticleDisplayTitle
} from "../../utils/knowledgeDisplay";
import MarkdownViewer from "./MarkdownViewer";
import "./KnowledgeHubLibraryHome.css";

export function KnowledgeHubBreadcrumbs({ trail, onNavigate }) {
  if (!trail?.length) {
    return null;
  }

  return (
    <nav className="knowledge-library__breadcrumbs" aria-label="Breadcrumb">
      {trail.map((item, index) => (
        <span key={`${item.id}-${index}`} className="knowledge-library__breadcrumb-item">
          {index > 0 ? <span className="knowledge-library__breadcrumb-sep">→</span> : null}
          {index < trail.length - 1 && onNavigate ? (
            <button type="button" className="knowledge-library__breadcrumb-link" onClick={() => onNavigate(item, index)}>
              {item.label}
            </button>
          ) : (
            <span className="knowledge-library__breadcrumb-current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function CategoryCard({ category, t, articleCount, onSelect }) {
  return (
    <button type="button" className="knowledge-library__card" onClick={() => onSelect(category)}>
      <span className="knowledge-library__card-icon" aria-hidden="true">
        {String(category.order || "")}
      </span>
      <h3>{t[category.labelKey]}</h3>
      <p>{t[category.descriptionKey]}</p>
      <span className="knowledge-library__card-count">
        {articleCount}{" "}
        {articleCount === 1 ? t.knowledgeHubArticleSingular : t.knowledgeHubArticlePlural}
      </span>
    </button>
  );
}

export function ArticleCard({ article, t, locale, selectedPath, onSelect }) {
  const enriched = enrichArticleForDisplay(article, t, locale);
  if (!enriched) {
    return null;
  }

  return (
    <button
      type="button"
      className={`knowledge-library__article-card${selectedPath === enriched.path ? " is-active" : ""}`}
      onClick={() => onSelect(enriched)}
    >
      <span className="knowledge-library__article-card-title">{enriched.displayTitle}</span>
      {enriched.categoryLabel ? (
        <span className="knowledge-library__article-card-category">{enriched.categoryLabel}</span>
      ) : null}
      {enriched.shortSummary ? (
        <span className="knowledge-library__article-card-summary">{enriched.shortSummary}</span>
      ) : null}
      <span className="knowledge-library__article-card-meta">
        {enriched.readTimeLabel ? <span>{enriched.readTimeLabel}</span> : null}
        {enriched.updatedLabel ? <span>{enriched.updatedLabel}</span> : null}
      </span>
    </button>
  );
}

function ArticleList({ title, items, emptyLabel, onSelect, selectedPath, t, locale }) {
  if (!items.length) {
    return (
      <section className="knowledge-library__panel">
        <h2>{title}</h2>
        <p className="knowledge-library__empty">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <section className="knowledge-library__panel">
      <h2>{title}</h2>
      <div className="knowledge-library__article-list">
        {items.map((item) => (
          <ArticleCard
            key={item.path}
            article={item}
            t={t}
            locale={locale}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

export default function KnowledgeHubLibraryHome({
  t,
  locale,
  categories,
  files,
  recentlyUpdated,
  popularArticles,
  selectedPath,
  onSelectCategory,
  onSelectArticle
}) {
  const sortedCategories = [...(categories || [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );

  return (
    <div className="knowledge-library">
      <div className="knowledge-library__intro">
        <p className="knowledge-library__eyebrow">{t.knowledgeHubHomeEyebrow}</p>
        <h2>{t.knowledgeHubLibraryTitle}</h2>
        <p className="knowledge-library__subtitle">{t.knowledgeHubLibrarySubtitle}</p>
      </div>

      <section className="knowledge-library__categories" aria-label={t.knowledgeHubCategoriesTitle}>
        <h2>{t.knowledgeHubCategoriesTitle}</h2>
        {sortedCategories.length ? (
          <div className="knowledge-library__grid">
            {sortedCategories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                t={t}
                articleCount={category.articleCount || 0}
                onSelect={onSelectCategory}
              />
            ))}
          </div>
        ) : (
          <p className="knowledge-library__empty">{t.knowledgeHubTreeEmpty}</p>
        )}
      </section>

      <div className="knowledge-library__columns">
        <ArticleList
          title={t.knowledgeHubRecentlyUpdated}
          items={recentlyUpdated}
          emptyLabel={t.knowledgeHubRecentEmpty}
          onSelect={onSelectArticle}
          selectedPath={selectedPath}
          t={t}
          locale={locale}
        />
        <ArticleList
          title={t.knowledgeHubMostUsed}
          items={popularArticles}
          emptyLabel={t.knowledgeHubPopularEmpty}
          onSelect={onSelectArticle}
          selectedPath={selectedPath}
          t={t}
          locale={locale}
        />
      </div>
    </div>
  );
}

export function KnowledgeHubCategoryView({
  t,
  locale,
  category,
  articles,
  selectedPath,
  onSelectArticle,
  onBackHome
}) {
  const meta = KNOWLEDGE_CATEGORY_BY_ID[category?.id] || category;
  const trail = [
    { id: "hub", label: t.knowledgeHubTitle, action: "hub" },
    { id: "category", label: meta?.labelKey ? t[meta.labelKey] : category?.id, action: "category" }
  ];

  return (
    <div className="knowledge-library">
      <KnowledgeHubBreadcrumbs
        trail={trail}
        onNavigate={(item) => {
          if (item.action === "hub") {
            onBackHome();
          }
        }}
      />
      <header className="knowledge-library__category-header">
        <h2>{meta?.labelKey ? t[meta.labelKey] : category?.id}</h2>
        {meta?.descriptionKey ? <p>{t[meta.descriptionKey]}</p> : null}
      </header>
      {articles.length ? (
        <div className="knowledge-library__article-list">
          {articles.map((item) => (
            <ArticleCard
              key={item.path}
              article={item}
              t={t}
              locale={locale}
              selectedPath={selectedPath}
              onSelect={onSelectArticle}
            />
          ))}
        </div>
      ) : (
        <p className="knowledge-library__empty">{t.knowledgeHubCategoryEmpty}</p>
      )}
    </div>
  );
}

export function KnowledgeHubArticleView({
  t,
  locale,
  document,
  category,
  isFavorite,
  isPinned,
  onBackHome,
  onBackCategory,
  onToggleFavorite,
  onTogglePinned
}) {
  const displayTitle = getArticleDisplayTitle(document);
  const categoryMeta = KNOWLEDGE_CATEGORY_BY_ID[category?.id || document?.categoryId] || category;
  const trail = [
    { id: "hub", label: t.knowledgeHubTitle, action: "hub" },
    {
      id: "category",
      label: categoryMeta?.labelKey ? t[categoryMeta.labelKey] : "",
      action: "category"
    },
    { id: "article", label: displayTitle, action: "article" }
  ].filter((item) => item.label);

  return (
    <article className="knowledge-library__article">
      <KnowledgeHubBreadcrumbs
        trail={trail}
        onNavigate={(item) => {
          if (item.action === "hub") {
            onBackHome();
          }
          if (item.action === "category") {
            onBackCategory();
          }
        }}
      />
      <header className="knowledge-library__article-header">
        <h1>{displayTitle}</h1>
        <div className="knowledge-library__article-meta">
          {categoryMeta?.labelKey ? <span>{t[categoryMeta.labelKey]}</span> : null}
          {document?.estimatedReadTime ? (
            <span>{formatReadTimeLabel(document, t)}</span>
          ) : null}
          {document?.updatedAt ? (
            <span>
              {t.knowledgeHubUpdatedAt}: {formatArticleUpdatedAt(document.updatedAt, locale)}
            </span>
          ) : null}
        </div>
        {document?.shortSummary ? (
          <p className="knowledge-library__article-lead">{document.shortSummary}</p>
        ) : null}
        <div className="knowledge-hub__doc-actions">
          <button
            type="button"
            className={`knowledge-hub__icon-button${isFavorite ? " is-active" : ""}`}
            onClick={onToggleFavorite}
          >
            {isFavorite ? "★" : "☆"} {t.knowledgeHubFavoriteAction}
          </button>
          <button
            type="button"
            className={`knowledge-hub__icon-button${isPinned ? " is-active" : ""}`}
            onClick={onTogglePinned}
          >
            📌 {t.knowledgeHubPinAction}
          </button>
        </div>
      </header>
      <div className="knowledge-library__article-body">
        <MarkdownViewer content={document.content} />
      </div>
    </article>
  );
}
