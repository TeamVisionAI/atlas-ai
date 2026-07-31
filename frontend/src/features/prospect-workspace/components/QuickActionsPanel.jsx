import { memo, useMemo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import AtlasButton from "../../../components/ui/AtlasButton";
import {
  canPerformProspectWorkspaceAction,
  prospectWorkspaceActionRequiresCoreProspect
} from "../../../security/workspaceProspectPermissions";
import { resolveQuickActionScheduleBehavior } from "../../../engines/quickActionScheduleEngine";

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
  interview,
  lifecycleBusy,
  pendingActionId,
  scheduleActionBusy = false,
  prospectCoreId,
  userRole,
  onLifecycleAction,
  children
}) {
  const { translate } = useLanguage();
  const scheduleBehavior = useMemo(
    () => resolveQuickActionScheduleBehavior(interview),
    [interview]
  );
  const visibleActions = useMemo(
    () =>
      LIFECYCLE_ACTIONS.filter((action) => {
        if (action.id !== "schedule") {
          return true;
        }

        return scheduleBehavior.visible;
      }).map((action) => {
        if (action.id !== "schedule" || !scheduleBehavior.labelKey) {
          return action;
        }

        return {
          ...action,
          labelKey: scheduleBehavior.labelKey
        };
      }),
    [scheduleBehavior]
  );
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
          {visibleActions.map((action) => {
            const requiresCore = prospectWorkspaceActionRequiresCoreProspect(action.id);
            const allowed = canPerformProspectWorkspaceAction(userRole, action.id);
            const isScheduleAction = action.id === "schedule";
            const disabled =
              !allowed ||
              (requiresCore && !prospectCoreId) ||
              (lifecycleBusy && pendingActionId !== action.id) ||
              (isScheduleAction && scheduleActionBusy);

            return (
              <AtlasButton
                key={action.id}
                variant={action.variant || "secondary"}
                className="prospect-workspace-quick-actions__button"
                busy={pendingActionId === action.id || (isScheduleAction && scheduleActionBusy)}
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
