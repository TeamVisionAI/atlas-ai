import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import AtlasButton from "../../../components/ui/AtlasButton";
import {
  canPerformProspectWorkspaceAction,
  prospectWorkspaceActionRequiresCoreProspect
} from "../../../security/workspaceProspectPermissions";

const LIFECYCLE_ACTIONS = [
  { id: "assign", labelKey: "workspaceActionAssign" },
  { id: "archive", labelKey: "workspaceActionArchive", variant: "ghost" },
  { id: "restore", labelKey: "workspaceActionRestore" },
  { id: "merge", labelKey: "workspaceActionMerge" },
  { id: "schedule", labelKey: "workspaceActionScheduleInterview" },
  { id: "update", labelKey: "workspaceActionUpdateProspect" }
];

function QuickActionsPanel({
  embedded = false,
  lifecycleBusy,
  pendingActionId,
  prospectCoreId,
  userRole,
  onLifecycleAction,
  children
}) {
  const { translate } = useLanguage();
  const HeadingTag = embedded ? "h3" : "h2";
  const headingKey = embedded ? "workspaceOperationalQuickActions" : "workspaceSectionActions";

  return (
    <section
      className={`prospect-workspace__actions${embedded ? " prospect-workspace__actions--embedded" : ""}`}
      aria-label={translate(headingKey)}
    >
      <HeadingTag className={embedded ? "prospect-workspace__operational-block-title" : "workspace-eyebrow"}>
        {translate(headingKey)}
      </HeadingTag>

      <div className="prospect-workspace-quick-actions">
        <p className="prospect-workspace-quick-actions__label">
          {translate("workspaceLifecycleActions")}
        </p>
        <div className="prospect-workspace-quick-actions__grid">
          {LIFECYCLE_ACTIONS.map((action) => {
            const requiresCore = prospectWorkspaceActionRequiresCoreProspect(action.id);
            const allowed = canPerformProspectWorkspaceAction(userRole, action.id);
            const disabled =
              !allowed ||
              (requiresCore && !prospectCoreId) ||
              (lifecycleBusy && pendingActionId !== action.id);

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
