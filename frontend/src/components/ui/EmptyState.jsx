import AtlasButton from "./AtlasButton";

export default function EmptyState({ title, body, actionLabel, onAction }) {
  return (
    <div className="atlas-ui-empty" role="status">
      {title ? <h3 className="atlas-ui-empty__title">{title}</h3> : null}
      {body ? <p className="atlas-ui-empty__body">{body}</p> : null}
      {actionLabel && onAction ? (
        <AtlasButton variant="secondary" onClick={onAction}>
          {actionLabel}
        </AtlasButton>
      ) : null}
    </div>
  );
}
