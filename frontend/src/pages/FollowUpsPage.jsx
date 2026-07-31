import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import AtlasSelect from "../components/ui/AtlasSelect";
import StatusBadge from "../components/ui/StatusBadge";
import { getFollowUps, FollowUpsError } from "../services/followUpsService";
import {
  buildFollowUpDueDate,
  buildFollowUpPriorityLabel,
  buildFollowUpReasonLabel,
  buildFollowUpRepresentativeLabel,
  buildFollowUpsSummary,
  buildFollowUpStatusLabel,
  getFollowUpFilterOptions,
  getFollowUpSortOptions
} from "../engines/followUpsViewModel";
import { navigateToProspectWorkspace } from "../utils/prospectRoutes";
import "./FollowUpsPage.css";

function statusVariant(status) {
  switch (status) {
    case "overdue":
      return "danger";
    case "due-today":
      return "warning";
    case "upcoming":
      return "info";
    case "completed":
      return "success";
    default:
      return "neutral";
  }
}

function FollowUpRow({ item, translate, locale, onOpenWorkspace }) {
  const dueLabel = buildFollowUpDueDate(item.followUpDate, item.followUpTime, locale);
  const statusLabel = buildFollowUpStatusLabel(item, translate);
  const reasonLabel = buildFollowUpReasonLabel(item, translate);
  const priorityLabel = buildFollowUpPriorityLabel(item, translate);
  const representativeLabel = buildFollowUpRepresentativeLabel(item, translate);

  return (
    <article className="follow-ups-row">
      <button
        type="button"
        className="follow-ups-row__main"
        onClick={() => onOpenWorkspace(item.phone)}
      >
        <div className="follow-ups-row__header">
          <div className="follow-ups-row__identity">
            <h3 className="follow-ups-row__name">{item.name || item.phone}</h3>
            {item.prospectNumber ? (
              <span className="follow-ups-row__number">{item.prospectNumber}</span>
            ) : null}
          </div>
          <StatusBadge variant={statusVariant(item.status)}>{statusLabel}</StatusBadge>
        </div>

        <dl className="follow-ups-row__details">
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnReason")}</dt>
            <dd>{reasonLabel}</dd>
          </div>
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnDue")}</dt>
            <dd>{dueLabel || translate("followUpsDueNotSet")}</dd>
          </div>
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnRepresentative")}</dt>
            <dd>{representativeLabel}</dd>
          </div>
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnPriority")}</dt>
            <dd>
              <span
                className={`follow-ups-row__priority follow-ups-row__priority--${item.status}`}
              >
                {priorityLabel}
              </span>
            </dd>
          </div>
        </dl>
      </button>
    </article>
  );
}

export default function FollowUpsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";

  const activeFilter = searchParams.get("filter") || "all";
  const searchQuery = searchParams.get("q") || "";
  const activeSort = searchParams.get("sort") || "due-date";

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFollowUps = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getFollowUps({
        filter: activeFilter,
        search: searchQuery,
        sort: activeSort
      });
      setPayload(data);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof FollowUpsError ? translate("followUpsLoadError") : err.message
      );
    } finally {
      setLoading(false);
    }
  }, [activeFilter, activeSort, searchQuery, translate]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  useEffect(() => {
    const refreshLiveQueue = () => {
      if (document.visibilityState !== "visible" || loading) {
        return;
      }

      loadFollowUps().catch((err) => {
        console.error(err);
      });
    };

    const intervalId = window.setInterval(refreshLiveQueue, 20000);
    window.addEventListener("focus", refreshLiveQueue);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLiveQueue);
    };
  }, [loadFollowUps, loading]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim();

      if (trimmed === searchQuery.trim()) {
        return;
      }

      const nextParams = new URLSearchParams(searchParams);

      if (trimmed) {
        nextParams.set("q", trimmed);
      } else {
        nextParams.delete("q");
      }

      setSearchParams(nextParams, { replace: true });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery, searchParams, setSearchParams]);

  const filterOptions = useMemo(
    () => getFollowUpFilterOptions(payload?.filters || [], translate),
    [payload?.filters, translate]
  );

  const sortOptions = useMemo(() => getFollowUpSortOptions(translate), [translate]);

  const summary = useMemo(
    () => buildFollowUpsSummary(payload, translate),
    [payload, translate]
  );

  function handleFilterChange(filterId) {
    const nextParams = new URLSearchParams(searchParams);

    if (filterId === "all") {
      nextParams.delete("filter");
    } else {
      nextParams.set("filter", filterId);
    }

    setSearchParams(nextParams, { replace: true });
  }

  function handleSortChange(sortId) {
    const nextParams = new URLSearchParams(searchParams);

    if (sortId === "due-date") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", sortId);
    }

    setSearchParams(nextParams, { replace: true });
  }

  function handleOpenWorkspace(phone) {
    navigateToProspectWorkspace(navigate, phone);
  }

  return (
    <div className="follow-ups-page">
      <header className="follow-ups-page__header">
        <div>
          <h1 className="follow-ups-page__title">{translate("followUpsTitle")}</h1>
          <p className="follow-ups-page__subtitle">{translate("followUpsSubtitle")}</p>
        </div>
      </header>

      <div className="follow-ups-page__toolbar">
        <label className="follow-ups-page__search-label" htmlFor="follow-ups-search">
          {translate("followUpsSearchLabel")}
        </label>
        <input
          id="follow-ups-search"
          type="search"
          className="follow-ups-page__search"
          value={searchInput}
          placeholder={translate("followUpsSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />

        <div className="follow-ups-page__sort">
          <label className="follow-ups-page__sort-label" htmlFor="follow-ups-sort">
            {translate("followUpsSortLabel")}
          </label>
          <AtlasSelect
            id="follow-ups-sort"
            value={activeSort}
            options={sortOptions.map((option) => ({
              value: option.id,
              label: option.label
            }))}
            onChange={handleSortChange}
          />
        </div>
      </div>

      <div
        className="follow-ups-page__filters"
        role="tablist"
        aria-label={translate("followUpsFiltersLabel")}
      >
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === option.id}
            className={`follow-ups-page__filter${activeFilter === option.id ? " is-active" : ""}`}
            onClick={() => handleFilterChange(option.id)}
          >
            {option.label}
            <span className="follow-ups-page__filter-count">{option.count}</span>
          </button>
        ))}
      </div>

      {!loading && payload ? (
        <p className="follow-ups-page__summary">{summary}</p>
      ) : null}

      {error ? <p className="follow-ups-page__error">{error}</p> : null}

      {loading ? (
        <p className="follow-ups-page__status">{translate("followUpsLoading")}</p>
      ) : null}

      {!loading && !payload?.items?.length ? (
        <p className="follow-ups-page__status">{translate("followUpsEmpty")}</p>
      ) : null}

      {!loading && payload?.items?.length ? (
        <div className="follow-ups-page__list">
          {payload.items.map((item) => (
            <FollowUpRow
              key={item.phone}
              item={item}
              translate={translate}
              locale={locale}
              onOpenWorkspace={handleOpenWorkspace}
            />
          ))}
        </div>
      ) : null}

      {!loading && payload?.filteredCount ? (
        <p className="follow-ups-page__footer-hint">{translate("followUpsFooterHint")}</p>
      ) : null}
    </div>
  );
}
