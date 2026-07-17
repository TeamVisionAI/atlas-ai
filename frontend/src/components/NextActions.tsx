import { useState } from "react";

export type NextActionVariant = "primary" | "default" | "accent";

export interface NextAction {
  id?: string;
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  variant?: NextActionVariant;
}

interface NextActionsProps {
  actions: NextAction[];
}

const variantStyles: Record<
  NextActionVariant,
  { background: string; border: string; hoverBackground: string }
> = {
  primary: {
    background: "#1E3A8A",
    border: "#2563EB",
    hoverBackground: "#2563EB"
  },
  default: {
    background: "#111827",
    border: "#374151",
    hoverBackground: "#1F2937"
  },
  accent: {
    background: "#172554",
    border: "#1E3A8A",
    hoverBackground: "#1E3A8A"
  }
};

export default function NextActions({ actions }: NextActionsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!actions.length) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16
      }}
    >
      {actions.map((action, index) => {
        const variant = action.variant || "default";
        const palette = variantStyles[variant];
        const isHovered = hoveredIndex === index;

        return (
          <button
            key={action.id || `${action.title}-${index}`}
            type="button"
            onClick={action.onClick}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
              minHeight: 132,
              padding: "20px 22px",
              borderRadius: 12,
              border: `1px solid ${palette.border}`,
              background: isHovered ? palette.hoverBackground : palette.background,
              color: "#fff",
              textAlign: "left",
              cursor: "pointer",
              transition: "background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease",
              transform: isHovered ? "translateY(-2px)" : "none",
              boxShadow: isHovered
                ? "0 10px 24px rgba(0, 0, 0, 0.18)"
                : "0 4px 12px rgba(0, 0, 0, 0.08)"
            }}
          >
            <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden="true">
              {action.icon}
            </span>

            <span>
              <span
                style={{
                  display: "block",
                  fontSize: 17,
                  fontWeight: 600,
                  marginBottom: 4
                }}
              >
                {action.title}
              </span>

              <span
                style={{
                  display: "block",
                  fontSize: 14,
                  color: "#94A3B8",
                  lineHeight: 1.4
                }}
              >
                {action.subtitle}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
