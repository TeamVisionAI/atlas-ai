import ErrorState from "../ui/ErrorState";
import "./AppointmentErrorCard.css";

export default function AppointmentErrorCard({
  title,
  body,
  retryLabel,
  onRetry,
  compact = false
}) {
  return (
    <div
      className={`appointment-error-card${compact ? " appointment-error-card--compact" : ""}`}
    >
      <ErrorState title={title} body={body} retryLabel={retryLabel} onRetry={onRetry} />
    </div>
  );
}
