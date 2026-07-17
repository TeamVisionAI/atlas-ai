export default function SlideOverPanel({ open, title, onClose, children }) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.4)",
          border: "none",
          padding: 0,
          cursor: "pointer",
          zIndex: 1100
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="slide-over-title"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 420,
          background: "white",
          boxShadow: "-8px 0 30px rgba(0, 0, 0, 0.12)",
          zIndex: 1101,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #E5E7EB"
          }}
        >
          <h2 id="slide-over-title" style={{ margin: 0, fontSize: 20 }}>
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: "#64748B"
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>{children}</div>
      </aside>
    </>
  );
}
