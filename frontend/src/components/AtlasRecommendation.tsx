import { useState, type ReactNode } from "react";
import { formatTextWithDates } from "../utils/dateFormatter";

export interface AtlasRecommendationData {
  headline: string;
  summary: string[];
  suggestedReply: string;
  importantNotes: string[];
  objections: string[];
  aiRecommendation: string;
}

interface AtlasRecommendationProps {
  data: AtlasRecommendationData;
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
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

export default function AtlasRecommendation({ data }: AtlasRecommendationProps) {
  const [expanded, setExpanded] = useState(false);

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
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "18px 20px",
          background: "transparent",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          textAlign: "left"
        }}
      >
        <span>
          <span style={{ display: "block", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            🧠 Atlas Recommendation
          </span>
          <span style={{ display: "block", fontSize: 15, color: "#93C5FD" }}>
            {data.headline}
          </span>
        </span>

        <span style={{ color: "#94A3B8", fontSize: 14, whiteSpace: "nowrap", marginLeft: 16 }}>
          {expanded ? "▲ Hide Details" : "▼ Show Details"}
        </span>
      </button>

      {expanded ? (
        <div
          style={{
            padding: "0 20px 20px",
            borderTop: "1px solid #374151"
          }}
        >
          <DetailSection label="Summary">
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              {data.summary.map((item) => (
                <li key={item}>{formatTextWithDates(item)}</li>
              ))}
            </ul>
          </DetailSection>

          <DetailSection label="Suggested Reply">
            <p
              style={{
                margin: 0,
                padding: "14px 16px",
                borderRadius: 8,
                background: "#1F2937",
                border: "1px solid #374151",
                fontSize: 15,
                lineHeight: 1.6,
                fontStyle: "italic"
              }}
            >
              &ldquo;{data.suggestedReply}&rdquo;
            </p>
          </DetailSection>

          {data.importantNotes.length ? (
            <DetailSection label="Important Notes">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {data.importantNotes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {data.objections.length ? (
            <DetailSection label="Objections">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {data.objections.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          <DetailSection label="AI Recommendation">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#E5E7EB" }}>
              {data.aiRecommendation}
            </p>
          </DetailSection>
        </div>
      ) : null}
    </div>
  );
}
