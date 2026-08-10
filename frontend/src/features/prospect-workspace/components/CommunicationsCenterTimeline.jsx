import { useEffect, useMemo, useState } from "react";
import {
  getProspectCommunications,
  CommunicationsCenterError
} from "../../../services/communicationsCenterApi";
import {
  COMMUNICATIONS_FILTERS,
  filterCommunicationsItems,
  orderCommunicationsForDisplay,
  buildWarningBadges,
  actorLabel,
  directionLabel,
  correlationLabel,
  labelForFlag,
  containsRawPhoneLeak,
  buildCommunicationsCacheKey
} from "../../../engines/communicationsCenterViewModel";
import "./CommunicationsCenterTimeline.css";

export default function CommunicationsCenterTimeline({
  prospectId,
  organizationId = null,
  refreshSignal = 0,
  newestFirst = false
}) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [filterId, setFilterId] = useState("all");
  const [openDiagnostics, setOpenDiagnostics] = useState(() => new Set());

  useEffect(() => {
    if (!prospectId) {
      setStatus("missing_id");
      setPayload(null);
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    getProspectCommunications(prospectId, { limit: 200 })
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setPayload(null);
        if (err instanceof CommunicationsCenterError && err.status === 401) {
          setStatus("unauthorized");
        } else if (err instanceof CommunicationsCenterError && err.status === 403) {
          setStatus("unauthorized");
        } else if (err instanceof CommunicationsCenterError && err.status === 404) {
          setStatus("not_found");
        } else {
          setStatus("error");
        }
        setError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [prospectId, refreshSignal]);

  const filteredItems = useMemo(() => {
    const filtered = filterCommunicationsItems(payload?.items || [], filterId);
    return orderCommunicationsForDisplay(filtered, { newestFirst });
  }, [payload, filterId, newestFirst]);

  const cacheKey = buildCommunicationsCacheKey(organizationId, prospectId);

  function toggleDiagnostics(id) {
    setOpenDiagnostics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!prospectId || status === "missing_id") {
    return (
      <section className="cc-timeline" aria-label="Communications Center">
        <header className="cc-timeline__header">
          <h3 className="cc-timeline__title">Communications Center</h3>
          <p className="cc-timeline__subtitle">
            Prospect identity is required before communications can load.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section
      className="cc-timeline"
      aria-label="Communications Center"
      data-cache-key={cacheKey}
    >
      <header className="cc-timeline__header">
        <div>
          <h3 className="cc-timeline__title">Communications Center</h3>
          <p className="cc-timeline__subtitle">
            Unified prospect timeline — loaded by prospect ID, not phone.
          </p>
        </div>
        {payload?.prospect?.currentContact?.maskedAddress ? (
          <p className="cc-timeline__contact">
            Current contact: {payload.prospect.currentContact.channel}{" "}
            {payload.prospect.currentContact.maskedAddress}
          </p>
        ) : null}
      </header>

      {(payload?.gaps?.length || payload?.dataQuality?.legacyPhoneCorrelations > 0) && (
        <div className="cc-timeline__quality" role="status">
          <strong>Partial data notice.</strong>{" "}
          Some events use legacy phone correlation because prior channel history is
          not stored yet.
          {payload?.dataQuality ? (
            <span>
              {" "}
              Legacy correlations: {payload.dataQuality.legacyPhoneCorrelations}. Excluded
              ambiguous: {payload.dataQuality.ambiguousRecordsExcluded}.
            </span>
          ) : null}
        </div>
      )}

      <div className="cc-timeline__filters" role="tablist" aria-label="Timeline filters">
        {COMMUNICATIONS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={filterId === filter.id}
            className={
              filterId === filter.id
                ? "cc-timeline__filter cc-timeline__filter--active"
                : "cc-timeline__filter"
            }
            onClick={() => setFilterId(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <p className="cc-timeline__state">Loading communications…</p>
      ) : null}

      {status === "unauthorized" ? (
        <p className="cc-timeline__state cc-timeline__state--error">
          You are not authorized to view this prospect’s communications.
        </p>
      ) : null}

      {status === "not_found" ? (
        <p className="cc-timeline__state cc-timeline__state--error">
          Communications were not found for this prospect.
        </p>
      ) : null}

      {status === "error" ? (
        <p className="cc-timeline__state cc-timeline__state--error">
          {error?.message || "Failed to load communications timeline."}
        </p>
      ) : null}

      {status === "ready" && filteredItems.length === 0 ? (
        <p className="cc-timeline__state">
          {payload?.items?.length
            ? "No results for the selected filter."
            : "No communications recorded for this prospect yet."}
        </p>
      ) : null}

      {status === "ready" && filteredItems.length > 0 ? (
        <ol className="cc-timeline__list">
          {filteredItems.map((item) => {
            const badges = buildWarningBadges(item);
            const open = openDiagnostics.has(item.id);
            const body = String(item.content?.text || "");
            const safeBody = containsRawPhoneLeak(body)
              ? body.replace(/\+\d{10,15}\b/g, "***").replace(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "***")
              : body;

            return (
              <li key={item.id} className="cc-timeline__item">
                <div className="cc-timeline__meta">
                  <time dateTime={item.timestampUtc}>
                    {item.timestampLocal || item.timestampUtc}
                  </time>
                  <span>{actorLabel(item)}</span>
                  <span>{directionLabel(item)}</span>
                  <span>{item.channel || "—"}</span>
                </div>

                <p className="cc-timeline__body">{safeBody || item.eventType}</p>

                <div className="cc-timeline__facts">
                  {item.delivery?.status ? (
                    <span>Delivery: {item.delivery.status}</span>
                  ) : null}
                  {item.workflow?.before || item.workflow?.after ? (
                    <span>
                      Workflow: {item.workflow.before || "—"} → {item.workflow.after || "—"}
                    </span>
                  ) : null}
                  {item.appointment?.appointmentId ? (
                    <span>
                      Appointment: {item.appointment.status || "record"}
                      {item.metadata?.calendarEventId ? " · Calendar linked" : ""}
                    </span>
                  ) : null}
                  <span>{correlationLabel(item)}</span>
                </div>

                {badges.length ? (
                  <ul className="cc-timeline__badges">
                    {badges.map((badge) => (
                      <li key={badge.id}>{badge.label}</li>
                    ))}
                  </ul>
                ) : null}

                <details
                  className="cc-timeline__diagnostics"
                  open={open}
                  onToggle={(event) => {
                    if (event.target.open !== open) {
                      toggleDiagnostics(item.id);
                    }
                  }}
                >
                  <summary>Diagnostics</summary>
                  <dl>
                    <div>
                      <dt>Source</dt>
                      <dd>
                        {item.source?.system} / {item.source?.recordId}
                      </dd>
                    </div>
                    <div>
                      <dt>Event type</dt>
                      <dd>{item.eventType}</dd>
                    </div>
                    <div>
                      <dt>Correlation</dt>
                      <dd>{correlationLabel(item)}</dd>
                    </div>
                    <div>
                      <dt>Flags</dt>
                      <dd>
                        {(item.flags || []).length
                          ? (item.flags || []).map((flag) => labelForFlag(flag)).join(", ")
                          : "None"}
                      </dd>
                    </div>
                  </dl>
                </details>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
