import { KNOWLEDGE_CATEGORY_BY_ID } from "../../config/knowledgeHubCategories";
import "./KnowledgeHubLibraryHome.css";

function CategoryCard({ category, t, articleCount, onSelect }) {
  return (
    <button type="button" className="knowledge-library__card" onClick={() => onSelect(category)}>
      <h3>{t[category.labelKey]}</h3>
      <p>{t[category.descriptionKey]}</p>
      <span className="knowledge-library__card-count">
        {articleCount} {articleCount === 1 ? t.knowledgeHubArticleSingular : t.knowledgeHubArticlePlural}
      </span>
    </button>
  );
}

function ArticleList({ title, items, emptyLabel, onSelect, selectedPath, t }) {
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
      <ul className="knowledge-library__list">
        {items.map((item) => (
          <li key={item.path}>
            <button
              type="button"
              className={`knowledge-library__list-button${selectedPath === item.path ? " is-active" : ""}`}
              onClick={() => onSelect(item)}
            >
              <span className="knowledge-library__list-title">{item.title}</span>
              {item.categoryId && KNOWLEDGE_CATEGORY_BY_ID[item.categoryId] ? (
                <span className="knowledge-library__list-meta">
                  {t[KNOWLEDGE_CATEGORY_BY_ID[item.categoryId].labelKey]}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
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
        />
        <ArticleList
          title={t.knowledgeHubMostUsed}
          items={popularArticles}
          emptyLabel={t.knowledgeHubPopularEmpty}
          onSelect={onSelectArticle}
          selectedPath={selectedPath}
          t={t}
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

  return (
    <div className="knowledge-library">
      <button type="button" className="knowledge-library__back" onClick={onBackHome}>
        ← {t.knowledgeHubBackToHub}
      </button>
      <header className="knowledge-library__category-header">
        <h2>{meta?.labelKey ? t[meta.labelKey] : category?.id}</h2>
        {meta?.descriptionKey ? <p>{t[meta.descriptionKey]}</p> : null}
      </header>
      {articles.length ? (
        <ul className="knowledge-library__list">
          {articles.map((item) => (
            <li key={item.path}>
              <button
                type="button"
                className={`knowledge-library__list-button${selectedPath === item.path ? " is-active" : ""}`}
                onClick={() => onSelectArticle(item)}
              >
                <span className="knowledge-library__list-title">{item.title}</span>
                {item.updatedAt ? (
                  <span className="knowledge-library__list-meta">
                    {new Date(item.updatedAt).toLocaleDateString(locale)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="knowledge-library__empty">{t.knowledgeHubCategoryEmpty}</p>
      )}
    </div>
  );
}
