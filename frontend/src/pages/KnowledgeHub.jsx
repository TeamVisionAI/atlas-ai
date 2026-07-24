import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { bootstrapAtlasSession } from "../services/atlasAuthService";
import {
  fetchKnowledgeDocument,
  fetchKnowledgeTree,
  KnowledgeHubError
} from "../services/knowledgeService";
import MarkdownViewer from "../components/knowledge/MarkdownViewer";
import KnowledgeHubHome from "../components/knowledge/KnowledgeHubHome";
import { parseCurrentStateSections, getDashboardFields } from "../utils/currentStateParser";
import {
  readKnowledgeActivity,
  recordRecentlyOpened,
  recordRecentlyViewed,
  toggleFavorite,
  togglePinned,
  isFavorite,
  isPinned
} from "../utils/knowledgeStorage";
import { searchKnowledgeFiles } from "../utils/knowledgeSearch";
import "./KnowledgeHub.css";

function flattenTree(node, files = []) {
  if (!node) {
    return files;
  }

  if (node.type === "file") {
    files.push(node);
    return files;
  }

  for (const child of node.children || []) {
    flattenTree(child, files);
  }

  return files;
}

function ActivitySection({ title, items, emptyLabel, selectedPath, onSelect, onTogglePin, activity }) {
  if (!items.length) {
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
      {items.map((item) => (
        <div key={item.path} className="knowledge-hub__activity-row">
          <button
            type="button"
            className={`knowledge-hub__recent-item${selectedPath === item.path ? " is-active" : ""}`}
            onClick={() => onSelect(item)}
          >
            <span className="knowledge-hub__recent-title">{item.title}</span>
            <span className="knowledge-hub__recent-path">{item.path}</span>
          </button>
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
    </section>
  );
}

function DocTreeNode({
  node,
  selectedPath,
  depth,
  onSelect,
  activity,
  onToggleFavorite
}) {
  if (node.type === "file") {
    const starred = isFavorite(node.path, activity);

    return (
      <div className="knowledge-hub__tree-file-row">
        <button
          type="button"
          className={`knowledge-hub__tree-file${selectedPath === node.path ? " is-active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          onClick={() => onSelect(node)}
        >
          {node.title || node.name}
        </button>
        <button
          type="button"
          className={`knowledge-hub__icon-button${starred ? " is-active" : ""}`}
          aria-label="Favorite"
          onClick={() => onToggleFavorite(node)}
        >
          {starred ? "★" : "☆"}
        </button>
      </div>
    );
  }

  return (
    <div className="knowledge-hub__tree-folder">
      <div
        className="knowledge-hub__tree-folder-label"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        {node.name}
      </div>
      {(node.children || []).map((child) => (
        <DocTreeNode
          key={`${child.type}-${child.path || child.name}`}
          node={child}
          selectedPath={selectedPath}
          depth={depth + 1}
          onSelect={onSelect}
          activity={activity}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}

export default function KnowledgeHub() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authError, setAuthError] = useState(null);
  const [tree, setTree] = useState(null);
  const [files, setFiles] = useState([]);
  const [defaultPath, setDefaultPath] = useState("CURRENT_STATE.md");
  const [viewMode, setViewMode] = useState("home");
  const [selectedPath, setSelectedPath] = useState("");
  const [document, setDocument] = useState(null);
  const [homeDocument, setHomeDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activity, setActivity] = useState(() => readKnowledgeActivity());
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [pageError, setPageError] = useState(null);
  const initialPathRef = useRef(searchParams.get("path"));
  const loadDocumentRef = useRef(loadDocument);
  loadDocumentRef.current = loadDocument;

  const dashboard = useMemo(() => {
    if (!homeDocument?.content) {
      return getDashboardFields({});
    }

    const sections = parseCurrentStateSections(homeDocument.content);
    return getDashboardFields(sections);
  }, [homeDocument]);

  const loadHomeDocument = useCallback(async () => {
    setLoadingDocument(true);
    setPageError(null);

    try {
      const payload = await fetchKnowledgeDocument(defaultPath);
      setHomeDocument(payload);
      setDocument(null);
      setSelectedPath("");
      setViewMode("home");
      setSearchParams({}, { replace: true });
    } catch (error) {
      console.error("[KnowledgeHub] home document load failed", error);
      setPageError(
        error instanceof KnowledgeHubError
          ? error.message
          : t.knowledgeHubDocumentError
      );
    } finally {
      setLoadingDocument(false);
    }
  }, [defaultPath, setSearchParams, t.knowledgeHubDocumentError]);

  const loadDocument = useCallback(async (documentPath, { openedFrom = "tree" } = {}) => {
    if (!documentPath) {
      return;
    }

    const fileMeta = files.find((file) => file.path === documentPath);
    const openedEntry = {
      path: documentPath,
      title: fileMeta?.title || documentPath,
      updatedAt: fileMeta?.updatedAt || null
    };

    setActivity(recordRecentlyOpened(openedEntry));
    setLoadingDocument(true);
    setPageError(null);
    setViewMode("document");

    try {
      const payload = await fetchKnowledgeDocument(documentPath);
      setDocument(payload);
      setSelectedPath(payload.path);
      setSearchParams({ path: payload.path }, { replace: true });

      const viewedEntry = {
        path: payload.path,
        title: payload.title,
        updatedAt: payload.updatedAt
      };
      setActivity(recordRecentlyViewed(viewedEntry));
    } catch (error) {
      console.error("[KnowledgeHub] document load failed", { documentPath, openedFrom }, error);
      setPageError(
        error instanceof KnowledgeHubError
          ? error.message
          : t.knowledgeHubDocumentError
      );
    } finally {
      setLoadingDocument(false);
    }
  }, [files, setSearchParams, t.knowledgeHubDocumentError]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoadingTree(true);
      setPageError(null);

      try {
        await bootstrapAtlasSession();
        const payload = await fetchKnowledgeTree();

        if (cancelled) {
          return;
        }

        const resolvedDefault = payload.defaultPath || "CURRENT_STATE.md";
        setTree(payload.root);
        setFiles(payload.files || flattenTree(payload.root));
        setDefaultPath(resolvedDefault);

        const requestedPath = initialPathRef.current;

        if (requestedPath) {
          await loadDocumentRef.current(requestedPath, { openedFrom: "url" });
        } else {
          setViewMode("home");
          setLoadingDocument(true);

          try {
            const homePayload = await fetchKnowledgeDocument(resolvedDefault);
            if (!cancelled) {
              setHomeDocument(homePayload);
            }
          } catch (error) {
            if (!cancelled) {
              console.error("[KnowledgeHub] home initialization failed", error);
              setPageError(
                error instanceof KnowledgeHubError
                  ? error.message
                  : t.knowledgeHubDocumentError
              );
            }
          } finally {
            if (!cancelled) {
              setLoadingDocument(false);
            }
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
  }, [t.knowledgeHubAuthRequired, t.knowledgeHubDocumentError, t.knowledgeHubLoadError]);

  const searchResults = useMemo(() => {
    return searchKnowledgeFiles(files, searchQuery);
  }, [files, searchQuery]);

  function handleSelectFile(file) {
    if (!file?.path) {
      return;
    }

    if (file.path === defaultPath && !searchParams.get("path")) {
      loadHomeDocument();
      return;
    }

    if (file.path === selectedPath && viewMode === "document") {
      return;
    }

    loadDocument(file.path);
  }

  function handleToggleFavorite(entry) {
    setActivity(toggleFavorite(entry));
  }

  function handleTogglePinned(entry) {
    setActivity(togglePinned(entry));
  }

  function handleGoHome() {
    loadHomeDocument();
  }

  const documentIsFavorite = document ? isFavorite(document.path, activity) : false;
  const documentIsPinned = document ? isPinned(document.path, activity) : false;

  if (authError) {
    return (
      <div className="knowledge-hub">
        <div className="knowledge-hub__status-card">
          <h1>{t.navKnowledge}</h1>
          <p>{authError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-hub">
      <header className="knowledge-hub__header">
        <div>
          <h1 className="knowledge-hub__title">{t.knowledgeHubTitle}</h1>
          <p className="knowledge-hub__subtitle">{t.knowledgeHubSubtitle}</p>
        </div>
        <div className="knowledge-hub__header-actions">
          <button type="button" className="knowledge-hub__home-button" onClick={handleGoHome}>
            {t.knowledgeHubHomeButton}
          </button>
          {selectedPath ? <p className="knowledge-hub__path">{selectedPath}</p> : null}
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
                searchResults.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className={`knowledge-hub__recent-item${selectedPath === file.path ? " is-active" : ""}`}
                    onClick={() => handleSelectFile(file)}
                  >
                    <span className="knowledge-hub__recent-title">{file.title || file.name}</span>
                    <span className="knowledge-hub__recent-path">
                      {file.folder ? `${file.folder}/` : ""}{file.name}
                    </span>
                  </button>
                ))
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
              />

              <ActivitySection
                title={t.knowledgeHubFavoritesTitle}
                items={activity.favorites}
                emptyLabel={t.knowledgeHubFavoritesEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                activity={activity}
              />

              <ActivitySection
                title={t.knowledgeHubRecentlyOpened}
                items={activity.recentlyOpened}
                emptyLabel={t.knowledgeHubRecentEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                activity={activity}
              />

              <ActivitySection
                title={t.knowledgeHubRecentlyViewed}
                items={activity.recentlyViewed}
                emptyLabel={t.knowledgeHubRecentEmpty}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                activity={activity}
              />

              <section className="knowledge-hub__tree">
                <h2>{t.knowledgeHubTreeTitle}</h2>
                {loadingTree ? (
                  <p className="knowledge-hub__empty">{t.loading}</p>
                ) : tree ? (
                  <DocTreeNode
                    node={tree}
                    selectedPath={selectedPath}
                    depth={0}
                    onSelect={handleSelectFile}
                    activity={activity}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ) : null}
              </section>
            </>
          )}
        </aside>

        <main className="knowledge-hub__main">
          {pageError ? <p className="knowledge-hub__error">{pageError}</p> : null}
          {loadingDocument && viewMode === "document" && !document ? (
            <p className="knowledge-hub__empty">{t.loading}</p>
          ) : null}

          {viewMode === "home" ? (
            loadingDocument && !homeDocument ? (
              <p className="knowledge-hub__empty">{t.loading}</p>
            ) : (
              <KnowledgeHubHome
                t={t}
                dashboard={dashboard}
                homeDocument={homeDocument}
                recentlyOpened={activity.recentlyOpened}
                recentlyViewed={activity.recentlyViewed}
                selectedPath={selectedPath}
                onSelectDocument={handleSelectFile}
                onGoHome={handleGoHome}
              />
            )
          ) : null}

          {viewMode === "document" && document ? (
            <>
              <div className="knowledge-hub__doc-meta">
                <div className="knowledge-hub__doc-meta-row">
                  <h2>{document.title}</h2>
                  <div className="knowledge-hub__doc-actions">
                    <button
                      type="button"
                      className={`knowledge-hub__icon-button${documentIsFavorite ? " is-active" : ""}`}
                      onClick={() =>
                        handleToggleFavorite({
                          path: document.path,
                          title: document.title,
                          updatedAt: document.updatedAt
                        })
                      }
                    >
                      {documentIsFavorite ? "★" : "☆"} {t.knowledgeHubFavoriteAction}
                    </button>
                    <button
                      type="button"
                      className={`knowledge-hub__icon-button${documentIsPinned ? " is-active" : ""}`}
                      onClick={() =>
                        handleTogglePinned({
                          path: document.path,
                          title: document.title,
                          updatedAt: document.updatedAt
                        })
                      }
                    >
                      📌 {t.knowledgeHubPinAction}
                    </button>
                  </div>
                </div>
                {document.updatedAt ? (
                  <p>{t.knowledgeHubUpdatedAt}: {new Date(document.updatedAt).toLocaleString()}</p>
                ) : null}
                {document.folder ? (
                  <p>{t.knowledgeHubFolderLabel}: {document.folder}</p>
                ) : null}
              </div>
              <MarkdownViewer content={document.content} />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
