import { useLanguage } from "../../i18n/LanguageContext";
import {
  hasRequiredValidationErrors,
  partitionValidationItems,
  resolveDeliveryChannelLabel
} from "../../engines/communicationPreviewEngine.js";
import AtlasButton from "../ui/AtlasButton";
import "./CommunicationPreview.css";

const MISSING_LABEL_KEYS = {
  representativeName: "communicationPreviewMissingRepresentative",
  representativeTitle: "communicationPreviewMissingRepresentativeTitle",
  zoomLink: "communicationPreviewMissingZoomLink",
  officeLocation: "communicationPreviewMissingOfficeLocation",
  interviewSchedule: "communicationPreviewMissingInterviewSchedule",
  prospectName: "communicationPreviewMissingProspectName",
  profilePhoto: "communicationPreviewMissingProfilePhoto",
  officeLogo: "communicationPreviewMissingOfficeLogo"
};

function ValidationSection({ title, items, severity, translate }) {
  if (!items?.length) {
    return null;
  }

  return (
    <div
      className={`communication-preview__validation communication-preview__validation--${severity}`}
      role="status"
    >
      <p className="communication-preview__validation-title">{title}</p>
      <ul className="communication-preview__validation-list">
        {items.map((item) => (
          <li
            key={item.key}
            className={`communication-preview__validation-item communication-preview__validation-item--${severity}`}
          >
            {translate(MISSING_LABEL_KEYS[item.key] || "communicationPreviewMissingGeneric")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CommunicationPreview({
  payload,
  loading = false,
  error = null,
  onBack,
  onCopy,
  onSend,
  sending = false,
  copyBusy = false
}) {
  const { translate } = useLanguage();

  if (loading) {
    return (
      <div className="communication-preview communication-preview--loading">
        <p>{translate("communicationPreviewLoading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="communication-preview communication-preview--error" role="alert">
        <p>{error}</p>
        {onBack ? (
          <AtlasButton variant="secondary" onClick={onBack}>
            {translate("communicationPreviewBackToEdit")}
          </AtlasButton>
        ) : null}
      </div>
    );
  }

  if (!payload) {
    return null;
  }

  const schedule = payload.interview?.schedule;
  const { required, recommended } = partitionValidationItems(payload.missingContent);
  const sendBlocked = hasRequiredValidationErrors(payload.missingContent);
  const deliveryLabel = resolveDeliveryChannelLabel(payload.channel, translate);

  return (
    <div className="communication-preview">
      <header className="communication-preview__header">
        <p className="communication-preview__subtitle">{translate("communicationPreviewSubtitle")}</p>
      </header>

      <section className="communication-preview__delivery" aria-label={translate("communicationPreviewDeliveryHeading")}>
        <h3 className="communication-preview__section-label">{translate("communicationPreviewDeliveryHeading")}</h3>
        <ul className="communication-preview__delivery-channels">
          <li className="communication-preview__delivery-channel communication-preview__delivery-channel--active">
            {deliveryLabel}
          </li>
        </ul>
      </section>

      <ValidationSection
        title={translate("communicationPreviewRequiredHeading")}
        items={required}
        severity="error"
        translate={translate}
      />
      <ValidationSection
        title={translate("communicationPreviewRecommendedHeading")}
        items={recommended}
        severity="recommended"
        translate={translate}
      />

      <section className="communication-preview__summary" aria-label={translate("communicationPreviewSummaryHeading")}>
        <p className="communication-preview__prospect-name">{payload.prospectName || "—"}</p>
        {schedule ? (
          <div className="communication-preview__schedule">
            <p>{schedule.dateLine}</p>
            <p>
              {schedule.timeLine}
              {schedule.timezoneAbbreviation ? ` (${schedule.timezoneAbbreviation})` : ""}
            </p>
          </div>
        ) : null}
        <div className="communication-preview__summary-meta">
          {payload.interview?.typeLabel ? <p>{payload.interview.typeLabel}</p> : null}
          {payload.languageLabel ? <p>{payload.languageLabel}</p> : null}
        </div>
        {payload.representative?.name ? (
          <div className="communication-preview__representative">
            <p className="communication-preview__section-label">{translate("communicationPreviewRepresentative")}</p>
            <p className="communication-preview__representative-name">{payload.representative.name}</p>
            {payload.representative.title ? (
              <p className="communication-preview__representative-title">{payload.representative.title}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {(payload.media?.profilePhotoUrl || payload.media?.officeLogoUrl) && (
        <section className="communication-preview__media" aria-label={translate("communicationPreviewMediaHeading")}>
          {payload.media.profilePhotoUrl ? (
            <img
              src={payload.media.profilePhotoUrl}
              alt={translate("communicationPreviewProfilePhotoAlt")}
              className="communication-preview__media-image"
            />
          ) : null}
          {payload.media.officeLogoUrl ? (
            <img
              src={payload.media.officeLogoUrl}
              alt={translate("communicationPreviewOfficeLogoAlt")}
              className="communication-preview__media-image communication-preview__media-image--logo"
            />
          ) : null}
        </section>
      )}

      <section className="communication-preview__message" aria-label={translate("communicationPreviewMessageHeading")}>
        <h3 className="communication-preview__section-label">{translate("communicationPreviewMessageHeading")}</h3>
        <pre className="communication-preview__message-body">{payload.message}</pre>
      </section>

      <footer className="communication-preview__actions">
        {onBack ? (
          <AtlasButton variant="ghost" onClick={onBack} disabled={sending || copyBusy}>
            {translate("communicationPreviewBackToEdit")}
          </AtlasButton>
        ) : null}
        {onCopy ? (
          <AtlasButton variant="secondary" onClick={onCopy} busy={copyBusy} disabled={sending}>
            {translate("communicationPreviewCopy")}
          </AtlasButton>
        ) : null}
        {onSend ? (
          <AtlasButton
            variant="primary"
            onClick={onSend}
            busy={sending}
            disabled={copyBusy || sendBlocked}
          >
            {translate("communicationPreviewSendInvitation")}
          </AtlasButton>
        ) : null}
      </footer>
    </div>
  );
}
