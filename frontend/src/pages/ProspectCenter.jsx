import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  getProspectCenter,
  acknowledgeProspectLead,
  claimProspectLead,
  ProspectCenterError
} from "../services/prospectCenterService";
import {
  buildProspectCenterSummary,
  buildProspectLocationLabel,
  buildProspectMilestoneLabel,
  buildProspectPriorityLabel,
  formatProspectInterviewWhen,
  getProspectCenterFilterOptions
} from "../engines/prospectCenterViewModel";
import {
  PROSPECT_CENTER_POLL_INTERVAL_MS,
  PROSPECT_CENTER_SAFE_IDLE_APPLY_MS,
  PROSPECT_CENTER_SEARCH_ACTIVITY_MS,
  canSafeAutoApply,
  countStagedUpdates,
  decideRefreshApply,
  getProspectRowKey,
  isFocusedInteractiveElement,
  mergeOptimisticAcknowledge,
  mergeOptimisticClaim,
  preserveScrollPosition,
  shouldLockListReplacement
} from "../engines/prospectCenterRefreshEngine";
import { buildMissionControlPath } from "../engines/executiveFilterEngine";
import {
  navigateToProspectWorkspace
} from "../utils/prospectRoutes";
import "./ProspectCenter.css";

function ProspectRow({
  item,
  translate,
  locale,
  onOpenWorkspace,
  onOpenQueue,
  onAcknowledge,
  onClaim,
  actionBusyPhone,
  onHoverChange
}) {
  const milestone = buildProspectMilestoneLabel(item, translate);
  const priority = buildProspectPriorityLabel(item, translate);
  const location = buildProspectLocationLabel(item);
  const interviewWhen = formatProspectInterviewWhen(item.interviewAt, locale);
  const badges = item.badges || {};
  const busy = actionBusyPhone === item.phone;

  return (
    <article
      className="prospect-center-row"
      data-prospect-key={getProspectRowKey(item) || undefined}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
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
            <div className="prospect-center-row__badges">
              {badges.new ? (
                <span className="prospect-center-badge prospect-center-badge--new">
                  {translate("prospectCenterBadgeNew")}
                </span>
              ) : null}
              {badges.unassigned ? (
                <span className="prospect-center-badge prospect-center-badge--unassigned">
                  {translate("prospectCenterBadgeUnassigned")}
                </span>
              ) : null}
              {badges.humanAttention ? (
                <span className="prospect-center-badge prospect-center-badge--human">
                  {translate("prospectCenterBadgeHumanAttention")}
                </span>
              ) : null}
              {badges.aiResponding ? (
                <span className="prospect-center-badge prospect-center-badge--ai">
                  {translate("prospectCenterBadgeAi")}
                </span>
              ) : null}
            </div>
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
          {item.source ? (
            <>
              <span className="prospect-center-row__dot">·</span>
              <span>{item.source}</span>
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
        {badges.unassigned ? (
          <button
            type="button"
            className="prospect-center-row__action prospect-center-row__action--primary"
            disabled={busy}
            onClick={() => onClaim(item.phone)}
          >
            {busy
              ? translate("prospectCenterActionWorking")
              : translate("prospectCenterClaimAcknowledge")}
          </button>
        ) : null}
        {badges.new && !badges.unassigned ? (
          <button
            type="button"
            className="prospect-center-row__action prospect-center-row__action--primary"
            disabled={busy}
            onClick={() => onAcknowledge(item.phone)}
          >
            {busy
              ? translate("prospectCenterActionWorking")
              : translate("prospectCenterAcknowledge")}
          </button>
        ) : null}
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
  const { supportMode } = useWorkspace();
  const locale = language === "es" ? "es-US" : "en-US";

  const activeFilter = searchParams.get("filter") || "all";
  const searchQuery = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionBusyPhone, setActionBusyPhone] = useState(null);
  const [hoveringCard, setHoveringCard] = useState(false);
  const [focusedInteractive, setFocusedInteractive] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [filterChanging, setFilterChanging] = useState(false);
  const [dialogOrMenuOpen, setDialogOrMenuOpen] = useState(false);
  const [pointerDownInList, setPointerDownInList] = useState(false);

  const rootRef = useRef(null);
  const payloadRef = useRef(null);
  const pendingPayloadRef = useRef(null);
  const requestGenerationRef = useRef(0);
  const lastInteractionAtRef = useRef(Date.now());
  const searchActivityTimerRef = useRef(null);
  const filterChangingTimerRef = useRef(null);
  const interactionRef = useRef({
    hoveringCard: false,
    focusedInteractive: false,
    searchActive: false,
    filterChanging: false,
    dialogOrMenuOpen: false,
    mutationPending: false,
    pointerDownInList: false
  });

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    pendingPayloadRef.current = pendingPayload;
  }, [pendingPayload]);

  useEffect(() => {
    interactionRef.current = {
      hoveringCard,
      focusedInteractive,
      searchActive,
      filterChanging,
      dialogOrMenuOpen,
      mutationPending: Boolean(actionBusyPhone),
      pointerDownInList
    };
  }, [
    hoveringCard,
    focusedInteractive,
    searchActive,
    filterChanging,
    dialogOrMenuOpen,
    actionBusyPhone,
    pointerDownInList
  ]);

  const interactionLock = shouldLockListReplacement({
    hoveringCard,
    focusedInteractive,
    searchActive,
    filterChanging,
    dialogOrMenuOpen,
    mutationPending: Boolean(actionBusyPhone),
    pointerDownInList
  });

  const markInteraction = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
  }, []);

  const applyPayload = useCallback((nextPayload) => {
    preserveScrollPosition(() => {
      setPayload(nextPayload);
      payloadRef.current = nextPayload;
      setPendingPayload(null);
      pendingPayloadRef.current = null;
    });
  }, []);

  const loadCenter = useCallback(
    async ({ mode = "replace" } = {}) => {
      const requestGeneration = ++requestGenerationRef.current;

      if (mode !== "background") {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await getProspectCenter({
          filter: activeFilter,
          search: searchQuery
        });

        const decision = decideRefreshApply({
          mode,
          locked: shouldLockListReplacement(interactionRef.current),
          requestGeneration,
          latestGeneration: requestGenerationRef.current,
          currentPayload: payloadRef.current,
          nextPayload: data
        });

        if (decision.action === "ignore_stale" || decision.action === "noop") {
          return decision;
        }

        if (decision.action === "stage") {
          setPendingPayload(decision.pending);
          pendingPayloadRef.current = decision.pending;
          return decision;
        }

        if (decision.action === "apply") {
          if (mode === "background") {
            applyPayload(decision.payload);
          } else {
            setPayload(decision.payload);
            payloadRef.current = decision.payload;
            setPendingPayload(null);
            pendingPayloadRef.current = null;
          }
        }

        return decision;
      } catch (err) {
        if (requestGeneration !== requestGenerationRef.current) {
          return { action: "ignore_stale" };
        }

        console.error(err);
        if (mode !== "background") {
          setError(
            err instanceof ProspectCenterError
              ? translate("prospectCenterLoadError")
              : err.message
          );
        }
        return { action: "error" };
      } finally {
        if (
          mode !== "background" &&
          requestGeneration === requestGenerationRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [activeFilter, searchQuery, translate, applyPayload]
  );

  useEffect(() => {
    loadCenter({ mode: "replace" });
  }, [activeFilter, searchQuery, supportMode?.active, supportMode?.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional filter/search/support-mode replace load

  useEffect(() => {
    const refreshLiveCenter = () => {
      if (document.visibilityState !== "visible" || loading) {
        return;
      }

      loadCenter({ mode: "background" }).catch((err) => {
        console.error(err);
      });
    };

    const intervalId = window.setInterval(
      refreshLiveCenter,
      PROSPECT_CENTER_POLL_INTERVAL_MS
    );
    window.addEventListener("focus", refreshLiveCenter);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLiveCenter);
    };
  }, [loadCenter, loading]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    const syncFocus = () => {
      const active = document.activeElement;
      const focused = isFocusedInteractiveElement(active, root);
      setFocusedInteractive(focused);
      if (focused) {
        markInteraction();
      }
    };

    const onPointerDown = (event) => {
      if (event.target?.closest?.(".prospect-center__list, .prospect-center-row")) {
        setPointerDownInList(true);
        markInteraction();
      }
    };

    const onPointerUp = () => {
      setPointerDownInList(false);
    };

    const syncDialogState = () => {
      const open = Boolean(
        root.querySelector("[aria-expanded='true'], [role='dialog'], [aria-modal='true']")
      );
      setDialogOrMenuOpen(open);
      if (open) {
        markInteraction();
      }
    };

    root.addEventListener("focusin", syncFocus);
    root.addEventListener("focusout", syncFocus);
    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    root.addEventListener("click", syncDialogState);

    syncFocus();
    syncDialogState();

    return () => {
      root.removeEventListener("focusin", syncFocus);
      root.removeEventListener("focusout", syncFocus);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("click", syncDialogState);
    };
  }, [markInteraction]);

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

  useEffect(() => {
    if (!pendingPayload) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastInteractionAtRef.current;
      if (
        canSafeAutoApply({
          locked: shouldLockListReplacement(interactionRef.current),
          pendingPayload: pendingPayloadRef.current,
          idleMs,
          idleThresholdMs: PROSPECT_CENTER_SAFE_IDLE_APPLY_MS
        })
      ) {
        applyPayload(pendingPayloadRef.current);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [pendingPayload, applyPayload]);

  const filterOptions = useMemo(
    () => getProspectCenterFilterOptions(payload?.filters || [], translate),
    [payload?.filters, translate]
  );

  const summary = useMemo(
    () => buildProspectCenterSummary(payload, translate),
    [payload, translate]
  );

  const stagedUpdateCount = useMemo(
    () => countStagedUpdates(payload, pendingPayload),
    [payload, pendingPayload]
  );

  function handleFilterChange(filterId) {
    markInteraction();
    setFilterChanging(true);
    if (filterChangingTimerRef.current) {
      window.clearTimeout(filterChangingTimerRef.current);
    }
    filterChangingTimerRef.current = window.setTimeout(() => {
      setFilterChanging(false);
    }, 750);

    const nextParams = new URLSearchParams(searchParams);

    if (filterId === "all") {
      nextParams.delete("filter");
    } else {
      nextParams.set("filter", filterId);
    }

    setSearchParams(nextParams, { replace: true });
  }

  function handleSearchInputChange(event) {
    markInteraction();
    setSearchActive(true);
    setSearchInput(event.target.value);

    if (searchActivityTimerRef.current) {
      window.clearTimeout(searchActivityTimerRef.current);
    }
    searchActivityTimerRef.current = window.setTimeout(() => {
      setSearchActive(false);
    }, PROSPECT_CENTER_SEARCH_ACTIVITY_MS);
  }

  function handleOpenWorkspace(phone) {
    markInteraction();
    navigateToProspectWorkspace(navigate, phone);
  }

  function handleOpenQueue(phone) {
    markInteraction();
    navigate(
      buildMissionControlPath({
        phone,
        filter: activeFilter !== "all" ? activeFilter : undefined
      })
    );
  }

  function handleApplyPendingUpdates() {
    if (!pendingPayloadRef.current) {
      return;
    }

    markInteraction();
    applyPayload(pendingPayloadRef.current);
  }

  async function handleAcknowledge(phone) {
    if (actionBusyPhone) {
      return;
    }

    markInteraction();
    setActionBusyPhone(phone);
    setError(null);
    requestGenerationRef.current += 1;
    const mutationGeneration = requestGenerationRef.current;

    try {
      await acknowledgeProspectLead(phone);

      const optimistic = mergeOptimisticAcknowledge(payloadRef.current, phone);
      if (optimistic) {
        setPayload(optimistic);
        payloadRef.current = optimistic;
      }
      setPendingPayload(null);
      pendingPayloadRef.current = null;

      // Invalidate polls that started during the mutation before reconciling.
      requestGenerationRef.current += 1;
      const reconcileGeneration = requestGenerationRef.current;

      const data = await getProspectCenter({
        filter: activeFilter,
        search: searchQuery
      });

      if (reconcileGeneration !== requestGenerationRef.current) {
        return;
      }

      const decision = decideRefreshApply({
        mode: "replace",
        locked: false,
        requestGeneration: reconcileGeneration,
        latestGeneration: requestGenerationRef.current,
        currentPayload: payloadRef.current,
        nextPayload: data
      });

      if (decision.action === "apply") {
        setPayload(decision.payload);
        payloadRef.current = decision.payload;
      }
    } catch (err) {
      console.error(err);
      setError(translate("prospectCenterAcknowledgeError"));
    } finally {
      if (mutationGeneration <= requestGenerationRef.current) {
        setActionBusyPhone(null);
      }
    }
  }

  async function handleClaim(phone) {
    if (actionBusyPhone) {
      return;
    }

    markInteraction();
    setActionBusyPhone(phone);
    setError(null);
    requestGenerationRef.current += 1;
    const mutationGeneration = requestGenerationRef.current;

    try {
      await claimProspectLead(phone);

      const optimistic = mergeOptimisticClaim(payloadRef.current, phone);
      if (optimistic) {
        setPayload(optimistic);
        payloadRef.current = optimistic;
      }
      setPendingPayload(null);
      pendingPayloadRef.current = null;

      // Invalidate polls that started during the mutation before reconciling.
      requestGenerationRef.current += 1;
      const reconcileGeneration = requestGenerationRef.current;

      const data = await getProspectCenter({
        filter: activeFilter,
        search: searchQuery
      });

      if (reconcileGeneration !== requestGenerationRef.current) {
        return;
      }

      const decision = decideRefreshApply({
        mode: "replace",
        locked: false,
        requestGeneration: reconcileGeneration,
        latestGeneration: requestGenerationRef.current,
        currentPayload: payloadRef.current,
        nextPayload: data
      });

      if (decision.action === "apply") {
        setPayload(decision.payload);
        payloadRef.current = decision.payload;
      }
    } catch (err) {
      console.error(err);
      setError(translate("prospectCenterClaimError"));
    } finally {
      if (mutationGeneration <= requestGenerationRef.current) {
        setActionBusyPhone(null);
      }
    }
  }

  return (
    <div className="prospect-center" ref={rootRef}>
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
          onChange={handleSearchInputChange}
          onFocus={() => {
            setSearchActive(true);
            markInteraction();
          }}
          onBlur={() => {
            window.setTimeout(() => setSearchActive(false), PROSPECT_CENTER_SEARCH_ACTIVITY_MS);
          }}
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

      {stagedUpdateCount > 0 ? (
        <div className="prospect-center__updates" role="status">
          <span>
            {translate("prospectCenterUpdatesAvailable", { count: stagedUpdateCount })}
          </span>
          <button
            type="button"
            className="prospect-center__updates-button"
            onClick={handleApplyPendingUpdates}
          >
            {translate("prospectCenterApplyUpdates")}
          </button>
        </div>
      ) : null}

      {!loading && payload ? (
        <p className="prospect-center__summary">{summary}</p>
      ) : null}

      {error ? <p className="prospect-center__error">{error}</p> : null}

      {loading && !payload ? (
        <p className="prospect-center__status">{translate("prospectCenterLoading")}</p>
      ) : null}

      {!loading && !payload?.items?.length ? (
        <p className="prospect-center__status">{translate("prospectCenterEmpty")}</p>
      ) : null}

      {payload?.items?.length ? (
        <div className="prospect-center__list">
          {payload.items.map((item) => (
            <ProspectRow
              key={getProspectRowKey(item)}
              item={item}
              translate={translate}
              locale={locale}
              onOpenWorkspace={handleOpenWorkspace}
              onOpenQueue={handleOpenQueue}
              onAcknowledge={handleAcknowledge}
              onClaim={handleClaim}
              actionBusyPhone={actionBusyPhone}
              onHoverChange={(hovering) => {
                setHoveringCard(hovering);
                if (hovering) {
                  markInteraction();
                }
              }}
            />
          ))}
        </div>
      ) : null}

      {!loading && payload?.filteredCount ? (
        <p className="prospect-center__footer-hint">{translate("prospectCenterFooterHint")}</p>
      ) : null}

      {interactionLock ? (
        <span className="prospect-center__interaction-lock" hidden aria-hidden="true">
          locked
        </span>
      ) : null}
    </div>
  );
}
