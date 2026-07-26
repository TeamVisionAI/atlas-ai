import {
  getActionPresentation,
  resolveActionVariant
} from "../../engines/actionPresentation";

export function buildMissionActionCard(action, { translate, phone, variantOverride, featured = false, onClick }) {
  const presentation = getActionPresentation(action.id);
  const subtitle =
    action.id === "call"
      ? phone || translate("missionControlActionCallSubtitle")
      : presentation?.subtitleKey
        ? translate(presentation.subtitleKey)
        : "";

  return {
    id: action.id,
    icon: presentation?.icon || "•",
    title: action.label || (presentation?.titleKey ? translate(presentation.titleKey) : action.id),
    subtitle,
    variant: variantOverride || resolveActionVariant(action.id, featured ? "primary" : "secondary"),
    featured,
    onClick
  };
}
