import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import StatusBadge from "../ui/StatusBadge";
import {
  buildProspectCenterPath,
  buildProspectWorkspacePath
} from "../../utils/prospectRoutes";
import MissionControlInlineEmailCapture from "./MissionControlInlineEmailCapture";
import "./MissionControlWorkspaceHeader.css";

const MOBILE_DETAILS_STORAGE_KEY = "mc-header-details-expanded";

function resolveMilestoneVariant(milestone, canonicalMilestone) {
  const value = String(canonicalMilestone || milestone || "").toLowerCase();

  if (value.includes("stall") || value.includes("follow")) {
    return "warning";
  }

  if (value.includes("lost") || value.includes("closed") || value.includes("archive")) {
    return "danger";
  }

  if (
    value.includes("recruit") ||
    value.includes("orientation") ||
    value.includes("onboarding") ||
    value.includes("complete")
  ) {
    return "success";
  }

  if (
    value.includes("interview") ||
    value.includes("qualif") ||
    value.includes("schedule")
  ) {
    return "info";
  }

  return "neutral";
}

function HeaderField({ label, children, className = "" }) {
  return (
    <div className={`mc-cockpit__field ${className}`.trim()}>
      <span className="mc-cockpit__field-label">{label}</span>
      <span className="mc-cockpit__field-value">{children}</span>
    </div>
  );
}

function QueueNavigation({
  translate,
  position,
  totalProspects,
  previousProspect,
  nextProspect,
  onPrevious,
  onNext,
  compact = false
}) {
  return (
    <nav
      className={`mc-cockpit__queue${compact ? " mc-cockpit__queue--compact" : ""}`}
      aria-label={translate("missionControlProspectNavigation")}
    >
      <button
        type="button"
        className="mc-cockpit__queue-btn"
        onClick={onPrevious}
        disabled={!previousProspect}
        aria-label={translate("missionControlPreviousProspect")}
      >
        ◀
        {!compact && previousProspect?.name ? (
          <span className="mc-cockpit__queue-hint">{previousProspect.name}</span>
        ) : null}
      </button>

      <span className="mc-cockpit__queue-position">
        {translate("missionControlProspectPosition", {
          position,
          total: totalProspects
        })}
      </span>

      <button
        type="button"
        className="mc-cockpit__queue-btn mc-cockpit__queue-btn--next"
        onClick={onNext}
        disabled={!nextProspect}
        aria-label={translate("missionControlNextProspect")}
      >
        ▶
        {!compact && nextProspect?.name ? (
          <span className="mc-cockpit__queue-hint">{nextProspect.name}</span>
        ) : null}
      </button>
    </nav>
  );
}

/**
 * Mission Control sticky prospect header — desktop detail row + mobile compact collapse.
 */
export default function MissionControlWorkspaceHeader({
  prospect,
  phone,
  email,
  nextAction,
  executiveFilter,
  currentIndex,
  totalProspects,
  previousProspect,
  nextProspect,
  onPrevious,
  onNext,
  onEmailSaved
}) {
  const { translate } = useLanguage();
  const [detailsExpanded, setDetailsExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.sessionStorage.getItem(MOBILE_DETAILS_STORAGE_KEY) === "true";
  });

  useEffect(() => {
    window.sessionStorage.setItem(MOBILE_DETAILS_STORAGE_KEY, String(detailsExpanded));
  }, [detailsExpanded]);

  const position = totalProspects ? currentIndex + 1 : 0;
  const displayName =
    prospect?.name && prospect.name !== "—"
      ? prospect.name
      : translate("missionControlUnnamedProspect");
  const milestoneLabel = prospect?.milestone || translate("workspaceStatusSummaryUnknown");
  const milestoneVariant = resolveMilestoneVariant(
    prospect?.milestone,
    prospect?.canonicalMilestone
  );
  const emailValue = email?.trim() || null;
  const phoneHref = phone ? `tel:${phone}` : null;
  const emailHref = emailValue ? `mailto:${emailValue}` : null;
  const prospectCenterPath = buildProspectCenterPath({
    filter: executiveFilter || undefined
  });
  const prospectWorkspacePath = phone ? buildProspectWorkspacePath({ phone }) : null;
  const nextActionLabel = nextAction || translate("missionControlNextActionPending");

  function toggleDetails() {
    setDetailsExpanded((current) => !current);
  }

  return (
    <header className="mc-cockpit" aria-label={translate("missionControlWorkspaceHeaderLabel")}>
      {/* Desktop layout */}
      <div className="mc-cockpit__desktop">
        <div className="mc-cockpit__hero">
          <h1 className="mc-cockpit__name">{displayName}</h1>
          <StatusBadge variant={milestoneVariant}>{milestoneLabel}</StatusBadge>
        </div>

        <div className="mc-cockpit__details-grid">
          <HeaderField label={translate("missionControlRowWorkflowOwner")}>
            {prospect?.workflowOwnership || "—"}
          </HeaderField>
          <HeaderField label={translate("missionControlRowPhone")}>
            {phoneHref ? (
              <a href={phoneHref} className="mc-cockpit__link-action">
                {phone}
              </a>
            ) : (
              "—"
            )}
          </HeaderField>
          <HeaderField label={translate("missionControlRowEmail")}>
            {emailHref ? (
              <a href={emailHref} className="mc-cockpit__link-action">
                {emailValue}
              </a>
            ) : (
              <MissionControlInlineEmailCapture
                phone={phone}
                email={emailValue}
                onSaved={onEmailSaved}
              />
            )}
          </HeaderField>
          <HeaderField label={translate("missionControlRowLocation")}>
            {prospect?.location || "—"}
          </HeaderField>
          <HeaderField label={translate("missionControlRowLanguage")}>
            {prospect?.language || "—"}
          </HeaderField>
          <HeaderField label={translate("missionControlRowMilestone")}>{milestoneLabel}</HeaderField>
          <HeaderField label={translate("missionControlRowNextAction")} className="mc-cockpit__field--wide">
            {nextActionLabel}
          </HeaderField>
        </div>

        <div className="mc-cockpit__footer">
          <QueueNavigation
            translate={translate}
            position={position}
            totalProspects={totalProspects}
            previousProspect={previousProspect}
            nextProspect={nextProspect}
            onPrevious={onPrevious}
            onNext={onNext}
          />

          <div className="mc-cockpit__quick-links">
            <Link to={prospectCenterPath} className="mc-cockpit__quick-link">
              {translate("missionControlOpenProspectCenter")}
            </Link>
            {prospectWorkspacePath ? (
              <Link to={prospectWorkspacePath} className="mc-cockpit__quick-link">
                {translate("missionControlOpenProspectWorkspace")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="mc-cockpit__mobile">
        <div className="mc-cockpit__mobile-hero">
          <h1 className="mc-cockpit__name">{displayName}</h1>
          <StatusBadge variant={milestoneVariant}>{milestoneLabel}</StatusBadge>
        </div>

        <div className="mc-cockpit__mobile-contacts">
          {phoneHref ? (
            <a href={phoneHref} className="mc-cockpit__mobile-contact" aria-label={translate("missionControlRowPhone")}>
              📞
            </a>
          ) : (
            <span className="mc-cockpit__mobile-contact mc-cockpit__mobile-contact--disabled" aria-hidden="true">
              📞
            </span>
          )}
          <a
            href={phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : undefined}
            className="mc-cockpit__mobile-contact"
            aria-label={translate("missionControlActionWhatsapp")}
            target="_blank"
            rel="noopener noreferrer"
            onClick={phone ? undefined : (event) => event.preventDefault()}
          >
            💬
          </a>
          {emailHref ? (
            <a href={emailHref} className="mc-cockpit__mobile-contact" aria-label={translate("missionControlRowEmail")}>
              ✉️
            </a>
          ) : (
            <span
              className="mc-cockpit__mobile-contact mc-cockpit__mobile-contact--disabled"
              title={translate("missionControlEmailNotProvided")}
              aria-label={translate("missionControlEmailNotProvided")}
            >
              ✉️
            </span>
          )}
        </div>

        <QueueNavigation
          translate={translate}
          position={position}
          totalProspects={totalProspects}
          previousProspect={previousProspect}
          nextProspect={nextProspect}
          onPrevious={onPrevious}
          onNext={onNext}
          compact
        />

        <button
          type="button"
          className="mc-cockpit__details-toggle"
          onClick={toggleDetails}
          aria-expanded={detailsExpanded}
        >
          {detailsExpanded
            ? translate("missionControlHideDetails")
            : translate("missionControlViewDetails")}
        </button>

        {detailsExpanded ? (
          <div className="mc-cockpit__mobile-details">
            <HeaderField label={translate("missionControlRowWorkflowOwner")}>
              {prospect?.workflowOwnership || "—"}
            </HeaderField>
            <HeaderField label={translate("missionControlRowLocation")}>
              {prospect?.location || "—"}
            </HeaderField>
            <HeaderField label={translate("missionControlRowLanguage")}>
              {prospect?.language || "—"}
            </HeaderField>
            {!emailHref ? (
              <HeaderField label={translate("missionControlRowEmail")}>
                <MissionControlInlineEmailCapture
                  phone={phone}
                  email={emailValue}
                  onSaved={onEmailSaved}
                />
              </HeaderField>
            ) : null}
            <HeaderField label={translate("missionControlRowNextAction")}>
              {nextActionLabel}
            </HeaderField>
            <div className="mc-cockpit__mobile-links">
              <Link to={prospectCenterPath} className="mc-cockpit__quick-link">
                {translate("missionControlOpenProspectCenter")}
              </Link>
              {prospectWorkspacePath ? (
                <Link to={prospectWorkspacePath} className="mc-cockpit__quick-link">
                  {translate("missionControlOpenProspectWorkspace")}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
