import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { getProspectCenter, ProspectCenterError } from "../services/prospectCenterService";
import {
  buildProspectCenterSummary,
  buildProspectLocationLabel,
  buildProspectMilestoneLabel,
  buildProspectPriorityLabel,
  formatProspectInterviewWhen,
  getProspectCenterFilterOptions
} from "../engines/prospectCenterViewModel";
import { buildMissionControlPath } from "../engines/executiveFilterEngine";
import {
  buildProspectCenterPath,
  buildProspectWorkspacePath
} from "../utils/prospectRoutes";
import "./ProspectCenter.css";

function ProspectRow({ item, translate, locale, onOpenWorkspace, onOpenQueue }) {
  const milestone = buildProspectMilestoneLabel(item, translate);
  const priority = buildProspectPriorityLabel(item, translate);
  const location = buildProspectLocationLabel(item);
  const interviewWhen = formatProspectInterviewWhen(item.interviewAt, locale);

  return (
    <article className="prospect-center-row">
      <button
        type="button"
        className="prospect-center-row__main"
        onClick={() => onOpenWorkspace(item.phone)}
      >
        <div className="prospect-center-row__header">
          <div>
            <h3 className="prospect-center-row__name">{item.name || item.phone}</h3>
            {item.prospectNumber ? (
              <span className="prospect-center-row__number">{item.prospectNumber}</span>
            ) : null}
          </div>
          <span className={`prospect-center-row__priority priority-${item.missionControlPriority}`}>
            {priority}
          </span>
        </div>

        <div className="prospect-center-row__meta">
          <span className="prospect-center-row__milestone">{milestone}</span>
          {location ? (
            <>
              <span className="prospect-center-row__dot">·</span>
              <span>{location}</span>
            </>
          ) : null}
          {interviewWhen ? (
            <>
              <span className="prospect-center-row__dot">·</span>
              <span>{interviewWhen}</span>
            </>
          ) : null}
        </div>

        {item.stalledAt ? (
          <p className="prospect-center-row__stall">{translate("prospectCenterStalled")}</p>
        ) : null}

        {item.lastMessagePreview ? (
          <p className="prospect-center-row__preview">{item.lastMessagePreview}</p>
        ) : null}
      </button>

      <div className="prospect-center-row__actions">
        <button
          type="button"
          className="prospect-center-row__action prospect-center-row__action--primary"
          onClick={() => onOpenWorkspace(item.phone)}
        >
          {translate("prospectCenterOpenWorkspace")}
        </button>
        <button
          type="button"
          className="prospect-center-row__action"
          onClick={() => onOpenQueue(item.phone)}
        >
          {translate("prospectCenterOpenQueue")}
        </button>
      </div>
    </article>
  );
}

export default function ProspectCenter() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";

  const activeFilter = searchParams.get("filter") || "all";
  const searchQuery = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCenter = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getProspectCenter({
        filter: activeFilter,
        search: searchQuery
      });
      setPayload(data);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof ProspectCenterError
          ? translate("prospectCenterLoadError")
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }, [activeFilter, searchQuery, translate]);

  useEffect(() => {
    loadCenter();
  }, [loadCenter]);

  useEffect(() => {
    const refreshLiveCenter = () => {
      if (document.visibilityState !== "visible" || loading) {
        return;
      }

      loadCenter().catch((err) => {
        console.error(err);
      });
    };

    const intervalId = window.setInterval(refreshLiveCenter, 20000);
    window.addEventListener("focus", refreshLiveCenter);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLiveCenter);
    };
  }, [loadCenter, loading]);

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
    () => getProspectCenterFilterOptions(payload?.filters || [], translate),
    [payload?.filters, translate]
  );

  const summary = useMemo(
    () => buildProspectCenterSummary(payload, translate),
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

  function handleOpenWorkspace(phone) {
    navigate(buildProspectWorkspacePath({ phone }));
  }

  function handleOpenQueue(phone) {
    navigate(
      buildMissionControlPath({
        phone,
        filter: activeFilter !== "all" ? activeFilter : undefined
      })
    );
  }

  return (
    <div className="prospect-center">
      <header className="prospect-center__header">
        <div>
          <h1 className="prospect-center__title">{translate("prospectCenterTitle")}</h1>
          <p className="prospect-center__subtitle">{translate("prospectCenterSubtitle")}</p>
        </div>
        <Link to="/mission-control" className="prospect-center__mission-link">
          {translate("prospectCenterGoMissionControl")}
        </Link>
      </header>

      <div className="prospect-center__toolbar">
        <label className="prospect-center__search-label" htmlFor="prospect-center-search">
          {translate("prospectCenterSearchLabel")}
        </label>
        <input
          id="prospect-center-search"
          type="search"
          className="prospect-center__search"
          value={searchInput}
          placeholder={translate("prospectCenterSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>

      <div
        className="prospect-center__filters"
        role="tablist"
        aria-label={translate("prospectCenterFiltersLabel")}
      >
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === option.id}
            className={`prospect-center__filter${activeFilter === option.id ? " is-active" : ""}`}
            onClick={() => handleFilterChange(option.id)}
          >
            {option.label}
            <span className="prospect-center__filter-count">{option.count}</span>
          </button>
        ))}
      </div>

      {!loading && payload ? (
        <p className="prospect-center__summary">{summary}</p>
      ) : null}

      {error ? <p className="prospect-center__error">{error}</p> : null}

      {loading ? (
        <p className="prospect-center__status">{translate("prospectCenterLoading")}</p>
      ) : null}

      {!loading && !payload?.items?.length ? (
        <p className="prospect-center__status">{translate("prospectCenterEmpty")}</p>
      ) : null}

      {!loading && payload?.items?.length ? (
        <div className="prospect-center__list">
          {payload.items.map((item) => (
            <ProspectRow
              key={item.phone}
              item={item}
              translate={translate}
              locale={locale}
              onOpenWorkspace={handleOpenWorkspace}
              onOpenQueue={handleOpenQueue}
            />
          ))}
        </div>
      ) : null}

      {!loading && payload?.filteredCount ? (
        <p className="prospect-center__footer-hint">{translate("prospectCenterFooterHint")}</p>
      ) : null}
    </div>
  );
}
