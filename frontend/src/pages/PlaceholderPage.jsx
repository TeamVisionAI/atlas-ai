import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

export default function PlaceholderPage({
  titleKey,
  descriptionKey,
  actionHref,
  actionLabelKey
}) {
  const { translate } = useLanguage();

  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: 32,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)"
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>{translate(titleKey)}</h1>
      <p style={{ color: "#64748B", marginBottom: actionHref ? 16 : 0 }}>
        {translate(descriptionKey)}
      </p>
      {actionHref && actionLabelKey ? (
        <Link
          to={actionHref}
          style={{
            display: "inline-block",
            color: "#1E3A8A",
            fontWeight: 600,
            textDecoration: "none",
            border: "1px solid #1E3A8A",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          {translate(actionLabelKey)}
        </Link>
      ) : null}
    </div>
  );
}
