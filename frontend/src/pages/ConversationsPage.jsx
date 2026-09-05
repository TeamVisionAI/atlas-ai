import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  isGlobalSuperAdminControlPlane,
  isSupportModeActive
} from "../security/isGlobalSuperAdminControlPlane";
import { isSuperAdminUser } from "../security/isSuperAdminUser";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import AtlasButton from "../components/ui/AtlasButton";
import AtlasSelect from "../components/ui/AtlasSelect";
import StatusBadge from "../components/ui/StatusBadge";
import HumanWhatsAppComposer from "../components/communication/HumanWhatsAppComposer";
import CommunicationsCenterTimeline from "../features/prospect-workspace/components/CommunicationsCenterTimeline";
import { copyMessageToClipboard } from "../services/whatsappCommunicationService";
import {
  buildConversationHeaderModel,
  resolveEffectiveOwnership,
  canTakeOverConversation,
  canReturnConversationToAtlas,
  resolveThreadActionIds,
  resolveLifecycleActionIds,
  isSuspectedMetaLeadItem,
  shouldShowAttentionWarning,
  isUserFacingConversationGoal,
  conversationsThreadHeaderRegionOrder,
  conversationsThreadRegionOrder,
  resolveConversationUnreadPresentation
} from "../engines/conversationsCenterPresentation";
import {
  isConversationDetailCurrent,
  resolveSelectedTranscriptProspectId,
  shouldCommitConversationDetail
} from "../engines/conversationsSelectionConsistency";
import { localizeCommunicationPreview } from "../engines/communicationClassification.js";
import {
  accumulateNewMessageCount,
  CONVERSATIONS_POLL_MS,
  formatNewMessageIndicatorLabel,
  isTranscriptNearBottom,
  nextNewMessageIndicatorCount,
  shouldForceScrollToLatest
} from "../engines/conversationsTranscriptAnchor";
import { buildMissionControlPath } from "../engines/executiveFilterEngine";
import { resolveConversationListRow } from "../engines/agentNotificationPath";
import { invalidateProspectCommunicationsCache } from "../services/communicationsCenterApi";
import {
  getConversations,
  getConversation,
  getConversationsCenterAccess,
  getConversationsCenterSupportTargets,
  enterConversationsSupportAccess,
  enterConversationsSupportMode,
  exitConversationsSupportMode,
  takeOverConversation,
  returnConversationToAtlas,
  confirmMetaLead,
  markConversationNotLead,
  archiveConversation,
  restoreConversation,
  closeConversation,
  markConversationAsTest,
  markConversationRead,
  ConversationsCenterError,
  clearConversationsCaches,
  readConversationsListCache,
  applyConversationOwnershipPatch
} from "../services/conversationsCenterService";
import {
  CONVERSATIONS_ACCESS_STATE,
  resolveConversationsAccessStateFromError
} from "../engines/conversationsCenterAccess";
import {
  canOpenConversationsSupportView,
  conversationsSupportMutationsAllowed,
  resolveConversationsSupportView,
  resolveConversationsWorkspaceTab
} from "../engines/conversationsWorkspaceScope";
import { resetCanaryProspect } from "../services/platformService";
import "./ConversationsPage.css";

const FILTERS = [
  { id: "active", labelKey: "conversationsFilterActive" },
  { id: "needs_attention", labelKey: "conversationsFilterNeedsAttention" },
  { id: "atlas", labelKey: "conversationsFilterAtlas" },
  { id: "human", labelKey: "conversationsFilterHuman" },
  { id: "archived", labelKey: "conversationsFilterArchived" },
  { id: "test", labelKey: "conversationsFilterTest" }
];

const CLOSE_REASONS = [
  "NOT_INTERESTED",
  "NOT_NOW",
  "WRONG_NUMBER",
  "DO_NOT_CONTACT",
  "OTHER"
];

function ownershipVariant(state) {
  switch (state) {
    case "NEEDS_ATTENTION":
      return "danger";
    case "HUMAN":
      return "warning";
    case "ATLAS":
      return "info";
    default:
      return "neutral";
  }
}

function ownershipLabel(state, translate) {
  switch (state) {
    case "NEEDS_ATTENTION":
      return translate("conversationsOwnershipNeedsAttention");
    case "HUMAN":
      return translate("conversationsOwnershipHuman");
    case "ATLAS":
      return translate("conversationsOwnershipAtlas");
    default:
      return state || "—";
  }
}

function lifecycleLabel(lifecycle, translate) {
  switch (String(lifecycle || "").toUpperCase()) {
    case "SCHEDULED":
      return translate("conversationsLifecycleScheduled");
    case "CLOSED":
      return translate("conversationsLifecycleClosed");
    case "TEST":
      return translate("conversationsLifecycleTest");
    case "ARCHIVED":
      return translate("conversationsLifecycleArchived");
    case "ACTIVE":
      return translate("conversationsLifecycleActive");
    default:
      return lifecycle || "";
  }
}

function formatActivity(iso, locale) {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function conversationsTenantKey({ user, supportMode, controlPlane }) {
  if (controlPlane) {
    return "control-plane";
  }
  return supportMode?.organizationId || user?.organizationId || "none";
}

function inboxCacheKey(filter, organizationId, supportScope = "mine", userId = "") {
  return `${organizationId || "none"}::${userId || "anon"}::${filter || "active"}::::summary::${supportScope || "mine"}`;
}

function ConversationListSkeleton() {
  return (
    <div className="conversations-page__skeleton-list" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="conversations-row conversations-row--skeleton" />
      ))}
    </div>
  );
}

function conversationPhoneLabel(item) {
  if (item?.hasVisiblePhone === false) {
    return "Phone unavailable";
  }
  if (item?.phone && String(item.phone).startsWith("wa:bsuid:")) {
    return "Phone unavailable";
  }
  return item?.phone || "Phone unavailable";
}

function ConversationRow({ item, selected, onSelect, translate, locale }) {
  const unreadUi = resolveConversationUnreadPresentation(item);
  return (
    <button
      type="button"
      className={`conversations-row${selected ? " is-selected" : ""}${unreadUi.unread ? " is-unread" : ""}`}
      onClick={() => onSelect(item)}
    >
      <div className="conversations-row__top">
        <div className="conversations-row__identity">
          <strong className="conversations-row__name">
            {item.displayIdentity || item.name || item.phone}
          </strong>
          {unreadUi.showDot ? (
            <span className="conversations-row__dot" aria-hidden="true" />
          ) : null}
          {unreadUi.displayCount ? (
            <span
              className="conversations-row__unread-count"
              data-testid="conversations-unread-count"
            >
              {unreadUi.displayCount}
            </span>
          ) : null}
        </div>
        {isSuspectedMetaLeadItem(item) ? (
          <StatusBadge variant="warning" data-testid="conversations-suspected-meta-lead">
            {translate("possibleMetaLeadVerify")}
          </StatusBadge>
        ) : (
          <StatusBadge variant={ownershipVariant(item.ownershipState)}>
            {ownershipLabel(item.ownershipState, translate)}
          </StatusBadge>
        )}
      </div>
      <div className="conversations-row__phone">{conversationPhoneLabel(item)}</div>
      {item.inboxLifecycle && item.inboxLifecycle !== "ACTIVE" ? (
        <div className="conversations-row__lifecycle">
          {lifecycleLabel(item.inboxLifecycle, translate)}
        </div>
      ) : null}
      {localizeCommunicationPreview(item, translate) ? (
        <p
          className={`conversations-row__preview${unreadUi.boldPreview ? " is-unread" : ""}`}
        >
          {localizeCommunicationPreview(item, translate)}
        </p>
      ) : null}
      <div className="conversations-row__meta">
        <span>
          {formatActivity(item.lastCommunicationAt || item.lastActivityAt, locale)}
        </span>
        {item.source ? <span>{item.source}</span> : null}
        {isUserFacingConversationGoal(item.conversationGoal) ? (
          <span>{item.conversationGoal}</span>
        ) : null}
      </div>
    </button>
  );
}

export default function ConversationsPage() {
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const tenantCacheKey = conversationsTenantKey({ user, supportMode, controlPlane });
  const locale = language === "es" ? "es-US" : "en-US";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = searchParams.get("filter") || "active";
  const deepLinkProspectId = searchParams.get("prospectId") || "";
  const deepLinkPhone = searchParams.get("phone") || "";
  const workspaceTab = resolveConversationsWorkspaceTab({
    workspaceScopeParam: searchParams.get("workspaceScope") || ""
  });
  const [canUseConversationsSupport, setCanUseConversationsSupport] = useState(false);
  const [accessSupportModeActive, setAccessSupportModeActive] = useState(false);
  const [supportTargets, setSupportTargets] = useState([]);
  const supportModeActive =
    isSupportModeActive(supportMode) || accessSupportModeActive === true;
  const canOpenSupport = canOpenConversationsSupportView({
    canUseConversationsSupport,
    supportModeActive
  });
  const supportView = resolveConversationsSupportView({
    supportUserId: searchParams.get("supportUserId") || "",
    canOpenSupport,
    currentUserId: user?.id || user?.userId || ""
  });
  const supportReadOnly = supportView.active === true && supportView.readOnly === true;
  const supportScopeKey = supportView.active ? `support:${supportView.supportUserId}` : "mine";
  const supportRequest = supportView.active
    ? { supportUserId: supportView.supportUserId }
    : { supportUserId: "" };

  const listUserId = user?.id || user?.userId || "";
  const [payload, setPayload] = useState(() =>
    readConversationsListCache(inboxCacheKey(activeFilter, tenantCacheKey, supportScopeKey, listUserId))
  );
  const [listLoading, setListLoading] = useState(
    () => !readConversationsListCache(inboxCacheKey(activeFilter, tenantCacheKey, supportScopeKey, listUserId))
  );
  const [listError, setListError] = useState(null);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [accessState, setAccessState] = useState(CONVERSATIONS_ACCESS_STATE.UNKNOWN);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [canaryResetOpen, setCanaryResetOpen] = useState(false);
  const [canaryResetReason, setCanaryResetReason] = useState("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [phoneCopyStatus, setPhoneCopyStatus] = useState(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const selectedPhoneRef = useRef(selectedPhone);
  selectedPhoneRef.current = selectedPhone;
  const transcriptRef = useRef(null);
  const nearBottomRef = useRef(true);
  const openingThreadRef = useRef(false);
  const inboundCountRef = useRef(0);
  const lastCommunicationAtRef = useRef(null);
  const loadListRef = useRef(null);
  const ownershipRevisionRef = useRef(0);
  const pendingOwnershipRef = useRef(null);
  const appliedConversationDeepLinkRef = useRef("");

  const loadList = useCallback(async ({ quiet = false, force = false } = {}) => {
    if (controlPlane) {
      setPayload(null);
      setListLoading(false);
      setListError(null);
      return;
    }
    const cacheKey = inboxCacheKey(activeFilter, tenantCacheKey, supportScopeKey, listUserId);
    if (!quiet && !payload) {
      const cached = readConversationsListCache(cacheKey);
      if (cached) {
        setPayload(cached);
        setListLoading(false);
      } else {
        setListLoading(true);
      }
    } else if (!quiet) {
      setListLoading(true);
    }

    if (!quiet) {
      setListError(null);
      setForbidden(false);
      setAccessState(CONVERSATIONS_ACCESS_STATE.UNKNOWN);
    }

    try {
      const data = await getConversations({
        organizationId: tenantCacheKey,
        filter: activeFilter,
        view: "summary",
        userId: listUserId,
        ...supportRequest,
        force
      });
      setPayload(data);
      const selected = (data?.items || []).find(
        (row) => row.phone === selectedPhoneRef.current
      );
      const nextCommAt = selected?.lastCommunicationAt || null;
      if (
        selectedPhoneRef.current &&
        nextCommAt &&
        lastCommunicationAtRef.current &&
        nextCommAt !== lastCommunicationAtRef.current
      ) {
        if (selected?.id) {
          invalidateProspectCommunicationsCache(selected.id);
        }
        setRefreshSignal((n) => n + 1);
      }
      if (nextCommAt) {
        lastCommunicationAtRef.current = nextCommAt;
      }
    } catch (err) {
      if (err instanceof ConversationsCenterError && err.status === 403) {
        setForbidden(true);
        setAccessState(resolveConversationsAccessStateFromError(err));
        setPayload(null);
      } else if (!quiet) {
        setListError(
          err instanceof ConversationsCenterError
            ? translate("conversationsLoadError")
            : err.message
        );
      }
    } finally {
      if (!quiet) {
        setListLoading(false);
      }
    }
  }, [activeFilter, supportScopeKey, supportRequest.supportUserId, translate, controlPlane, tenantCacheKey, listUserId]);
  loadListRef.current = loadList;

  useEffect(() => {
    if (!workspaceTab.unauthorizedTeam) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("workspaceScope");
    setSearchParams(next, { replace: true });
  }, [workspaceTab.unauthorizedTeam, searchParams, setSearchParams]);

  useEffect(() => {
    if (controlPlane) {
      setCanUseConversationsSupport(false);
      setAccessSupportModeActive(false);
      setSupportTargets([]);
      return;
    }
    let cancelled = false;
    getConversationsCenterAccess()
      .then((access) => {
        if (cancelled) {
          return;
        }
        setCanUseConversationsSupport(access?.canUseConversationsSupportAccess === true);
        setAccessSupportModeActive(access?.supportModeActive === true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanUseConversationsSupport(false);
          setAccessSupportModeActive(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [controlPlane, tenantCacheKey, supportMode?.active]);

  useEffect(() => {
    if (!canOpenSupport || controlPlane) {
      setSupportTargets([]);
      return;
    }
    let cancelled = false;
    getConversationsCenterSupportTargets()
      .then((result) => {
        if (!cancelled) {
          setSupportTargets(Array.isArray(result?.items) ? result.items : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupportTargets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canOpenSupport, controlPlane, tenantCacheKey]);

  useEffect(() => {
    clearConversationsCaches();
    setPayload(null);
    setDetail(null);
    setSelectedPhone(null);
    loadList({ force: true });
  }, [tenantCacheKey]); // eslint-disable-line react-hooks/exhaustive-deps -- Support Mode rebind must drop the prior tenant inbox

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Force network so sidebar/thread can converge within poll interval
      // (list cache TTL is otherwise longer than CONVERSATIONS_POLL_MS).
      loadListRef.current?.({ quiet: true, force: true });
    }, CONVERSATIONS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeFilter, supportScopeKey, tenantCacheKey]);

  const loadDetail = useCallback(
    async (phone, { force = false } = {}) => {
      if (!phone) {
        setDetail(null);
        setDetailLoading(false);
        return;
      }
      const ownershipRevisionAtStart = ownershipRevisionRef.current;
      setDetailLoading(true);
      try {
        const data = await getConversation(phone, {
          organizationId: tenantCacheKey,
          force,
          ...supportRequest
        });
        // Stale async guard — rapid A→B must never keep A's detail under B.
        if (
          !shouldCommitConversationDetail({
            requestPhone: phone,
            selectedPhone: selectedPhoneRef.current
          })
        ) {
          return;
        }
        let nextDetail = data;
        const pending = pendingOwnershipRef.current;
        if (
          pending?.phone === phone &&
          ownershipRevisionRef.current !== ownershipRevisionAtStart
        ) {
          nextDetail = applyConversationOwnershipPatch(phone, {
            ownershipState: pending.ownershipState,
            workflow: pending.workflow
          }) || {
            ...data,
            ownershipState: pending.ownershipState,
            needsHumanAttention: Boolean(pending.workflow?.needsHumanAttention),
            conversation: data.conversation
              ? {
                  ...data.conversation,
                  ownershipState: pending.ownershipState,
                  needsHumanAttention: Boolean(
                    pending.workflow?.needsHumanAttention
                  )
                }
              : data.conversation
          };
        }
        setDetail(nextDetail);
      } catch (err) {
        if (
          !shouldCommitConversationDetail({
            requestPhone: phone,
            selectedPhone: selectedPhoneRef.current
          })
        ) {
          return;
        }
        setDetail(null);
        setError(
          err instanceof ConversationsCenterError
            ? translate("conversationsLoadError")
            : err.message
        );
      } finally {
        if (selectedPhoneRef.current === phone) {
          setDetailLoading(false);
        }
      }
    },
    [translate, tenantCacheKey, supportRequest.supportUserId]
  );

  function applyOwnershipMutationResult(phone, result) {
    if (!phone || !result?.ownershipState) {
      return;
    }
    const workflow = result.workflow || {};
    ownershipRevisionRef.current += 1;
    pendingOwnershipRef.current = {
      phone,
      ownershipState: result.ownershipState,
      workflow,
      revision: ownershipRevisionRef.current
    };

    const patchedDetail = applyConversationOwnershipPatch(phone, {
      ownershipState: result.ownershipState,
      workflow
    });

    setPayload((current) => {
      if (!current?.items) {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) =>
          item.phone === phone
            ? {
                ...item,
                ownershipState: result.ownershipState,
                needsHumanAttention: Boolean(workflow.needsHumanAttention)
              }
            : item
        )
      };
    });

    if (
      selectedPhoneRef.current === phone &&
      (patchedDetail || result.ownershipState)
    ) {
      setDetail((current) => {
        const base = patchedDetail || current;
        if (!base) {
          return {
            phone,
            ownershipState: result.ownershipState,
            needsHumanAttention: Boolean(workflow.needsHumanAttention)
          };
        }
        const conversation = base.conversation
          ? {
              ...base.conversation,
              ownershipState: result.ownershipState,
              needsHumanAttention: Boolean(workflow.needsHumanAttention)
            }
          : base.conversation;
        return {
          ...base,
          ownershipState: result.ownershipState,
          needsHumanAttention: Boolean(workflow.needsHumanAttention),
          conversation
        };
      });
    }
  }

  useEffect(() => {
    // Clear prior conversation detail immediately so header never pairs with
    // another prospect's ownership/composer/transcript binding.
    setDetail(null);
    setPhoneCopyStatus(null);
    setNewMessageCount(0);
    openingThreadRef.current = Boolean(selectedPhone);
    nearBottomRef.current = true;
    inboundCountRef.current = 0;

    if (selectedPhone) {
      setDetailLoading(true);
      loadDetail(selectedPhone);
    } else {
      setDetailLoading(false);
      lastCommunicationAtRef.current = null;
    }
  }, [selectedPhone, loadDetail]);

  useEffect(() => {
    const key = `${deepLinkProspectId}|${deepLinkPhone}`;
    if ((!deepLinkProspectId && !deepLinkPhone) || appliedConversationDeepLinkRef.current === key) {
      return;
    }
    const row = resolveConversationListRow({
      items: payload?.items || [],
      prospectId: deepLinkProspectId,
      phone: deepLinkPhone
    });
    if (row?.phone) {
      appliedConversationDeepLinkRef.current = key;
      setSelectedPhone(row.phone);
    }
  }, [payload, deepLinkProspectId, deepLinkPhone]);

  function scrollTranscriptToLatest() {
    const el = transcriptRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setNewMessageCount(0);
  }

  function onTranscriptScroll() {
    nearBottomRef.current = isTranscriptNearBottom(transcriptRef.current);
  }

  const onConversationItemsChange = useCallback((snapshot) => {
    if (!selectedPhoneRef.current || snapshot?.status !== "ready") {
      return;
    }
    const opening = openingThreadRef.current;
    const nearBottom = nearBottomRef.current;
    const previousInbound = inboundCountRef.current;
    const nextInbound = Number(snapshot.inboundCount || 0);
    const delta = nextNewMessageIndicatorCount({
      previousInboundCount: previousInbound,
      nextInboundCount: nextInbound,
      nearBottom,
      opening
    });

    if (opening) {
      openingThreadRef.current = false;
      inboundCountRef.current = nextInbound;
      window.requestAnimationFrame(() => scrollTranscriptToLatest());
      return;
    }

    inboundCountRef.current = nextInbound;
    if (delta > 0 && !nearBottom) {
      setNewMessageCount((count) => accumulateNewMessageCount(count, delta));
      return;
    }

    if (
      shouldForceScrollToLatest({ opening: false, nearBottom }) &&
      nextInbound > previousInbound
    ) {
      window.requestAnimationFrame(() => scrollTranscriptToLatest());
      if (!supportReadOnly) {
        markConversationRead(selectedPhoneRef.current, supportBody())
          .then(() => loadListRef.current?.({ quiet: true }))
          .catch(() => {});
      }
    }
  }, []);

  async function onSelectConversation(row) {
    lastCommunicationAtRef.current = row?.lastCommunicationAt || null;
    setSelectedPhone(row.phone);
    setPayload((current) => {
      if (!current?.items) {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) =>
          item.phone === row.phone
            ? { ...item, unread: false, unreadCount: 0 }
            : item
        )
      };
    });
    if (!supportReadOnly) {
      markConversationRead(row.phone, supportBody({
        lastReadInboundAt: new Date().toISOString()
      }))
        .then(() => loadListRef.current?.({ quiet: true }))
        .catch(() => {});
    }
  }

  async function onJumpToLatest() {
    scrollTranscriptToLatest();
    if (!selectedPhoneRef.current) {
      return;
    }
    try {
      if (!supportReadOnly) {
        await markConversationRead(selectedPhoneRef.current, supportBody({
          lastReadInboundAt: new Date().toISOString()
        }));
      }
      await loadListRef.current?.({ quiet: true });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (selectedPhone && refreshSignal > 0) {
      loadDetail(selectedPhone, { force: true });
    }
  }, [refreshSignal, selectedPhone, loadDetail]);

  const counts = payload?.counts || {
    active: 0,
    all: 0,
    needs_attention: 0,
    atlas: 0,
    human: 0,
    archived: 0,
    test: 0
  };

  const items = payload?.items || [];

  const selectedItem = useMemo(() => {
    const fromList = (payload?.items || []).find((row) => row.phone === selectedPhone) || null;
    if (fromList) {
      return fromList;
    }
    if (isConversationDetailCurrent(detail, selectedPhone)) {
      return detail.conversation || null;
    }
    return null;
  }, [payload, selectedPhone, detail]);

  const matchedDetail = useMemo(
    () => (isConversationDetailCurrent(detail, selectedPhone) ? detail : null),
    [detail, selectedPhone]
  );

  const timelineProspectId = useMemo(
    () =>
      resolveSelectedTranscriptProspectId({
        selectedPhone,
        selectedItem,
        detail: matchedDetail
      }),
    [selectedPhone, selectedItem, matchedDetail]
  );

  function setFilter(filterId) {
    const next = new URLSearchParams(searchParams);
    if (filterId === "active") {
      next.delete("filter");
    } else {
      next.set("filter", filterId);
    }
    setSearchParams(next);
  }

  function setSupportTargetUser(userId) {
    const next = new URLSearchParams(searchParams);
    next.delete("workspaceScope");
    next.delete("conversationsSupport");
    if (userId) {
      next.set("supportUserId", userId);
    } else {
      next.delete("supportUserId");
    }
    setSearchParams(next);
    if (userId && supportModeActive) {
      enterConversationsSupportAccess({
        supportUserId: userId
      }).catch(() => {
        /* audit is best-effort; list/detail still enforce server-side */
      });
    }
    setPayload(null);
    setDetail(null);
    setSelectedPhone(null);
  }

  async function onEnterAdminSupportMode() {
    try {
      await enterConversationsSupportMode();
      const access = await getConversationsCenterAccess();
      setCanUseConversationsSupport(access?.canUseConversationsSupportAccess === true);
      setAccessSupportModeActive(access?.supportModeActive === true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onExitAdminSupportMode() {
    try {
      await exitConversationsSupportMode();
      setAccessSupportModeActive(false);
      setSupportTargetUser("");
    } catch (err) {
      setError(err.message);
    }
  }

  function supportBody(extra = {}) {
    if (!supportView.active) {
      return extra;
    }
    return {
      ...extra,
      supportUserId: supportView.supportUserId
    };
  }

  async function onTakeOver() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      const result = await takeOverConversation(selectedPhone, supportBody());
      applyOwnershipMutationResult(selectedPhone, result);
      await loadList({ force: true });
      setRefreshSignal((n) => n + 1);
      loadDetail(selectedPhone, { force: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onConfirmMetaLead() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      await confirmMetaLead(selectedPhone, supportBody());
      await loadList({ force: true });
      setRefreshSignal((n) => n + 1);
      loadDetail(selectedPhone, { force: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onMarkNotLead() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      await markConversationNotLead(selectedPhone, supportBody());
      await loadList({ force: true });
      setRefreshSignal((n) => n + 1);
      loadDetail(selectedPhone, { force: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onReturnToAtlas() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      const result = await returnConversationToAtlas(selectedPhone, supportBody());
      applyOwnershipMutationResult(selectedPhone, result);
      await loadList({ force: true });
      setRefreshSignal((n) => n + 1);
      loadDetail(selectedPhone, { force: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onArchive() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      await archiveConversation(selectedPhone, supportBody());
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onRestore() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      await restoreConversation(selectedPhone, supportBody());
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onMarkTest() {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      await markConversationAsTest(selectedPhone, supportBody());
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onConfirmCanaryReset() {
    const organizationId = supportMode?.organizationId || user?.organizationId || "";
    const reason = String(canaryResetReason || "").trim();
    if (!timelineProspectId || !organizationId || reason.length < 3 || actionBusy) {
      return;
    }
    setActionBusy(true);
    try {
      await resetCanaryProspect({
        organizationId,
        prospectId: timelineProspectId,
        resetReason: reason
      });
      setCanaryResetOpen(false);
      setCanaryResetReason("");
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onClose(reason) {
    if (!selectedPhone || actionBusy || supportReadOnly) return;
    setActionBusy(true);
    try {
      await closeConversation(selectedPhone, reason, supportBody());
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onCopyPhone(phone) {
    if (!phone) return;
    try {
      await copyMessageToClipboard(phone);
      setPhoneCopyStatus("ok");
      window.setTimeout(() => setPhoneCopyStatus(null), 1800);
    } catch {
      setPhoneCopyStatus("error");
      window.setTimeout(() => setPhoneCopyStatus(null), 2400);
    }
  }

  async function onComposerSent() {
    setRefreshSignal((n) => n + 1);
    await loadList();
    if (selectedPhone) {
      await loadDetail(selectedPhone);
    }
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  if (forbidden) {
    const subtitleKey =
      accessState === CONVERSATIONS_ACCESS_STATE.FORBIDDEN
        ? "conversationsForbidden"
        : "conversationsNotEnabled";
    return (
      <div className="conversations-page">
        <h1 className="conversations-page__title">{translate("conversationsTitle")}</h1>
        <p className="conversations-page__subtitle">{translate(subtitleKey)}</p>
      </div>
    );
  }

  const ownershipState =
    matchedDetail?.ownershipState || selectedItem?.ownershipState || null;
  const needsHumanAttention = Boolean(
    matchedDetail?.needsHumanAttention ??
      matchedDetail?.conversation?.needsHumanAttention ??
      selectedItem?.needsHumanAttention
  );
  // Sticky HUMAN remains HUMAN for controls; stall attention is a separate badge.
  const effectiveOwnership = resolveEffectiveOwnership(ownershipState);
  const allowSupportMutations = conversationsSupportMutationsAllowed(supportView);
  const showTakeOver = allowSupportMutations && canTakeOverConversation(effectiveOwnership);
  const showReturnToAtlas = allowSupportMutations && canReturnConversationToAtlas(effectiveOwnership);
  const showAttentionWarning = shouldShowAttentionWarning({
    ownershipState,
    needsHumanAttention
  });
  // Defense in depth: one action list from effectiveOwnership.
  const suspectedMetaLead = isSuspectedMetaLeadItem({
    ...selectedItem,
    ...matchedDetail?.conversation,
    suspectedMetaLead:
      selectedItem?.suspectedMetaLead ||
      matchedDetail?.conversation?.suspectedMetaLead,
    metaLeadReview:
      selectedItem?.metaLeadReview ||
      matchedDetail?.conversation?.metaLeadReview
  });
  const threadActionIds = resolveThreadActionIds({
    ownershipState,
    effectiveOwnership,
    suspectedMetaLead
  });
  const headerRegions = conversationsThreadHeaderRegionOrder();
  const threadRegions = conversationsThreadRegionOrder();
  const inboxLifecycle =
    selectedItem?.inboxLifecycle ||
    matchedDetail?.conversation?.inboxLifecycle ||
    "ACTIVE";
  const lifecycleActionIds = resolveLifecycleActionIds({ inboxLifecycle });
  const headerModel = buildConversationHeaderModel({
    name: selectedItem?.name || matchedDetail?.conversation?.name || null,
    displayIdentity:
      selectedItem?.displayIdentity ||
      matchedDetail?.conversation?.displayIdentity ||
      null,
    hasVisiblePhone:
      selectedItem?.hasVisiblePhone ??
      matchedDetail?.conversation?.hasVisiblePhone ??
      null,
    phone:
      selectedItem?.phone ||
      matchedDetail?.phone ||
      matchedDetail?.conversation?.phone ||
      selectedPhone ||
      null,
    source: selectedItem?.source || matchedDetail?.conversation?.source || null,
    ownershipState,
    appointmentStatus:
      selectedItem?.appointmentStatus ||
      matchedDetail?.conversation?.appointmentStatus ||
      null,
    canonicalMilestone:
      selectedItem?.canonicalMilestone ||
      matchedDetail?.conversation?.canonicalMilestone ||
      null,
    currentStep:
      selectedItem?.currentStep ||
      matchedDetail?.conversation?.currentStep ||
      null,
    conversationGoal:
      selectedItem?.conversationGoal ||
      matchedDetail?.conversation?.conversationGoal ||
      null,
    inboxLifecycle,
    inboxCloseReason:
      selectedItem?.inboxCloseReason ||
      matchedDetail?.conversation?.inboxCloseReason ||
      null,
    needsHumanAttention
  });
  const showConversationGoalChip = isUserFacingConversationGoal(
    headerModel.conversationGoal
  );

  return (
    <div className="conversations-page">
      <header className="conversations-page__header">
        <div>
          <h1 className="conversations-page__title">{translate("conversationsTitle")}</h1>
          <p className="conversations-page__subtitle">
            {supportReadOnly
              ? translate("conversationsSupportReadOnlySubtitle")
              : supportView.active
                ? translate("conversationsSupportSubtitle")
                : translate("conversationsSubtitle")}
          </p>
        </div>
        {counts.needs_attention > 0 ? (
          <StatusBadge variant="danger">
            {translate("conversationsNeedsAttentionCount").replace(
              "{count}",
              String(counts.needs_attention)
            )}
          </StatusBadge>
        ) : null}
      </header>

      {canUseConversationsSupport && !supportModeActive && !isSuperAdminUser(user) ? (
        <div className="conversations-page__support" data-testid="conversations-support-enter">
          <strong className="conversations-page__support-label">
            {translate("conversationsSupportIdleLabel")}
          </strong>
          <AtlasButton type="button" variant="secondary" onClick={onEnterAdminSupportMode}>
            {translate("conversationsSupportEnter")}
          </AtlasButton>
        </div>
      ) : null}

      {canOpenSupport ? (
        <div
          className={`conversations-page__support${supportReadOnly ? " is-readonly" : supportView.active ? " is-active" : ""}`}
          data-testid="conversations-support-mode"
        >
          <strong className="conversations-page__support-label">
            {supportReadOnly
              ? translate("conversationsSupportReadOnlyLabel")
              : supportView.active
                ? translate("conversationsSupportActiveLabel")
                : translate("conversationsSupportIdleLabel")}
          </strong>
          <AtlasSelect
            label={translate("conversationsSupportSelectUser")}
            value={supportView.supportUserId || ""}
            placeholder={translate("conversationsSupportSelectPlaceholder")}
            options={supportTargets.map((target) => ({
              value: target.id,
              label: target.name || target.email || target.id
            }))}
            onChange={(userId) => setSupportTargetUser(userId)}
          />
          {supportView.active ? (
            <AtlasButton type="button" variant="secondary" onClick={() => setSupportTargetUser("")}>
              {translate("conversationsSupportExit")}
            </AtlasButton>
          ) : null}
          {!isSuperAdminUser(user) ? (
            <AtlasButton type="button" variant="secondary" onClick={onExitAdminSupportMode}>
              {translate("conversationsSupportExitMode")}
            </AtlasButton>
          ) : null}
        </div>
      ) : null}

      <div className="conversations-page__filters" role="tablist">
        {FILTERS.map((filter) => {
          const countKey =
            filter.id === "needs_attention"
              ? "needs_attention"
              : filter.id === "active"
                ? "active"
                : filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter.id}
              className={`conversations-page__filter${activeFilter === filter.id ? " is-active" : ""}`}
              onClick={() => setFilter(filter.id)}
            >
              {translate(filter.labelKey)}
              <span className="conversations-page__filter-count">{counts[countKey] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {listError ? <p className="conversations-page__error conversations-page__error--list">{listError}</p> : null}
      {error ? <p className="conversations-page__error">{error}</p> : null}

      <div className="conversations-page__layout">
        <section className="conversations-page__list" aria-label={translate("conversationsListLabel")}>
          {listError && !items.length ? (
            <p className="conversations-page__empty">{listError}</p>
          ) : listLoading && !items.length ? (
            <ConversationListSkeleton />
          ) : items.length === 0 ? (
            <p className="conversations-page__empty">{translate("conversationsEmpty")}</p>
          ) : (
            items.map((item) => (
              <ConversationRow
                key={item.phone}
                item={item}
                selected={item.phone === selectedPhone}
                onSelect={onSelectConversation}
                translate={translate}
                locale={locale}
              />
            ))
          )}
        </section>

        <section className="conversations-page__thread" aria-label={translate("conversationsThreadLabel")}>
          {!selectedPhone ? (
            <p className="conversations-page__empty">{translate("conversationsSelectPrompt")}</p>
          ) : (
            <>
              <div
                className="conversations-thread__pane"
                data-thread-regions={threadRegions.join(",")}
                data-testid="conversations-thread-pane"
              >
                <div className="conversations-thread__header-sticky">
                  <div
                    className="conversations-thread__header"
                    data-header-regions={headerRegions.join(",")}
                    data-testid="conversations-thread-header"
                  >
                    <div
                      className="conversations-thread__identity"
                      data-testid="conversations-thread-identity"
                    >
                      <h2
                        className="conversations-thread__title"
                        data-testid="conversations-thread-name"
                      >
                        {headerModel.displayIdentity ||
                          headerModel.name ||
                          headerModel.phone ||
                          selectedPhone}
                      </h2>
                      {headerModel.phoneCopyable ? (
                        <div className="conversations-thread__phone-row">
                          <p
                            className="conversations-thread__phone"
                            data-testid="conversations-full-phone"
                          >
                            {headerModel.phone}
                          </p>
                          <button
                            type="button"
                            className="conversations-thread__copy"
                            onClick={() => onCopyPhone(headerModel.phone)}
                            aria-label={translate("conversationsCopyPhone")}
                          >
                            {phoneCopyStatus === "ok"
                              ? translate("conversationsPhoneCopied")
                              : phoneCopyStatus === "error"
                                ? translate("conversationsPhoneCopyFailed")
                                : translate("conversationsCopyPhone")}
                          </button>
                        </div>
                      ) : (
                        <p
                          className="conversations-thread__phone conversations-thread__phone--unavailable"
                          data-testid="conversations-full-phone"
                        >
                          {headerModel.phoneLabel || "Phone unavailable"}
                        </p>
                      )}
                      <div
                        className="conversations-thread__status"
                        data-testid="conversations-thread-badges"
                      >
                        {suspectedMetaLead ? (
                          <StatusBadge
                            variant="warning"
                            data-testid="conversations-thread-suspected-meta-lead"
                          >
                            {translate("possibleMetaLeadVerify")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge variant={ownershipVariant(ownershipState)}>
                            {ownershipLabel(ownershipState, translate)}
                          </StatusBadge>
                        )}
                        {showAttentionWarning && ownershipState === "HUMAN" ? (
                          <StatusBadge
                            variant="danger"
                            data-testid="conversations-attention-warning"
                          >
                            {translate("conversationsAttentionWarning")}
                          </StatusBadge>
                        ) : null}
                        {headerModel.inboxLifecycle ? (
                          <StatusBadge variant="neutral">
                            {lifecycleLabel(headerModel.inboxLifecycle, translate)}
                          </StatusBadge>
                        ) : null}
                        {headerModel.statusBadge ? (
                          <StatusBadge variant="info">
                            {headerModel.statusBadge}
                          </StatusBadge>
                        ) : null}
                        {headerModel.source ? (
                          <StatusBadge variant="neutral">{headerModel.source}</StatusBadge>
                        ) : null}
                        {showConversationGoalChip ? (
                          <StatusBadge variant="info">
                            {headerModel.conversationGoal}
                          </StatusBadge>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className="conversations-thread__actions"
                      data-testid="conversations-thread-actions"
                      data-effective-ownership={effectiveOwnership}
                      data-attention-state={
                        ownershipState === "NEEDS_ATTENTION"
                          ? "NEEDS_ATTENTION"
                          : "none"
                      }
                      data-thread-actions={threadActionIds.join(",")}
                    >
                      {allowSupportMutations && threadActionIds.includes("TAKE_OVER") && showTakeOver ? (
                        <AtlasButton
                          variant="primary"
                          data-testid="conversations-take-over"
                          disabled={actionBusy}
                          onClick={onTakeOver}
                        >
                          {translate("conversationsTakeOver")}
                        </AtlasButton>
                      ) : null}
                      {allowSupportMutations && threadActionIds.includes("CONFIRM_META_LEAD") ? (
                        <AtlasButton
                          variant="primary"
                          data-testid="conversations-confirm-meta-lead"
                          disabled={actionBusy}
                          onClick={onConfirmMetaLead}
                        >
                          {translate("conversationsConfirmMetaLead")}
                        </AtlasButton>
                      ) : null}
                      {allowSupportMutations && threadActionIds.includes("MARK_NOT_LEAD") ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-mark-not-lead"
                          disabled={actionBusy}
                          onClick={onMarkNotLead}
                        >
                          {translate("conversationsMarkNotLead")}
                        </AtlasButton>
                      ) : null}
                      {allowSupportMutations && threadActionIds.includes("RETURN_TO_ATLAS") &&
                      showReturnToAtlas ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-return-to-atlas"
                          disabled={actionBusy}
                          onClick={onReturnToAtlas}
                        >
                          {translate("conversationsReturnToAtlas")}
                        </AtlasButton>
                      ) : null}
                      {timelineProspectId ? (
                        <Link
                          to={buildMissionControlPath({
                            prospectId: timelineProspectId,
                            ...(selectedPhone ? { phone: selectedPhone } : {})
                          })}
                          className="atlas-ui-button atlas-ui-button--secondary"
                          data-testid="conversations-open-mission-control"
                        >
                          {translate("conversationsOpenInMissionControl")}
                        </Link>
                      ) : null}
                      {allowSupportMutations && lifecycleActionIds.includes("ARCHIVE") ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-archive"
                          disabled={actionBusy}
                          onClick={onArchive}
                        >
                          {translate("conversationsArchive")}
                        </AtlasButton>
                      ) : null}
                      {allowSupportMutations && lifecycleActionIds.includes("CLOSE") ? (
                        <div
                          className={`conversations-thread__close${
                            actionBusy ? " is-disabled" : ""
                          }`}
                          data-testid="conversations-close"
                        >
                          <AtlasSelect
                            value=""
                            placeholder={translate("conversationsClose")}
                            options={CLOSE_REASONS.map((reason) => ({
                              value: reason,
                              label: translate(`conversationsCloseReason_${reason}`)
                            }))}
                            onChange={(reason) => {
                              if (reason) {
                                onClose(reason);
                              }
                            }}
                          />
                        </div>
                      ) : null}
                      {allowSupportMutations && lifecycleActionIds.includes("MARK_TEST") ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-mark-test"
                          disabled={actionBusy}
                          onClick={onMarkTest}
                        >
                          {translate("conversationsMarkTest")}
                        </AtlasButton>
                      ) : null}
                      {isSuperAdminUser(user) &&
                      inboxLifecycle === "TEST" &&
                      timelineProspectId &&
                      (supportMode?.organizationId || user?.organizationId) ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-reset-canary"
                          disabled={actionBusy}
                          onClick={() => {
                            setCanaryResetReason("");
                            setCanaryResetOpen(true);
                          }}
                        >
                          {translate("conversationsResetCanary")}
                        </AtlasButton>
                      ) : null}
                      {allowSupportMutations && lifecycleActionIds.includes("RESTORE") ? (
                        <AtlasButton
                          variant="primary"
                          data-testid="conversations-restore"
                          disabled={actionBusy}
                          onClick={onRestore}
                        >
                          {translate("conversationsRestore")}
                        </AtlasButton>
                      ) : null}
                    </div>
                  </div>
                  {canaryResetOpen ? (
                    <div
                      className="conversations-canary-reset"
                      data-testid="conversations-canary-reset-dialog"
                    >
                      <p className="conversations-canary-reset__title">
                        {translate("conversationsResetCanaryTitle")}
                      </p>
                      <dl className="conversations-canary-reset__facts">
                        <div>
                          <dt>{translate("conversationsResetCanaryName")}</dt>
                          <dd>
                            {headerModel.displayIdentity ||
                              headerModel.name ||
                              "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>{translate("conversationsResetCanaryPhone")}</dt>
                          <dd>{headerModel.phone || selectedPhone || "—"}</dd>
                        </div>
                        <div>
                          <dt>{translate("conversationsResetCanaryOrg")}</dt>
                          <dd>
                            {supportMode?.organizationId ||
                              user?.organizationId ||
                              "—"}
                          </dd>
                        </div>
                      </dl>
                      <p className="conversations-canary-reset__warning">
                        {translate("conversationsResetCanaryWarning")}
                      </p>
                      <label className="conversations-canary-reset__reason">
                        {translate("conversationsResetCanaryReason")}
                        <textarea
                          data-testid="conversations-canary-reset-reason"
                          value={canaryResetReason}
                          onChange={(event) =>
                            setCanaryResetReason(event.target.value)
                          }
                          rows={3}
                          disabled={actionBusy}
                        />
                      </label>
                      <div className="conversations-canary-reset__actions">
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-canary-reset-cancel"
                          disabled={actionBusy}
                          onClick={() => {
                            setCanaryResetOpen(false);
                            setCanaryResetReason("");
                          }}
                        >
                          {translate("conversationsResetCanaryCancel")}
                        </AtlasButton>
                        <AtlasButton
                          variant="primary"
                          data-testid="conversations-canary-reset-confirm"
                          disabled={
                            actionBusy ||
                            String(canaryResetReason || "").trim().length < 3
                          }
                          onClick={onConfirmCanaryReset}
                        >
                          {translate("conversationsResetCanaryConfirm")}
                        </AtlasButton>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div
                  ref={transcriptRef}
                  className="conversations-thread__transcript"
                  data-testid="conversations-thread-transcript"
                  onScroll={onTranscriptScroll}
                >
                  {timelineProspectId ? (
                    <CommunicationsCenterTimeline
                      key={`cc-timeline:${timelineProspectId}`}
                      prospectId={timelineProspectId}
                      refreshSignal={refreshSignal}
                      layout="conversation"
                      onConversationItemsChange={onConversationItemsChange}
                    />
                  ) : detailLoading ? (
                    <p className="conversations-page__empty">
                      {translate("conversationsLoading")}
                    </p>
                  ) : (
                    <p className="conversations-page__empty">
                      {translate("conversationsNoTranscript")}
                    </p>
                  )}
                  {newMessageCount > 0 ? (
                    <button
                      type="button"
                      className="conversations-thread__new-message"
                      data-testid="conversations-new-message"
                      onClick={onJumpToLatest}
                    >
                      {formatNewMessageIndicatorLabel(newMessageCount, {
                        one: translate("conversationsNewMessage"),
                        many: translate("conversationsNewMessages")
                      })}
                    </button>
                  ) : null}
                </div>

                {allowSupportMutations ? (
                <div
                  className="conversations-thread__composer-sticky"
                  data-testid="conversations-composer-sticky"
                >
                  <HumanWhatsAppComposer
                    phone={selectedPhone}
                    controlled
                    ownershipState={ownershipState}
                    customerCareWindow={matchedDetail?.customerCareWindow ?? null}
                    variant="sticky"
                    showHeader={false}
                    showPhone={false}
                    titleKey="conversationsComposerLabel"
                    testId="conversations-human-composer"
                    onSent={onComposerSent}
                  />
                </div>
                ) : (
                  <p className="conversations-page__support-readonly-note" data-testid="conversations-support-readonly">
                    {translate("conversationsSupportReadOnlyLabel")}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
