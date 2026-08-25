import { Link } from "react-router-dom";
import { buildProspectWorkspacePath } from "../../utils/prospectRoutes";
import "./UnsupportedWhatsAppLeadReviewBanner.css";

function formatReceivedAt(value, language) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export default function UnsupportedWhatsAppLeadReviewBanner({
  reviews = [],
  translate,
  language = "es",
  onDismiss,
  onConfirm,
  busyReviewId = null
}) {
  if (!reviews.length) {
    return null;
  }

  return (
    <div className="unsupported-wa-review-stack" data-testid="unsupported-wa-review-stack">
      {reviews.map((review) => {
        const prospectPath = buildProspectWorkspacePath(review.senderPhoneE164);
        const receivedLabel = formatReceivedAt(review.receivedAt, language);
        const destination =
          review.destinationDisplayPhoneNumber || review.destinationPhoneNumberId || "";

        return (
          <section
            key={review.id}
            className="unsupported-wa-review-banner"
            role="alert"
            data-testid={`unsupported-wa-review-${review.id}`}
          >
            <div className="unsupported-wa-review-banner__copy">
              <strong className="unsupported-wa-review-banner__title">
                {translate("unsupportedWhatsAppLeadReviewTitle")}
              </strong>
              <p className="unsupported-wa-review-banner__body">
                {translate("unsupportedWhatsAppLeadReviewBody")}
              </p>
              <ul className="unsupported-wa-review-banner__meta">
                {review.prospectName ? (
                  <li>
                    {translate("unsupportedWhatsAppLeadReviewContact")}: {review.prospectName}
                  </li>
                ) : null}
                <li>
                  {translate("unsupportedWhatsAppLeadReviewSender")}: {review.senderPhoneE164}
                </li>
                {receivedLabel ? (
                  <li>
                    {translate("unsupportedWhatsAppLeadReviewReceived")}: {receivedLabel}
                  </li>
                ) : null}
                {destination ? (
                  <li>
                    {translate("unsupportedWhatsAppLeadReviewDestination")}: {destination}
                  </li>
                ) : null}
              </ul>
            </div>

            <div className="unsupported-wa-review-banner__actions">
              <Link
                className="unsupported-wa-review-banner__button unsupported-wa-review-banner__button--primary"
                to={prospectPath}
              >
                {translate("unsupportedWhatsAppLeadReviewOpenProspect")}
              </Link>
              <button
                type="button"
                className="unsupported-wa-review-banner__button"
                disabled={busyReviewId === review.id}
                onClick={() => onConfirm?.(review)}
              >
                {translate("unsupportedWhatsAppLeadReviewConfirmLead")}
              </button>
              <button
                type="button"
                className="unsupported-wa-review-banner__button unsupported-wa-review-banner__button--ghost"
                disabled={busyReviewId === review.id}
                onClick={() => onDismiss?.(review)}
              >
                {translate("unsupportedWhatsAppLeadReviewDismiss")}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
