import { useState, type ReactNode } from "react";
import { formatTextWithDates } from "../utils/dateFormatter";
import { useLanguage } from "../i18n/LanguageContext";

interface AiBriefProps {
  lines: string[];
  expandedContent?: {
    summary: string[];
    suggestedReply?: string | null;
    importantNotes?: string[];
    objections?: string[];
    aiRecommendation?: string | null;
  };
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#64748B",
          marginBottom: 8
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export default function AiBrief({ lines, expandedContent }: AiBriefProps) {
  const { translate } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const previewLines = lines.slice(0, 5);

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 12,
        overflow: "hidden",
        color: "#fff"
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          width: "100%",
          padding: "16px 20px",
          background: "transparent",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          textAlign: "left",
          gap: 16
        }}
      >
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
            🧠 {translate("missionControlAiBriefTitle")}
          </span>

          <span
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#E5E7EB"
            }}
          >
            {previewLines.length ? (
              previewLines.map((line) => (
                <span key={line}>{formatTextWithDates(line)}</span>
              ))
            ) : (
              <span style={{ color: "#94A3B8" }}>{translate("missionControlAiBriefEmpty")}</span>
            )}
          </span>
        </span>

        <span style={{ color: "#94A3B8", fontSize: 13, whiteSpace: "nowrap" }}>
          {expanded ? translate("missionControlAiBriefHide") : translate("missionControlAiBriefExpand")}
        </span>
      </button>

      {expanded && expandedContent ? (
        <div
          style={{
            padding: "0 20px 18px",
            borderTop: "1px solid #374151"
          }}
        >
          {expandedContent.summary.length ? (
            <DetailSection label={translate("missionControlAiBriefSummary")}>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
                {expandedContent.summary.map((item) => (
                  <li key={item}>{formatTextWithDates(item)}</li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {expandedContent.suggestedReply ? (
            <DetailSection label={translate("missionControlAiBriefSuggestedReply")}>
              <p
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "#1F2937",
                  border: "1px solid #374151",
                  fontSize: 14,
                  lineHeight: 1.6,
                  fontStyle: "italic"
                }}
              >
                &ldquo;{expandedContent.suggestedReply}&rdquo;
              </p>
            </DetailSection>
          ) : null}

          {expandedContent.importantNotes?.length ? (
            <DetailSection label={translate("missionControlAiBriefImportantNotes")}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {expandedContent.importantNotes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {expandedContent.objections?.length ? (
            <DetailSection label={translate("missionControlAiBriefObjections")}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {expandedContent.objections.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {expandedContent.aiRecommendation ? (
            <DetailSection label={translate("missionControlAiBriefRecommendation")}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                {expandedContent.aiRecommendation}
              </p>
            </DetailSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
