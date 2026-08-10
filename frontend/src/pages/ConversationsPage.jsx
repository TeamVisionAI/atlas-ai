import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import StatusBadge from "../components/ui/StatusBadge";
import CommunicationsCenterTimeline from "../features/prospect-workspace/components/CommunicationsCenterTimeline";
import { copyMessageToClipboard } from "../services/whatsappCommunicationService";
import {
  buildConversationHeaderModel,
  isHumanComposerEnabled,
  resolveEffectiveOwnership,
  canTakeOverConversation,
  canReturnConversationToAtlas,
  resolveThreadActionIds,
  resolveLifecycleActionIds
} from "../engines/conversationsCenterPresentation";
import {
  getConversations,
  getConversation,
  takeOverConversation,
  returnConversationToAtlas,
  sendHumanConversationReply,
  archiveConversation,
  restoreConversation,
  closeConversation,
  markConversationAsTest,
  ConversationsCenterError
} from "../services/conversationsCenterService";
import "./ConversationsPage.css";

function newClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
  return (
    <button
      type="button"
      className={`conversations-row${selected ? " is-selected" : ""}${item.unread ? " is-unread" : ""}`}
      onClick={() => onSelect(item)}
    >
      <div className="conversations-row__top">
        <div className="conversations-row__identity">
          <strong className="conversations-row__name">
            {item.name || item.phone}
          </strong>
          {item.unread ? <span className="conversations-row__dot" aria-hidden="true" /> : null}
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
        <p className="conversations-row__preview">{item.lastMessagePreview}</p>
      ) : null}
      <div className="conversations-row__meta">
        <span>{formatActivity(item.lastActivityAt, locale)}</span>
        {item.source ? <span>{item.source}</span> : null}
        {item.conversationGoal ? <span>{item.conversationGoal}</span> : null}
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
  const [composeText, setComposeText] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeStatus, setComposeStatus] = useState(null);
  const [composeRequestId, setComposeRequestId] = useState(() => newClientRequestId());
  const [phoneCopyStatus, setPhoneCopyStatus] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const data = await getConversations({ filter: activeFilter });
      setPayload(data);
    } catch (err) {
      if (err instanceof ConversationsCenterError && err.status === 403) {
        setForbidden(true);
        setPayload(null);
      } else {
        setError(
          err instanceof ConversationsCenterError
            ? translate("conversationsLoadError")
            : err.message
        );
      }
    } finally {
      setLoading(false);
    }
  }, [activeFilter, translate]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (phone) => {
      if (!phone) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      try {
        const data = await getConversation(phone);
        setDetail(data);
      } catch (err) {
        setDetail(null);
        setError(
          err instanceof ConversationsCenterError
            ? translate("conversationsLoadError")
            : err.message
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [translate]
  );

  useEffect(() => {
    if (selectedPhone) {
      loadDetail(selectedPhone);
    }
  }, [selectedPhone, loadDetail, refreshSignal]);

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

  const selectedItem = useMemo(
    () => items.find((row) => row.phone === selectedPhone) || detail?.conversation || null,
    [items, selectedPhone, detail]
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

  useEffect(() => {
    setComposeText("");
    setComposeStatus(null);
    setComposeRequestId(newClientRequestId());
    setPhoneCopyStatus(null);
  }, [selectedPhone]);

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

  async function onSendHumanReply(event) {
    event.preventDefault();
    const currentOwnership =
      detail?.ownershipState ||
      selectedItem?.ownershipState ||
      null;
    const effective = resolveEffectiveOwnership(currentOwnership);
    if (!selectedPhone || !isHumanComposerEnabled(effective) || composeSending) {
      return;
    }

    const text = composeText.trim();
    if (!text) {
      setComposeStatus({
        type: "error",
        message: translate("conversationsComposerEmpty")
      });
      return;
    }

    setComposeSending(true);
    setComposeStatus(null);
    const requestId = composeRequestId;

    try {
      const result = await sendHumanConversationReply(selectedPhone, {
        message: text,
        clientRequestId: requestId
      });
      setComposeText("");
      setComposeRequestId(newClientRequestId());
      setComposeStatus({
        type: "success",
        message: result.duplicateSuppressed
          ? translate("conversationsComposerDuplicateOk")
          : translate("conversationsComposerSent")
      });
      setRefreshSignal((n) => n + 1);
      await loadList();
      await loadDetail(selectedPhone);
    } catch (err) {
      const code = err instanceof ConversationsCenterError ? err.code : null;
      const message =
        code === "WHATSAPP_TEMPLATE_REQUIRED_OUTSIDE_WINDOW"
          ? translate("conversationsComposerWindowClosed")
          : code === "COMPOSER_REQUIRES_HUMAN_OWNERSHIP"
            ? translate("conversationsComposerRequiresHuman")
            : err.message || translate("conversationsComposerFailed");
      setComposeStatus({ type: "error", message });
    } finally {
      setComposeSending(false);
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
    detail?.ownershipState || selectedItem?.ownershipState || null;
  // Attention (NEEDS_ATTENTION) is display-only; controls use effectiveOwnership only.
  const effectiveOwnership = resolveEffectiveOwnership(ownershipState);
  const handoffReason = detail?.handoffReason || selectedItem?.handoffReason || null;
  const humanComposerEnabled = isHumanComposerEnabled(effectiveOwnership);
  const showTakeOver = canTakeOverConversation(effectiveOwnership);
  const showReturnToAtlas = canReturnConversationToAtlas(effectiveOwnership);
  // Defense in depth: one action list from effectiveOwnership; NEEDS_ATTENTION never unlocks RETURN.
  const threadActionIds = resolveThreadActionIds({
    ownershipState,
    effectiveOwnership
  });
  const inboxLifecycle =
    selectedItem?.inboxLifecycle ||
    detail?.conversation?.inboxLifecycle ||
    "ACTIVE";
  const lifecycleActionIds = resolveLifecycleActionIds({ inboxLifecycle });
  const headerModel = buildConversationHeaderModel({
    name: selectedItem?.name || detail?.conversation?.name || null,
    phone:
      detail?.phone ||
      detail?.conversation?.phone ||
      selectedItem?.phone ||
      selectedPhone ||
      null,
    source: selectedItem?.source || detail?.conversation?.source || null,
    ownershipState,
    appointmentStatus:
      selectedItem?.appointmentStatus ||
      detail?.conversation?.appointmentStatus ||
      null,
    conversationGoal:
      selectedItem?.conversationGoal ||
      detail?.conversation?.conversationGoal ||
      null,
    inboxLifecycle,
    inboxCloseReason:
      selectedItem?.inboxCloseReason ||
      detail?.conversation?.inboxCloseReason ||
      null
  });

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
                onSelect={(row) => setSelectedPhone(row.phone)}
                translate={translate}
                locale={locale}
              />
            ))
          )}
        </section>

        <section className="conversations-page__thread" aria-label={translate("conversationsThreadLabel")}>
          {!selectedPhone ? (
            <p className="conversations-page__empty">{translate("conversationsSelectPrompt")}</p>
          ) : detailLoading && !detail ? (
            <p className="conversations-page__empty">{translate("conversationsLoading")}</p>
          ) : (
            <>
              <div className="conversations-thread__pilot-sticky">
                <div className="conversations-thread__header">
                  <div className="conversations-thread__identity">
                    <h2 className="conversations-thread__title">
                      {headerModel.name || headerModel.phone || selectedPhone}
                    </h2>
                    {headerModel.name && headerModel.phone ? (
                      <div className="conversations-thread__phone-row">
                        <p className="conversations-thread__phone" data-testid="conversations-full-phone">
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
                    ) : headerModel.phone ? (
                      <div className="conversations-thread__phone-row">
                        <p className="conversations-thread__phone" data-testid="conversations-full-phone">
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
                  </div>
                  <div
                    className="conversations-thread__actions"
                    data-effective-ownership={effectiveOwnership}
                    data-attention-state={
                      ownershipState === "NEEDS_ATTENTION" ? "NEEDS_ATTENTION" : "none"
                    }
                    data-thread-actions={threadActionIds.join(",")}
                  >
                    {threadActionIds.includes("TAKE_OVER") && showTakeOver ? (
                      <button
                        type="button"
                        className="conversations-thread__action conversations-thread__action--primary"
                        data-testid="conversations-take-over"
                        disabled={actionBusy}
                        onClick={onTakeOver}
                      >
                        {translate("conversationsTakeOver")}
                      </button>
                    ) : null}
                    {threadActionIds.includes("RETURN_TO_ATLAS") && showReturnToAtlas ? (
                      <button
                        type="button"
                        className="conversations-thread__action"
                        data-testid="conversations-return-to-atlas"
                        disabled={actionBusy}
                        onClick={onReturnToAtlas}
                      >
                        {translate("conversationsReturnToAtlas")}
                      </button>
                    ) : null}
                    {lifecycleActionIds.includes("ARCHIVE") ? (
                      <button
                        type="button"
                        className="conversations-thread__action"
                        data-testid="conversations-archive"
                        disabled={actionBusy}
                        onClick={onArchive}
                      >
                        {translate("conversationsArchive")}
                      </button>
                    ) : null}
                    {lifecycleActionIds.includes("CLOSE") ? (
                      <label className="conversations-thread__close">
                        <span className="visually-hidden">{translate("conversationsClose")}</span>
                        <select
                          data-testid="conversations-close"
                          disabled={actionBusy}
                          defaultValue=""
                          onChange={(event) => {
                            const reason = event.target.value;
                            if (reason) {
                              onClose(reason);
                              event.target.value = "";
                            }
                          }}
                        >
                          <option value="">{translate("conversationsClose")}</option>
                          {CLOSE_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {translate(`conversationsCloseReason_${reason}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {lifecycleActionIds.includes("MARK_TEST") ? (
                      <button
                        type="button"
                        className="conversations-thread__action"
                        data-testid="conversations-mark-test"
                        disabled={actionBusy}
                        onClick={onMarkTest}
                      >
                        {translate("conversationsMarkTest")}
                      </button>
                    ) : null}
                    {lifecycleActionIds.includes("RESTORE") ? (
                      <button
                        type="button"
                        className="conversations-thread__action conversations-thread__action--primary"
                        data-testid="conversations-restore"
                        disabled={actionBusy}
                        onClick={onRestore}
                      >
                        {translate("conversationsRestore")}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="conversations-thread__status">
                  <StatusBadge variant={ownershipVariant(ownershipState)}>
                    {ownershipLabel(ownershipState, translate)}
                  </StatusBadge>
                  {headerModel.inboxLifecycle ? (
                    <span className="conversations-thread__chip">
                      {lifecycleLabel(headerModel.inboxLifecycle, translate)}
                    </span>
                  ) : null}
                  {headerModel.appointmentStatus ? (
                    <span className="conversations-thread__chip">
                      {headerModel.appointmentStatus}
                    </span>
                  ) : null}
                  {headerModel.source ? (
                    <span className="conversations-thread__chip">{headerModel.source}</span>
                  ) : null}
                  {headerModel.conversationGoal ? (
                    <span className="conversations-thread__chip">
                      {headerModel.conversationGoal}
                    </span>
                  ) : null}
                </div>

                {handoffReason ? (
                  <p className="conversations-thread__handoff">
                    {translate("conversationsHandoffReason")}: <strong>{handoffReason}</strong>
                  </p>
                ) : null}

                <form
                  className={`conversations-composer${humanComposerEnabled ? " is-human" : " is-disabled"}`}
                  onSubmit={onSendHumanReply}
                  data-testid="conversations-human-composer"
                  data-enabled={humanComposerEnabled ? "true" : "false"}
                >
                  <label className="conversations-composer__label" htmlFor="conversations-composer-input">
                    {translate("conversationsComposerLabel")}
                  </label>
                  <textarea
                    id="conversations-composer-input"
                    className="conversations-composer__input"
                    rows={3}
                    value={composeText}
                    disabled={!humanComposerEnabled || composeSending}
                    placeholder={
                      humanComposerEnabled
                        ? translate("conversationsComposerPlaceholder")
                        : translate("conversationsComposerDisabled")
                    }
                    onChange={(event) => setComposeText(event.target.value)}
                  />
                  <div className="conversations-composer__footer">
                    {composeStatus ? (
                      <p
                        className={`conversations-composer__status conversations-composer__status--${composeStatus.type}`}
                        role="status"
                      >
                        {composeStatus.message}
                      </p>
                    ) : (
                      <span className="conversations-composer__hint">
                        {humanComposerEnabled
                          ? translate("conversationsComposerHint")
                          : translate("conversationsComposerRequiresHuman")}
                      </span>
                    )}
                    <button
                      type="submit"
                      className="conversations-thread__action conversations-thread__action--primary"
                      disabled={
                        !humanComposerEnabled ||
                        composeSending ||
                        !composeText.trim()
                      }
                    >
                      {composeSending
                        ? translate("conversationsComposerSending")
                        : translate("conversationsComposerSend")}
                    </button>
                  </div>
                </form>
              </div>

              {detail?.prospectId ? (
                <CommunicationsCenterTimeline
                  prospectId={detail.prospectId}
                  refreshSignal={refreshSignal}
                  newestFirst
                />
              ) : (
                <p className="conversations-page__empty">{translate("conversationsNoTranscript")}</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
