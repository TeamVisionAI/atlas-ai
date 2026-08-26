import "./ControlPlaneEmptyState.css";

export default function ControlPlaneEmptyState({ translate }) {
  return (
    <div className="control-plane-empty" data-testid="control-plane-empty">
      <p className="control-plane-empty__copy">
        {translate("controlPlaneEnterSupportMode")}
      </p>
    </div>
  );
}
