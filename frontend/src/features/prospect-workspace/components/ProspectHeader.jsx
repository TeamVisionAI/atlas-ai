import { memo, useId } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import ProspectIdentityStrip from "../../../components/prospect-workspace/ProspectIdentityStrip";
import StatusBadge from "../../../components/ui/StatusBadge";

function resolveStatusVariant(status) {
  const milestone = String(status?.canonicalMilestone || status?.milestone || "").toLowerCase();

  if (milestone.includes("stall") || milestone.includes("follow")) {
    return "warning";
  }

  if (milestone.includes("lost") || milestone.includes("archive")) {
    return "danger";
  }

  if (milestone.includes("client") || milestone.includes("recruit") || milestone.includes("complete")) {
    return "success";
  }

  if (milestone.includes("interview") || milestone.includes("qualified")) {
    return "info";
  }

  return "neutral";
}

function ProspectHeader({ identity, status, owner, capture, prospectCore }) {
  const { translate } = useLanguage();
  const statusId = useId();

  const assignedAgent =
    prospectCore?.assignedAgent?.assignedAgentId ||
    owner?.display_name ||
    translate("workspaceHeaderUnassigned");

  const leadSource = capture?.source || translate("workspaceHeaderUnknown");
  const channel = capture?.preferredChannel || translate("workspaceHeaderUnknown");
  const currentStatus = status?.milestone || translate("workspaceStatusSummaryUnknown");
  const statusVariant = resolveStatusVariant(status);

  return (
    <section className="prospect-workspace-header" aria-label={translate("workspaceSectionHeader")}>
      <ProspectIdentityStrip identity={identity} />
      <div className="prospect-workspace-header__status-row">
        <span id={statusId}>{translate("workspaceHeaderCurrentStatus")}</span>
        <StatusBadge variant={statusVariant}>{currentStatus}</StatusBadge>
      </div>
      <dl className="prospect-workspace-header__grid">
        <div className="prospect-workspace-header__item">
          <dt>{translate("workspaceHeaderAssignedAgent")}</dt>
          <dd>{assignedAgent}</dd>
        </div>
        <div className="prospect-workspace-header__item">
          <dt>{translate("workspaceHeaderLeadSource")}</dt>
          <dd>{leadSource}</dd>
        </div>
        <div className="prospect-workspace-header__item">
          <dt>{translate("workspaceHeaderChannel")}</dt>
          <dd>{channel}</dd>
        </div>
      </dl>
    </section>
  );
}

export default memo(ProspectHeader);
