import AtlasButton from "./AtlasButton";

export default function ErrorState({ title, body, retryLabel, onRetry }) {
  return (
    <div className="atlas-ui-error" role="alert">
      {title ? <h3 className="atlas-ui-error__title">{title}</h3> : null}
      {body ? <p className="atlas-ui-error__body">{body}</p> : null}
      {retryLabel && onRetry ? (
        <AtlasButton variant="primary" onClick={onRetry}>
          {retryLabel}
        </AtlasButton>
      ) : null}
    </div>
  );
}
