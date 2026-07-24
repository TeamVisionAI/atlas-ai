import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import AtlasButton from "../../../components/ui/AtlasButton";

const LIFECYCLE_ACTIONS = [
  { id: "assign", labelKey: "workspaceActionAssign" },
  { id: "archive", labelKey: "workspaceActionArchive", variant: "ghost" },
  { id: "restore", labelKey: "workspaceActionRestore" },
  { id: "merge", labelKey: "workspaceActionMerge" },
  { id: "schedule", labelKey: "workspaceActionScheduleInterview" },
  { id: "contact", labelKey: "workspaceActionContact" },
  { id: "update", labelKey: "workspaceActionUpdateProspect" }
];

function QuickActionsPanel({
  lifecycleBusy,
  pendingActionId,
  prospectCoreId,
  onLifecycleAction,
  children
}) {
  const { translate } = useLanguage();

  return (
    <section className="prospect-workspace__actions" aria-label={translate("workspaceSectionActions")}>
      <h2 className="workspace-eyebrow">{translate("workspaceSectionActions")}</h2>

      <div className="prospect-workspace-quick-actions">
        <p className="prospect-workspace-quick-actions__label">
          {translate("workspaceLifecycleActions")}
        </p>
        <div className="prospect-workspace-quick-actions__grid">
          {LIFECYCLE_ACTIONS.map((action) => {
            const needsCore = action.id !== "schedule" && action.id !== "contact";
            const disabled =
              (needsCore && !prospectCoreId) || (lifecycleBusy && pendingActionId !== action.id);

            return (
              <AtlasButton
                key={action.id}
                variant={action.variant || "secondary"}
                className="prospect-workspace-quick-actions__button"
                busy={pendingActionId === action.id}
                disabled={disabled}
                onClick={() => onLifecycleAction(action.id)}
              >
                {translate(action.labelKey)}
              </AtlasButton>
            );
          })}
        </div>
      </div>

      {children}
    </section>
  );
}

export default memo(QuickActionsPanel);
