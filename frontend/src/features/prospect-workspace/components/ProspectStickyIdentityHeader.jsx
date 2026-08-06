import { useEffect, useId, useMemo, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { buildProspectStickyIdentitySummary } from "../../../engines/prospectWorkspaceStickyIdentity";
import "./ProspectStickyIdentityHeader.css";

/**
 * Compact sticky prospect identity — appears after the primary header scrolls away.
 * Presentation only; no operational appointment/WhatsApp actions.
 */
export default function ProspectStickyIdentityHeader({
  active = false,
  prospectId = null,
  identity,
  status,
  owner,
  prospectCore = null,
  interview = null,
  scrollRootRef = null
}) {
  const { translate } = useLanguage();
  const labelId = useId();
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(
    () =>
      buildProspectStickyIdentitySummary({
        prospectId,
        identity,
        status,
        owner,
        prospectCore,
        interview,
        translate
      }),
    [prospectId, identity, status, owner, prospectCore, interview, translate]
  );

  useEffect(() => {
    if (!active) {
      setExpanded(false);
    }
  }, [active]);

  function scrollToId(id) {
    const root = scrollRootRef?.current;
    const target = (root || document).querySelector?.(`#${id}`) || document.getElementById(id);

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleBackToTop() {
    const root = scrollRootRef?.current;

    if (root && typeof root.scrollTo === "function") {
      root.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const stageLine = [summary.stage, summary.appointmentStatusLabel]
    .filter((part) => part && part !== "—")
    .join(" · ");

  return (
    <div
      className={`prospect-sticky-identity${active ? " is-active" : ""}`}
      data-prospect-id={summary.prospectId || undefined}
      data-sticky-identity="true"
      data-sticky-active={active ? "true" : "false"}
      aria-hidden={active ? undefined : true}
    >
      <section
        className="prospect-sticky-identity__bar"
        aria-labelledby={labelId}
        aria-label={translate("workspaceStickyIdentityLabel")}
      >
        <div className="prospect-sticky-identity__primary">
          <h2 id={labelId} className="prospect-sticky-identity__name">
            {summary.name}
          </h2>
          <p className="prospect-sticky-identity__stage">{stageLine || "—"}</p>
        </div>

        <div className="prospect-sticky-identity__desktop-meta">
          <span>
            <span className="prospect-sticky-identity__meta-label">
              {translate("workspaceHeaderAssignedAgent")}
            </span>{" "}
            {summary.ownerLabel}
          </span>
          <span>
            <span className="prospect-sticky-identity__meta-label">
              {translate("workspaceStickyLanguage")}
            </span>{" "}
            {summary.language}
          </span>
          {summary.appointmentWhen ? (
            <span>
              <span className="prospect-sticky-identity__meta-label">
                {translate("workspaceStickyAppointment")}
              </span>{" "}
              {summary.appointmentWhen}
              {summary.appointmentTypeLabel ? ` · ${summary.appointmentTypeLabel}` : ""}
            </span>
          ) : null}
          {summary.maskedContact ? (
            <span className="prospect-sticky-identity__masked" data-masked-contact="true">
              {summary.maskedContact}
            </span>
          ) : null}
          {summary.outcomeNeeded ? (
            <span className="prospect-sticky-identity__flag">
              {translate("workspaceStickyOutcomeNeeded")}
            </span>
          ) : null}
          {summary.humanAssist ? (
            <span className="prospect-sticky-identity__flag prospect-sticky-identity__flag--assist">
              {translate("workspaceStickyHumanAssist")}
            </span>
          ) : null}
        </div>

        <div className="prospect-sticky-identity__actions">
          <button
            type="button"
            className="prospect-sticky-identity__action"
            onClick={handleBackToTop}
          >
            {translate("workspaceStickyBackToTop")}
          </button>
          <a
            className="prospect-sticky-identity__action"
            href="#operational-interview"
            onClick={(event) => {
              event.preventDefault();
              scrollToId("operational-interview");
            }}
          >
            {translate("workspaceStickyInterviewAnchor")}
          </a>
          <a
            className="prospect-sticky-identity__action"
            href="#communication-history"
            onClick={(event) => {
              event.preventDefault();
              scrollToId("communication-history");
            }}
          >
            {translate("workspaceStickyHistoryAnchor")}
          </a>
          <button
            type="button"
            className="prospect-sticky-identity__action prospect-sticky-identity__expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded
              ? translate("workspaceStickyCollapse")
              : translate("workspaceStickyExpand")}
          </button>
        </div>
      </section>

      {expanded ? (
        <div className="prospect-sticky-identity__mobile-details">
          <p>
            <strong>{translate("workspaceHeaderAssignedAgent")}:</strong> {summary.ownerLabel}
          </p>
          <p>
            <strong>{translate("workspaceStickyLanguage")}:</strong> {summary.language}
          </p>
          {summary.appointmentWhen ? (
            <p>
              <strong>{translate("workspaceStickyAppointment")}:</strong>{" "}
              {summary.appointmentWhen}
              {summary.appointmentTypeLabel ? ` · ${summary.appointmentTypeLabel}` : ""}
            </p>
          ) : null}
          {summary.maskedContact ? (
            <p data-masked-contact="true">
              <strong>{translate("workspaceStickyContact")}:</strong> {summary.maskedContact}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
