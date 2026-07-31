import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import "./CommunicationPreview.css";

const MISSING_LABEL_KEYS = {
  representativeName: "communicationPreviewMissingRepresentative",
  representativeTitle: "communicationPreviewMissingRepresentativeTitle",
  zoomLink: "communicationPreviewMissingZoomLink",
  officeLocation: "communicationPreviewMissingOfficeLocation",
  interviewSchedule: "communicationPreviewMissingInterviewSchedule",
  organizationName: "communicationPreviewMissingOrganization",
  prospectName: "communicationPreviewMissingProspectName",
  profilePhoto: "communicationPreviewMissingProfilePhoto",
  officeLogo: "communicationPreviewMissingOfficeLogo",
  signature: "communicationPreviewMissingSignature"
};

function MissingContentList({ items, translate }) {
  if (!items?.length) {
    return null;
  }

  return (
    <div className="communication-preview__missing" role="status">
      <p className="communication-preview__missing-title">{translate("communicationPreviewMissingHeading")}</p>
      <ul className="communication-preview__missing-list">
        {items.map((item) => (
          <li
            key={item.key}
            className={`communication-preview__missing-item communication-preview__missing-item--${item.severity || "info"}`}
          >
            {translate(MISSING_LABEL_KEYS[item.key] || "communicationPreviewMissingGeneric")}
            {item.fallback ? ` (${translate("communicationPreviewFallbackUsed")})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataRow({ label, value, missing = false }) {
  return (
    <div className={`communication-preview__meta-row${missing ? " communication-preview__meta-row--missing" : ""}`}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
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
  const scheduleLabel = schedule
    ? `${schedule.dateLine} · ${schedule.timeLine} (${schedule.timezoneLabel})`
    : null;

  return (
    <div className="communication-preview">
      <header className="communication-preview__header">
        <p className="communication-preview__eyebrow">{translate("communicationPreviewHeading")}</p>
        <p className="communication-preview__channel">
          {translate("communicationPreviewChannelLabel")}: {payload.channel} · {payload.deliveryMode}
        </p>
      </header>

      <MissingContentList items={payload.missingContent} translate={translate} />

      <section className="communication-preview__meta" aria-label={translate("communicationPreviewMetaHeading")}>
        <dl className="communication-preview__meta-grid">
          <MetadataRow label={translate("communicationPreviewProspectName")} value={payload.prospectName} />
          <MetadataRow
            label={translate("communicationPreviewInterviewSchedule")}
            value={scheduleLabel}
            missing={!scheduleLabel}
          />
          <MetadataRow
            label={translate("communicationPreviewInterviewType")}
            value={payload.interview?.typeLabel}
          />
          <MetadataRow label={translate("communicationPreviewLanguage")} value={payload.languageLabel} />
          <MetadataRow
            label={translate("communicationPreviewRepresentative")}
            value={payload.representative?.name}
            missing={!payload.representative?.name}
          />
          <MetadataRow
            label={translate("communicationPreviewRepresentativeTitle")}
            value={payload.representative?.title}
          />
          <MetadataRow
            label={translate("communicationPreviewOrganization")}
            value={payload.representative?.organization || payload.signature}
          />
          {payload.location?.type === "zoom" ? (
            <MetadataRow
              label={translate("communicationPreviewZoomLink")}
              value={payload.location?.zoomUrl}
              missing={!payload.location?.zoomUrl}
            />
          ) : (
            <MetadataRow
              label={translate("communicationPreviewOfficeLocation")}
              value={payload.location?.fullAddress}
              missing={!payload.location?.fullAddress}
            />
          )}
        </dl>
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
        <h3 className="communication-preview__message-title">{translate("communicationPreviewMessageHeading")}</h3>
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
            {translate("communicationPreviewCopyMessage")}
          </AtlasButton>
        ) : null}
        {onSend ? (
          <AtlasButton variant="primary" onClick={onSend} busy={sending} disabled={copyBusy}>
            {translate("communicationPreviewSendInvitation")}
          </AtlasButton>
        ) : null}
      </footer>
    </div>
  );
}
