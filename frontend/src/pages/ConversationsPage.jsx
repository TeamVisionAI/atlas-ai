import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import StatusBadge from "../components/ui/StatusBadge";
import CommunicationsCenterTimeline from "../features/prospect-workspace/components/CommunicationsCenterTimeline";
import {
  getConversations,
  getConversation,
  takeOverConversation,
  returnConversationToAtlas,
  ConversationsCenterError
} from "../services/conversationsCenterService";
import "./ConversationsPage.css";

const FILTERS = [
  { id: "all", labelKey: "conversationsFilterAll" },
  { id: "needs_attention", labelKey: "conversationsFilterNeedsAttention" },
  { id: "atlas", labelKey: "conversationsFilterAtlas" },
  { id: "human", labelKey: "conversationsFilterHuman" }
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
  const activeFilter = searchParams.get("filter") || "all";

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

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
    all: 0,
    needs_attention: 0,
    atlas: 0,
    human: 0
  };

  const items = payload?.items || [];

  const selectedItem = useMemo(
    () => items.find((row) => row.phone === selectedPhone) || detail?.conversation || null,
    [items, selectedPhone, detail]
  );

  function setFilter(filterId) {
    const next = new URLSearchParams(searchParams);
    if (filterId === "all") {
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
  const handoffReason = detail?.handoffReason || selectedItem?.handoffReason || null;

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
              : filter.id === "all"
                ? "all"
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
              <div className="conversations-thread__header">
                <div>
                  <h2 className="conversations-thread__title">
                    {selectedItem?.name || selectedPhone}
                  </h2>
                  <p className="conversations-thread__phone">{selectedPhone}</p>
                </div>
                <div className="conversations-thread__actions">
                  {ownershipState === "NEEDS_ATTENTION" || ownershipState === "ATLAS" ? (
                    <button
                      type="button"
                      className="conversations-thread__action conversations-thread__action--primary"
                      disabled={actionBusy}
                      onClick={onTakeOver}
                    >
                      {translate("conversationsTakeOver")}
                    </button>
                  ) : null}
                  {ownershipState === "HUMAN" || ownershipState === "NEEDS_ATTENTION" ? (
                    <button
                      type="button"
                      className="conversations-thread__action"
                      disabled={actionBusy}
                      onClick={onReturnToAtlas}
                    >
                      {translate("conversationsReturnToAtlas")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="conversations-thread__status">
                <StatusBadge variant={ownershipVariant(ownershipState)}>
                  {ownershipLabel(ownershipState, translate)}
                </StatusBadge>
                {selectedItem?.appointmentStatus ? (
                  <span className="conversations-thread__chip">{selectedItem.appointmentStatus}</span>
                ) : null}
                {selectedItem?.source ? (
                  <span className="conversations-thread__chip">{selectedItem.source}</span>
                ) : null}
                {selectedItem?.conversationGoal ? (
                  <span className="conversations-thread__chip">{selectedItem.conversationGoal}</span>
                ) : null}
              </div>

              {handoffReason ? (
                <p className="conversations-thread__handoff">
                  {translate("conversationsHandoffReason")}: <strong>{handoffReason}</strong>
                </p>
              ) : null}

              {detail?.prospectId ? (
                <CommunicationsCenterTimeline
                  prospectId={detail.prospectId}
                  refreshSignal={refreshSignal}
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
