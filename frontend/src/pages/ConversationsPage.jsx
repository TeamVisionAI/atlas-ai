import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
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
import {
  accumulateNewMessageCount,
  CONVERSATIONS_POLL_MS,
  formatNewMessageIndicatorLabel,
  isTranscriptNearBottom,
  nextNewMessageIndicatorCount,
  shouldForceScrollToLatest
} from "../engines/conversationsTranscriptAnchor";
import { buildMissionControlPath } from "../engines/executiveFilterEngine";
import {
  getConversations,
  getConversation,
  takeOverConversation,
  returnConversationToAtlas,
  archiveConversation,
  restoreConversation,
  closeConversation,
  markConversationAsTest,
  markConversationRead,
  ConversationsCenterError
} from "../services/conversationsCenterService";
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
            {item.name || item.phone}
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
        <StatusBadge variant={ownershipVariant(item.ownershipState)}>
          {ownershipLabel(item.ownershipState, translate)}
        </StatusBadge>
      </div>
      <div className="conversations-row__phone">{item.phone}</div>
      {item.inboxLifecycle && item.inboxLifecycle !== "ACTIVE" ? (
        <div className="conversations-row__lifecycle">
          {lifecycleLabel(item.inboxLifecycle, translate)}
        </div>
      ) : null}
      {item.lastMessagePreview ? (
        <p
          className={`conversations-row__preview${unreadUi.boldPreview ? " is-unread" : ""}`}
        >
          {item.lastMessagePreview}
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
  const locale = language === "es" ? "es-US" : "en-US";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = searchParams.get("filter") || "active";

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
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

  const loadList = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
      setForbidden(false);
    }
    try {
      const data = await getConversations({ filter: activeFilter });
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
        setRefreshSignal((n) => n + 1);
      }
      if (nextCommAt) {
        lastCommunicationAtRef.current = nextCommAt;
      }
    } catch (err) {
      if (err instanceof ConversationsCenterError && err.status === 403) {
        setForbidden(true);
        setPayload(null);
      } else if (!quiet) {
        setError(
          err instanceof ConversationsCenterError
            ? translate("conversationsLoadError")
            : err.message
        );
      }
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, [activeFilter, translate]);
  loadListRef.current = loadList;

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadListRef.current?.({ quiet: true });
    }, CONVERSATIONS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeFilter]);

  const loadDetail = useCallback(
    async (phone) => {
      if (!phone) {
        setDetail(null);
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      try {
        const data = await getConversation(phone);
        // Stale async guard — rapid A→B must never keep A's detail under B.
        if (
          !shouldCommitConversationDetail({
            requestPhone: phone,
            selectedPhone: selectedPhoneRef.current
          })
        ) {
          return;
        }
        setDetail(data);
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
    [translate]
  );

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
      markConversationRead(selectedPhoneRef.current)
        .then(() => loadListRef.current?.({ quiet: true }))
        .catch(() => {});
    }
  }, []);

  async function onSelectConversation(row) {
    lastCommunicationAtRef.current = row?.lastCommunicationAt || null;
    setSelectedPhone(row.phone);
    try {
      await markConversationRead(row.phone, {
        lastReadInboundAt: new Date().toISOString()
      });
      await loadListRef.current?.({ quiet: true });
    } catch {
      /* unread persist failure must not block opening */
    }
  }

  async function onJumpToLatest() {
    scrollTranscriptToLatest();
    if (!selectedPhoneRef.current) {
      return;
    }
    try {
      await markConversationRead(selectedPhoneRef.current, {
        lastReadInboundAt: new Date().toISOString()
      });
      await loadListRef.current?.({ quiet: true });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (selectedPhone && refreshSignal > 0) {
      loadDetail(selectedPhone);
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

  async function onTakeOver() {
    if (!selectedPhone || actionBusy) return;
    setActionBusy(true);
    try {
      await takeOverConversation(selectedPhone);
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onReturnToAtlas() {
    if (!selectedPhone || actionBusy) return;
    setActionBusy(true);
    try {
      await returnConversationToAtlas(selectedPhone);
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onArchive() {
    if (!selectedPhone || actionBusy) return;
    setActionBusy(true);
    try {
      await archiveConversation(selectedPhone);
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onRestore() {
    if (!selectedPhone || actionBusy) return;
    setActionBusy(true);
    try {
      await restoreConversation(selectedPhone);
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onMarkTest() {
    if (!selectedPhone || actionBusy) return;
    setActionBusy(true);
    try {
      await markConversationAsTest(selectedPhone);
      await loadList();
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function onClose(reason) {
    if (!selectedPhone || actionBusy) return;
    setActionBusy(true);
    try {
      await closeConversation(selectedPhone, reason);
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

  if (forbidden) {
    return (
      <div className="conversations-page">
        <h1 className="conversations-page__title">{translate("conversationsTitle")}</h1>
        <p className="conversations-page__subtitle">{translate("conversationsPilotOnly")}</p>
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
  const showTakeOver = canTakeOverConversation(effectiveOwnership);
  const showReturnToAtlas = canReturnConversationToAtlas(effectiveOwnership);
  const showAttentionWarning = shouldShowAttentionWarning({
    ownershipState,
    needsHumanAttention
  });
  // Defense in depth: one action list from effectiveOwnership.
  const threadActionIds = resolveThreadActionIds({
    ownershipState,
    effectiveOwnership
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
          <p className="conversations-page__subtitle">{translate("conversationsSubtitle")}</p>
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

      {error ? <p className="conversations-page__error">{error}</p> : null}

      <div className="conversations-page__layout">
        <section className="conversations-page__list" aria-label={translate("conversationsListLabel")}>
          {loading ? (
            <p className="conversations-page__empty">{translate("conversationsLoading")}</p>
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
                        {headerModel.name || headerModel.phone || selectedPhone}
                      </h2>
                      {headerModel.phone ? (
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
                      ) : null}
                      <div
                        className="conversations-thread__status"
                        data-testid="conversations-thread-badges"
                      >
                        <StatusBadge variant={ownershipVariant(ownershipState)}>
                          {ownershipLabel(ownershipState, translate)}
                        </StatusBadge>
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
                      {threadActionIds.includes("TAKE_OVER") && showTakeOver ? (
                        <AtlasButton
                          variant="primary"
                          data-testid="conversations-take-over"
                          disabled={actionBusy}
                          onClick={onTakeOver}
                        >
                          {translate("conversationsTakeOver")}
                        </AtlasButton>
                      ) : null}
                      {threadActionIds.includes("RETURN_TO_ATLAS") &&
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
                      {lifecycleActionIds.includes("ARCHIVE") ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-archive"
                          disabled={actionBusy}
                          onClick={onArchive}
                        >
                          {translate("conversationsArchive")}
                        </AtlasButton>
                      ) : null}
                      {lifecycleActionIds.includes("CLOSE") ? (
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
                      {lifecycleActionIds.includes("MARK_TEST") ? (
                        <AtlasButton
                          variant="secondary"
                          data-testid="conversations-mark-test"
                          disabled={actionBusy}
                          onClick={onMarkTest}
                        >
                          {translate("conversationsMarkTest")}
                        </AtlasButton>
                      ) : null}
                      {lifecycleActionIds.includes("RESTORE") ? (
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
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
