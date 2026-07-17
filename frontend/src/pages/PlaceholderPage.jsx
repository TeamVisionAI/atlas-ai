export default function PlaceholderPage({ title, description }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: 32,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)"
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: "#64748B", marginBottom: 0 }}>{description}</p>
    </div>
  );
}
