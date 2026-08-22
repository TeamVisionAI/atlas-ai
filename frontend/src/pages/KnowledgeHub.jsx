import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { bootstrapAtlasSession } from "../services/atlasAuthService";
import {
  fetchKnowledgeDocument,
  fetchKnowledgeTree,
  KnowledgeHubError
} from "../services/knowledgeService";
import KnowledgeHubLibraryHome, {
  ArticleCard,
  KnowledgeHubArticleView,
  KnowledgeHubCategoryView
} from "../components/knowledge/KnowledgeHubLibraryHome";
import {
  enrichArticleForDisplay,
  getArticleDisplayTitle,
  isLegacyEngineeringPath,
  isValidAgentLibraryPath,
  normalizeArticlePath
} from "../utils/knowledgeDisplay";
import {
  readKnowledgeActivity,
  recordRecentlyOpened,
  recordRecentlyViewed,
  syncKnowledgeActivityWithCatalog,
  toggleFavorite,
  togglePinned,
  isFavorite,
  isPinned,
  getPopularArticles
} from "../utils/knowledgeStorage";
import { searchKnowledgeFiles } from "../utils/knowledgeSearch";
import "./KnowledgeHub.css";

function ActivitySection({
  title,
  items,
  emptyLabel,
  selectedPath,
  onSelect,
  onTogglePin,
  activity,
  t,
  locale
}) {
  const enrichedItems = items
    .map((item) => enrichArticleForDisplay(item, t, locale))
    .filter(Boolean);

  if (!enrichedItems.length) {
    return (
      <section className="knowledge-hub__activity">
        <h2>{title}</h2>
        <p className="knowledge-hub__empty">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <section className="knowledge-hub__activity">
      <h2>{title}</h2>
      <div className="knowledge-library__article-list knowledge-library__article-list--compact">
        {enrichedItems.map((item) => (
          <div key={item.path} className="knowledge-hub__activity-row">
            <ArticleCard
              article={item}
              t={t}
              locale={locale}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
            {onTogglePin ? (
              <button
                type="button"
                className={`knowledge-hub__icon-button${isPinned(item.path, activity) ? " is-active" : ""}`}
                aria-label="Pin"
                onClick={() => onTogglePin(item)}
              >
                📌
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryBrowseSection({ categories, files, selectedPath, onSelectCategory, onSelectArticle, t, locale }) {
  const grouped = useMemo(() => {
    return [...categories]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((category) => ({
        category,
        articles: files.filter((file) => file.categoryId === category.id)
      }));
  }, [categories, files]);

  return (
    <section className="knowledge-hub__browse">
      <h2>{t.knowledgeHubBrowseTitle}</h2>
      {grouped.map(({ category, articles }) => (
        <div key={category.id} className="knowledge-hub__browse-group">
          <button
            type="button"
            className="knowledge-hub__browse-category"
            onClick={() => onSelectCategory(category)}
          >
            {t[category.labelKey]}
          </button>
          {articles.map((article) => (
            <ArticleCard
              key={article.path}
              article={article}
              t={t}
              locale={locale}
              selectedPath={selectedPath}
              onSelect={onSelectArticle}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

export default function KnowledgeHub() {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authError, setAuthError] = useState(null);
  const [forbiddenError, setForbiddenError] = useState(null);
  const [notEnabledError, setNotEnabledError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [files, setFiles] = useState([]);
  const [viewMode, setViewMode] = useState("home");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [document, setDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activity, setActivity] = useState(() => readKnowledgeActivity());
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [pageError, setPageError] = useState(null);
  const initialPathRef = useRef(normalizeArticlePath(searchParams.get("path") || ""));
  const initialCategoryRef = useRef(searchParams.get("category"));
  const locale = language === "es" ? "es-ES" : "en-US";
  const hubLocale = language === "es" ? "es" : "en";

  const catalogPaths = useMemo(() => new Set(files.map((file) => normalizeArticlePath(file.path))), [files]);

  const buildActivityEntry = useCallback(
    (fileMeta, documentPath) => {
      const source =
        fileMeta || files.find((file) => normalizeArticlePath(file.path) === normalizeArticlePath(documentPath));
      if (!source) {
        return null;
      }
      return {
        path: source.path,
        displayTitle: getArticleDisplayTitle(source),
        shortSummary: source.shortSummary || "",
        categoryId: source.categoryId || null,
        categoryLabelKey: source.categoryLabelKey || null,
        updatedAt: source.updatedAt || null,
        estimatedReadTime: source.estimatedReadTime || null
      };
    },
    [files]
  );

  const loadDocument = useCallback(
    async (documentPath, { openedFrom = "tree" } = {}) => {
      const normalizedPath = normalizeArticlePath(documentPath);
      if (!normalizedPath) {
        return;
      }

      if (isLegacyEngineeringPath(normalizedPath) || !isValidAgentLibraryPath(normalizedPath, catalogPaths)) {
        setDocument(null);
        setSelectedPath("");
        setViewMode("unavailable");
        setSearchParams({}, { replace: true });
        return;
      }

      const fileMeta = files.find((file) => normalizeArticlePath(file.path) === normalizedPath);
      const openedEntry = buildActivityEntry(fileMeta, normalizedPath);
      if (openedEntry) {
        setActivity(recordRecentlyOpened(openedEntry));
      }

      setLoadingDocument(true);
      setPageError(null);
      setViewMode("document");

      try {
        const payload = await fetchKnowledgeDocument(normalizedPath, hubLocale);
        setDocument(payload);
        setSelectedPath(normalizeArticlePath(payload.path));
        setSearchParams({ path: normalizeArticlePath(payload.path) }, { replace: true });

        const viewedEntry = buildActivityEntry(fileMeta, normalizedPath) || {
          path: normalizeArticlePath(payload.path),
          displayTitle: getArticleDisplayTitle(payload),
          shortSummary: payload.shortSummary || "",
          categoryId: payload.categoryId || null,
          categoryLabelKey: payload.categoryLabelKey || null,
          updatedAt: payload.updatedAt || null,
          estimatedReadTime: payload.estimatedReadTime || null
        };
        setActivity(recordRecentlyViewed(viewedEntry));
      } catch (error) {
        console.error("[KnowledgeHub] document load failed", { documentPath: normalizedPath, openedFrom }, error);
        if (error instanceof KnowledgeHubError && error.payload?.status === 404) {
          setDocument(null);
          setSelectedPath("");
          setViewMode("unavailable");
          setSearchParams({}, { replace: true });
          return;
        }
        setPageError(
          error instanceof KnowledgeHubError ? error.message : t.knowledgeHubDocumentError
        );
      } finally {
        setLoadingDocument(false);
      }
    },
    [buildActivityEntry, catalogPaths, files, hubLocale, setSearchParams, t.knowledgeHubDocumentError]
  );

  const loadDocumentRef = useRef(loadDocument);
  loadDocumentRef.current = loadDocument;
  const hasBootstrappedRef = useRef(false);
  const isFirstHubLoadRef = useRef(true);
  const selectedPathRef = useRef(selectedPath);
  const viewModeRef = useRef(viewMode);
  selectedPathRef.current = selectedPath;
  viewModeRef.current = viewMode;

  useEffect(() => {
    let cancelled = false;
    const firstLoad = isFirstHubLoadRef.current;
    isFirstHubLoadRef.current = false;

    async function initialize() {
      setLoadingTree(true);
      setPageError(null);

      try {
        if (!hasBootstrappedRef.current) {
          await bootstrapAtlasSession();
          hasBootstrappedRef.current = true;
        }

        const payload = await fetchKnowledgeTree(hubLocale);

        if (cancelled) {
          return;
        }

        const resolvedFiles = payload.files || [];
        setCategories(payload.categories || []);
        setFiles(resolvedFiles);
        setActivity(syncKnowledgeActivityWithCatalog(resolvedFiles));

        if (firstLoad) {
          const requestedPath = normalizeArticlePath(initialPathRef.current || "");
          const requestedCategory = initialCategoryRef.current;

          if (requestedPath) {
            if (
              isLegacyEngineeringPath(requestedPath) ||
              !resolvedFiles.some((file) => normalizeArticlePath(file.path) === requestedPath)
            ) {
              setViewMode("unavailable");
              setSearchParams({}, { replace: true });
            } else {
              await loadDocumentRef.current(requestedPath, { openedFrom: "url" });
            }
          } else if (requestedCategory && payload.categories?.some((c) => c.id === requestedCategory)) {
            setSelectedCategoryId(requestedCategory);
            setViewMode("category");
          } else {
            setViewMode("home");
          }
        } else if (selectedPathRef.current && viewModeRef.current === "document") {
          const stillValid = resolvedFiles.some(
            (file) => normalizeArticlePath(file.path) === normalizeArticlePath(selectedPathRef.current)
          );
          if (stillValid) {
            await loadDocumentRef.current(selectedPathRef.current, { openedFrom: "locale-change" });
          } else {
            setDocument(null);
            setSelectedPath("");
            setViewMode("unavailable");
            setSearchParams({}, { replace: true });
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("[KnowledgeHub] initialization failed", error);

        if (error instanceof KnowledgeHubError && error.payload?.status === 401) {
          setAuthError(t.knowledgeHubAuthRequired);
          return;
        }

        if (error instanceof KnowledgeHubError && error.payload?.status === 403) {
          if (error.payload?.error === "KNOWLEDGE_HUB_NOT_ENABLED") {
            setNotEnabledError(t.knowledgeHubNotEnabled);
            return;
          }
          setForbiddenError(t.knowledgeHubForbidden);
          return;
        }

        setPageError(
          error instanceof KnowledgeHubError ? error.message : t.knowledgeHubLoadError
        );
      } finally {
        if (!cancelled) {
          setLoadingTree(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [
    t.knowledgeHubAuthRequired,
    t.knowledgeHubDocumentError,
    t.knowledgeHubForbidden,
    t.knowledgeHubLoadError,
    t.knowledgeHubNotEnabled,
    hubLocale,
    setSearchParams
  ]);

  const recentlyUpdated = useMemo(() => {
    return [...files]
      .filter((file) => file.updatedAt)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 8);
  }, [files]);

  const popularArticles = useMemo(
    () => getPopularArticles(files, { limit: 8 }),
    [files, activity]
  );

  const categoryArticles = useMemo(() => {
    if (!selectedCategoryId) {
      return [];
    }
    return files.filter((file) => file.categoryId === selectedCategoryId);
  }, [files, selectedCategoryId]);

  const selectedCategoryMeta = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const searchResults = useMemo(() => {
    return searchKnowledgeFiles(files, searchQuery);
  }, [files, searchQuery]);

  function handleSelectFile(file) {
    const normalizedPath = normalizeArticlePath(file?.path);
    if (!normalizedPath) {
      return;
    }
    if (normalizedPath === normalizeArticlePath(selectedPath) && viewMode === "document") {
      return;
    }
    loadDocument(normalizedPath);
  }

  function handleSelectCategory(category) {
    if (!category?.id) {
      return;
    }
    setSelectedCategoryId(category.id);
    setViewMode("category");
    setDocument(null);
    setSelectedPath("");
    setSearchParams({ category: category.id }, { replace: true });
  }

  function handleGoHome() {
    setViewMode("home");
    setSelectedCategoryId("");
    setDocument(null);
    setSelectedPath("");
    setPageError(null);
    setSearchParams({}, { replace: true });
  }

  function handleBackCategory() {
    if (!selectedCategoryId) {
      handleGoHome();
      return;
    }
    setViewMode("category");
    setDocument(null);
    setSelectedPath("");
    setSearchParams({ category: selectedCategoryId }, { replace: true });
  }

  function handleToggleFavorite(entry) {
    const enriched = buildActivityEntry(entry, entry?.path);
    if (enriched) {
      setActivity(toggleFavorite(enriched));
    }
  }

  function handleTogglePinned(entry) {
    const enriched = buildActivityEntry(entry, entry?.path);
    if (enriched) {
      setActivity(togglePinned(enriched));
    }
  }

  const documentIsFavorite = document ? isFavorite(document.path, activity) : false;
  const documentIsPinned = document ? isPinned(document.path, activity) : false;

  if (authError || forbiddenError || notEnabledError) {
    const message = authError || forbiddenError || notEnabledError;
    return (
      <div className="knowledge-hub">
        <div className="knowledge-hub__status-card" role="alert">
          <h1>{t.knowledgeHubTitle}</h1>
          <p>{message}</p>
        </div>
      </div>
    );
  }

  if (!loadingTree && pageError && !files.length && !document) {
    return (
      <div className="knowledge-hub">
        <div className="knowledge-hub__status-card knowledge-hub__status-card--error" role="alert">
          <h1>{t.knowledgeHubTitle}</h1>
          <p>{pageError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-hub">
      <header className="knowledge-hub__header">
        <div>
          <h1 className="knowledge-hub__title">{t.knowledgeHubTitle}</h1>
          <p className="knowledge-hub__subtitle">{t.knowledgeHubLibrarySubtitle}</p>
        </div>
        <div className="knowledge-hub__header-actions">
          <button type="button" className="knowledge-hub__home-button" onClick={handleGoHome}>
            {t.knowledgeHubHomeButton}
          </button>
        </div>
      </header>

      <div className="knowledge-hub__layout">
        <aside className="knowledge-hub__sidebar">
          <label className="knowledge-hub__search-label" htmlFor="knowledge-search">
            {t.knowledgeHubSearchLabel}
          </label>
          <input
            id="knowledge-search"
            type="search"
            className="knowledge-hub__search"
            placeholder={t.knowledgeHubSearchPlaceholder}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          {searchQuery.trim() ? (
            <div className="knowledge-hub__search-results">
              {searchResults.length ? (
                <div className="knowledge-library__article-list knowledge-library__article-list--compact">
                  {searchResults.map((file) => (
                    <ArticleCard
                      key={file.path}
                      article={file}
                      t={t}
                      locale={locale}
                      selectedPath={selectedPath}
                      onSelect={handleSelectFile}
                    />
                  ))}
                </div>
              ) : (
                <p className="knowledge-hub__empty">{t.knowledgeHubSearchEmpty}</p>
              )}
            </div>
          ) : (
            <>
              <ActivitySection
                title={t.knowledgeHubPinnedTitle}
                items={activity.pinned}
                emptyLabel={t.knowledgeHubPinnedEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                onTogglePin={handleTogglePinned}
                activity={activity}
                t={t}
                locale={locale}
              />

              <ActivitySection
                title={t.knowledgeHubFavoritesTitle}
                items={activity.favorites}
                emptyLabel={t.knowledgeHubFavoritesEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                activity={activity}
                t={t}
                locale={locale}
              />

              <ActivitySection
                title={t.knowledgeHubRecentlyOpened}
                items={activity.recentlyOpened}
                emptyLabel={t.knowledgeHubRecentEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                activity={activity}
                t={t}
                locale={locale}
              />

              <ActivitySection
                title={t.knowledgeHubRecentlyViewed}
                items={activity.recentlyViewed}
                emptyLabel={t.knowledgeHubRecentEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                activity={activity}
                t={t}
                locale={locale}
              />

              {loadingTree ? (
                <p className="knowledge-hub__empty">{t.loading}</p>
              ) : (
                <CategoryBrowseSection
                  categories={categories}
                  files={files}
                  selectedPath={selectedPath}
                  onSelectCategory={handleSelectCategory}
                  onSelectArticle={handleSelectFile}
                  t={t}
                  locale={locale}
                />
              )}
            </>
          )}
        </aside>

        <main className="knowledge-hub__main">
          {pageError && viewMode === "document" ? (
            <p className="knowledge-hub__error">{pageError}</p>
          ) : null}
          {loadingDocument && viewMode === "document" && !document ? (
            <p className="knowledge-hub__empty">{t.loading}</p>
          ) : null}

          {viewMode === "home" ? (
            loadingTree ? (
              <p className="knowledge-hub__empty">{t.loading}</p>
            ) : (
              <KnowledgeHubLibraryHome
                t={t}
                locale={locale}
                categories={categories}
                files={files}
                recentlyUpdated={recentlyUpdated}
                popularArticles={popularArticles}
                selectedPath={selectedPath}
                onSelectCategory={handleSelectCategory}
                onSelectArticle={handleSelectFile}
              />
            )
          ) : null}

          {viewMode === "category" ? (
            <KnowledgeHubCategoryView
              t={t}
              locale={locale}
              category={selectedCategoryMeta}
              articles={categoryArticles}
              selectedPath={selectedPath}
              onSelectArticle={handleSelectFile}
              onBackHome={handleGoHome}
            />
          ) : null}

          {viewMode === "unavailable" ? (
            <div className="knowledge-hub__status-card" role="alert">
              <h2>{t.knowledgeHubArticleUnavailable}</h2>
              <p>{t.knowledgeHubArticleUnavailableDetail}</p>
              <button type="button" className="knowledge-hub__home-button" onClick={handleGoHome}>
                {t.knowledgeHubBackToHub}
              </button>
            </div>
          ) : null}

          {viewMode === "document" && document ? (
            <KnowledgeHubArticleView
              t={t}
              locale={locale}
              document={document}
              category={
                selectedCategoryMeta ||
                (document.categoryId
                  ? { id: document.categoryId, labelKey: document.categoryLabelKey }
                  : null)
              }
              isFavorite={documentIsFavorite}
              isPinned={documentIsPinned}
              onBackHome={handleGoHome}
              onBackCategory={handleBackCategory}
              onToggleFavorite={() =>
                handleToggleFavorite({
                  path: document.path,
                  ...document
                })
              }
              onTogglePinned={() =>
                handleTogglePinned({
                  path: document.path,
                  ...document
                })
              }
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
