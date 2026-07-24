import "./Skeleton.css";

export default function Skeleton({ className = "", variant = "text", style }) {
  return (
    <span
      className={`atlas-ui-skeleton atlas-ui-skeleton--${variant} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="prospect-workspace" aria-busy="true" aria-live="polite">
      <Skeleton variant="title" />
      <Skeleton variant="card" />
      <div className="prospect-workspace__insights">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
      <Skeleton variant="button" style={{ width: "40%" }} />
      <Skeleton variant="card" style={{ height: 220 }} />
    </div>
  );
}
