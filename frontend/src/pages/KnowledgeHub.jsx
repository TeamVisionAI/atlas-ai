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
import "./KnowledgeHub.css";

const RECENT_STORAGE_KEY = "atlas_knowledge_recent_v1";
const MAX_RECENT = 8;

function readRecentDocuments() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentDocument(entry) {
  const current = readRecentDocuments().filter((item) => item.path !== entry.path);
  const next = [entry, ...current].slice(0, MAX_RECENT);

  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }

  return next;
}

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

function DocTreeNode({ node, selectedPath, depth, onSelect }) {
  if (node.type === "file") {
    return (
      <button
        type="button"
        className={`knowledge-hub__tree-file${selectedPath === node.path ? " is-active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onSelect(node)}
      >
        {node.title || node.name}
      </button>
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
  const [selectedPath, setSelectedPath] = useState("");
  const [document, setDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentDocuments, setRecentDocuments] = useState(() => readRecentDocuments());
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [pageError, setPageError] = useState(null);
  const initialPathRef = useRef(searchParams.get("path"));

  const loadDocument = useCallback(async (documentPath) => {
    setLoadingDocument(true);
    setPageError(null);

    try {
      const payload = await fetchKnowledgeDocument(documentPath);
      setDocument(payload);
      setSelectedPath(payload.path);
      setSearchParams({ path: payload.path }, { replace: true });

      const recentEntry = {
        path: payload.path,
        title: payload.title,
        updatedAt: payload.updatedAt
      };
      setRecentDocuments(writeRecentDocument(recentEntry));
    } catch (error) {
      console.error("[KnowledgeHub] document load failed", error);
      setPageError(
        error instanceof KnowledgeHubError
          ? error.message
          : t.knowledgeHubDocumentError
      );
    } finally {
      setLoadingDocument(false);
    }
  }, [setSearchParams, t.knowledgeHubDocumentError]);

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

        setTree(payload.root);
        setFiles(payload.files || flattenTree(payload.root));
        setDefaultPath(payload.defaultPath || "CURRENT_STATE.md");

        const requestedPath =
          initialPathRef.current || payload.defaultPath || "CURRENT_STATE.md";
        await loadDocument(requestedPath);
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
  }, [loadDocument, t.knowledgeHubAuthRequired, t.knowledgeHubLoadError]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return files.filter((file) => {
      const haystack = `${file.title || ""} ${file.name || ""} ${file.path || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [files, searchQuery]);

  function handleSelectFile(file) {
    if (!file?.path || file.path === selectedPath) {
      return;
    }

    loadDocument(file.path);
  }

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
        {selectedPath ? (
          <p className="knowledge-hub__path">{selectedPath}</p>
        ) : null}
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
                    <span className="knowledge-hub__recent-path">{file.path}</span>
                  </button>
                ))
              ) : (
                <p className="knowledge-hub__empty">{t.knowledgeHubSearchEmpty}</p>
              )}
            </div>
          ) : (
            <>
              <section className="knowledge-hub__recent">
                <h2>{t.knowledgeHubRecentTitle}</h2>
                {recentDocuments.length ? (
                  recentDocuments.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      className={`knowledge-hub__recent-item${selectedPath === item.path ? " is-active" : ""}`}
                      onClick={() => handleSelectFile(item)}
                    >
                      <span className="knowledge-hub__recent-title">{item.title}</span>
                      <span className="knowledge-hub__recent-path">{item.path}</span>
                    </button>
                  ))
                ) : (
                  <p className="knowledge-hub__empty">{t.knowledgeHubRecentEmpty}</p>
                )}
              </section>

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
                  />
                ) : null}
              </section>
            </>
          )}
        </aside>

        <main className="knowledge-hub__main">
          {pageError ? <p className="knowledge-hub__error">{pageError}</p> : null}
          {loadingDocument && !document ? (
            <p className="knowledge-hub__empty">{t.loading}</p>
          ) : null}
          {document ? (
            <>
              <div className="knowledge-hub__doc-meta">
                <h2>{document.title}</h2>
                {document.updatedAt ? (
                  <p>{t.knowledgeHubUpdatedAt}: {new Date(document.updatedAt).toLocaleString()}</p>
                ) : null}
              </div>
              <MarkdownViewer content={document.content} />
            </>
          ) : null}
          {!document && !loadingDocument && !pageError ? (
            <button
              type="button"
              className="knowledge-hub__home-button"
              onClick={() => loadDocument(defaultPath)}
            >
              {t.knowledgeHubOpenDefault}
            </button>
          ) : null}
        </main>
      </div>
    </div>
  );
}
