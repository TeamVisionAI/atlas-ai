import { useLanguage } from "../i18n/LanguageContext";

export interface JourneyPackageItem {
  id: string;
  label: string;
}

export interface JourneyPackageProps {
  title: string;
  items: JourneyPackageItem[];
  actionLabel: string;
  language?: string;
  onSend: () => void;
}

export default function JourneyPackage({
  title,
  items,
  actionLabel,
  language,
  onSend
}: JourneyPackageProps) {
  const { translate } = useLanguage();

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 12,
        padding: 20,
        color: "#fff"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>📦 {title}</h3>
          {language ? (
            <p style={{ margin: 0, color: "#94A3B8", fontSize: 13 }}>
              {translate("missionControlJourneyLanguage", { language })}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSend}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#1E3A8A",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            whiteSpace: "nowrap"
          }}
        >
          {actionLabel}
        </button>
      </div>

      <ul
        style={{
          margin: 0,
          paddingLeft: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "8px 16px",
          color: "#E5E7EB",
          fontSize: 14
        }}
      >
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </div>
  );
}
