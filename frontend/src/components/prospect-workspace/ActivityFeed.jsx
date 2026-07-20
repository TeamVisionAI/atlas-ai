import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { postMissionControlAction } from "../../services/missionControlService";
import { getProspectActivityFeed } from "../../services/prospectWorkspaceService";
import {
  buildActivityActorLabel,
  buildActivityItemBody,
  buildActivityItemLabel,
  filterActivityItems,
  formatActivityTimestamp,
  getActivityFilterOptions,
  getActivityTypesQuery,
  groupActivityItems
} from "../../engines/activityFeedViewModel";
import "./ActivityFeed.css";

function ActivityFeedItem({ item, translate, locale }) {
  const label = buildActivityItemLabel(item, translate);
  const body = buildActivityItemBody(item);
  const actor = buildActivityActorLabel(item, translate);
  const when = formatActivityTimestamp(item.timestamp, locale);

  return (
    <article className="activity-feed-item" data-activity-type={item.activityType}>
      <div className="activity-feed-item__meta">
        <span className="activity-feed-item__type">{label}</span>
        <span className="activity-feed-item__dot">·</span>
        <span className="activity-feed-item__actor">{actor}</span>
        <span className="activity-feed-item__time">{when}</span>
      </div>
      {body ? <p className="activity-feed-item__body">{body}</p> : null}
    </article>
  );
}

export default function ActivityFeed({ phone, previewItems = [], onNoteAdded }) {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";
  const [items, setItems] = useState(previewItems);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [filterId, setFilterId] = useState("all");
  const [loading, setLoading] = useState(!previewItems.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [error, setError] = useState(null);
  const [noteText, setNoteText] = useState("");

  const filterOptions = useMemo(() => getActivityFilterOptions(translate), [translate]);

  const loadFeed = useCallback(
    async ({ append = false, nextCursor = null, activeFilter = filterId } = {}) => {
      const types = getActivityTypesQuery(activeFilter);
      const payload = await getProspectActivityFeed(phone, {
        limit: 25,
        cursor: append ? nextCursor : null,
        types: types || undefined
      });

      if (!payload) {
        throw new Error("not_found");
      }

      setCursor(payload.nextCursor || null);
      setHasMore(Boolean(payload.hasMore));
      setItems((current) => (append ? [...current, ...payload.items] : payload.items));
    },
    [phone, filterId]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        await loadFeed({ append: false, activeFilter: filterId });
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError(translate("workspaceActivityError"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [phone, filterId, loadFeed, translate]);

  useEffect(() => {
    const refreshLiveFeed = () => {
      if (document.visibilityState !== "visible" || loading || loadingMore) {
        return;
      }

      loadFeed({ append: false, activeFilter: filterId }).catch((err) => {
        console.error(err);
      });
    };

    const intervalId = window.setInterval(refreshLiveFeed, 15000);
    window.addEventListener("focus", refreshLiveFeed);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLiveFeed);
    };
  }, [phone, filterId, loadFeed, loading, loadingMore]);

  const visibleItems = useMemo(
    () => filterActivityItems(items, filterId),
    [items, filterId]
  );

  const groupedItems = useMemo(
    () => groupActivityItems(visibleItems, translate),
    [visibleItems, translate]
  );

  async function handleLoadMore() {
    if (!hasMore || loadingMore || !cursor) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      await loadFeed({ append: true, nextCursor: cursor, activeFilter: filterId });
    } catch (err) {
      console.error(err);
      setError(translate("workspaceActivityError"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmitNote(event) {
    event.preventDefault();
    const text = noteText.trim();

    if (!text || submittingNote) {
      return;
    }

    setSubmittingNote(true);
    setError(null);

    try {
      const result = await postMissionControlAction(phone, "notes", { text });

      if (!result.success) {
        setError(result.message || translate("workspaceActivityNoteError"));
        return;
      }

      setNoteText("");
      await loadFeed({ append: false, activeFilter: filterId });
      onNoteAdded?.();
    } catch (err) {
      console.error(err);
      setError(translate("workspaceActivityNoteError"));
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <section className="activity-feed" aria-label={translate("workspaceSectionActivity")}>
      <div className="activity-feed__header">
        <h2 className="workspace-eyebrow">{translate("workspaceSectionActivity")}</h2>
        <div className="activity-feed__filters" role="tablist" aria-label={translate("workspaceActivityFiltersLabel")}>
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filterId === option.id}
              className={`activity-feed__filter${filterId === option.id ? " is-active" : ""}`}
              onClick={() => setFilterId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <form className="activity-feed__composer" onSubmit={handleSubmitNote}>
        <label className="activity-feed__composer-label" htmlFor="activity-note-input">
          {translate("workspaceActivityAddNoteLabel")}
        </label>
        <textarea
          id="activity-note-input"
          className="activity-feed__composer-input"
          rows={3}
          value={noteText}
          placeholder={translate("workspaceActivityAddNotePlaceholder")}
          onChange={(event) => setNoteText(event.target.value)}
          disabled={submittingNote}
        />
        <button
          type="submit"
          className="activity-feed__composer-submit"
          disabled={submittingNote || !noteText.trim()}
        >
          {submittingNote ? translate("workspaceActivitySavingNote") : translate("workspaceActivityAddNote")}
        </button>
      </form>

      {error ? <p className="activity-feed__error">{error}</p> : null}

      {loading ? (
        <p className="activity-feed__status">{translate("workspaceActivityLoading")}</p>
      ) : null}

      {!loading && !visibleItems.length ? (
        <p className="activity-feed__status">{translate("workspaceActivityEmpty")}</p>
      ) : null}

      {!loading && groupedItems.length ? (
        <div className="activity-feed__groups">
          {groupedItems.map((group) => (
            <section key={group.id} className="activity-feed__group">
              <h3 className="activity-feed__group-label">{group.label}</h3>
              <div className="activity-feed__list">
                {group.items.map((item) => (
                  <ActivityFeedItem
                    key={item.id}
                    item={item}
                    translate={translate}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {hasMore && !loading ? (
        <button
          type="button"
          className="activity-feed__load-more"
          onClick={handleLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? translate("workspaceActivityLoadingMore") : translate("workspaceActivityLoadMore")}
        </button>
      ) : null}
    </section>
  );
}
