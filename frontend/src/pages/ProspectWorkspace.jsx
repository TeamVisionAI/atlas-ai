import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getOrganizationSettings } from "../services/organizationService";
import {
  MissionControlError,
  postMissionControlAction,
  syncMissionControlWorkflow
} from "../services/missionControlService";
import {
  getProspectWorkspace,
  ProspectWorkspaceError,
  updateProspectCommunicationLanguage
} from "../services/prospectWorkspaceService";
import { adaptProspectWorkspaceResponse } from "../adapters/prospectWorkspaceAdapter";
import { buildWorkspaceContext } from "../engines/contextEngine";
import {
  createDefaultWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  shouldShowWorkflowGate
} from "../engines/workflowEngine";
import { useLanguage } from "../i18n/LanguageContext";
import { normalizeProspectLanguage } from "../types/language";
import ProspectIdentityStrip from "../components/prospect-workspace/ProspectIdentityStrip";
import JourneyProgress from "../components/prospect-workspace/JourneyProgress";
import ActivityFeed from "../components/prospect-workspace/ActivityFeed";
import ProspectDetailsPanel from "../components/prospect-workspace/ProspectDetailsPanel";
import NextActions from "../components/NextActions";
import WorkflowGatePanel from "../components/WorkflowGatePanel";
import WorkflowCompleteBanner from "../components/WorkflowCompleteBanner";
import "./ProspectWorkspace.css";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 960px)").matches
      : false
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const onChange = () => setIsDesktop(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export default function ProspectWorkspace() {
  const { phone: routePhone } = useParams();
  const navigate = useNavigate();
  const { translate } = useLanguage();
  const isDesktop = useIsDesktop();
  const phone = decodeURIComponent(routePhone || "");

  const [payload, setPayload] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [organizationSettings, setOrganizationSettings] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [workflowComplete, setWorkflowComplete] = useState(null);
  const [communicationLanguageSaving, setCommunicationLanguageSaving] = useState(false);
  const [communicationLanguageError, setCommunicationLanguageError] = useState(null);

  const refreshWorkspace = useCallback(async () => {
    const [workspacePayload, orgSettings] = await Promise.all([
      getProspectWorkspace(phone),
      getOrganizationSettings()
    ]);

    if (!workspacePayload) {
      throw new ProspectWorkspaceError("Not found", 404);
    }

    const adapted = adaptProspectWorkspaceResponse(workspacePayload);
    setPayload(workspacePayload);
    setWorkspace(adapted);
    setOrganizationSettings(orgSettings);
    setWorkflowState(loadWorkflowState(adapted.phone) || createDefaultWorkflowState());
  }, [phone]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        await refreshWorkspace();
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setLoadError(
            error instanceof ProspectWorkspaceError && error.status === 404
              ? { key: "workspaceNotFound" }
              : { key: "workspaceLoadError" }
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (phone) {
      load();
    } else {
      setLoading(false);
      setLoadError({ key: "workspaceNotFound" });
    }

    return () => {
      cancelled = true;
    };
  }, [phone, refreshWorkspace]);

  const handleCommunicationLanguageChange = useCallback(
    async (nextLanguage) => {
      if (!workspace?.phone || workspace.capture?.communicationLanguage === nextLanguage) {
        return;
      }

      setCommunicationLanguageSaving(true);
      setCommunicationLanguageError(null);

      try {
        await updateProspectCommunicationLanguage(workspace.phone, nextLanguage);
        setWorkspace((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            identity: {
              ...current.identity,
              communicationLanguage: normalizeProspectLanguage(nextLanguage)
            },
            capture: {
              ...current.capture,
              communicationLanguage: nextLanguage
            }
          };
        });
        setPayload((current) =>
          current
            ? {
                ...current,
                prospect: {
                  ...current.prospect,
                  communication_language: nextLanguage
                }
              }
            : current
        );
      } catch (error) {
        console.error(error);
        setCommunicationLanguageError(
          error instanceof ProspectWorkspaceError
            ? error.message
            : translate("workspaceCommunicationLanguageError")
        );
      } finally {
        setCommunicationLanguageSaving(false);
      }
    },
    [workspace?.phone, workspace?.capture?.communicationLanguage, translate]
  );

  const handleOrganizationResourceMissing = useCallback(
    (resourceKey) => {
      const messages = {
        zoomInterviewUrl: translate("missionControlZoomNotConfigured"),
        "office.mapsUrl": translate("missionControlOfficeNotConfigured")
      };

      setActionError(messages[resourceKey] || translate("missionControlOrgResourceMissing"));
    },
    [translate]
  );

  const handleMissionAction = useCallback(
    async (actionId) => {
      setActionError(null);

      if (!workspace?.phone) {
        return;
      }

      if (actionId === "call") {
        window.open(`tel:${workspace.phone}`, "_self");
        await postMissionControlAction(workspace.phone, "call");
        return;
      }

      if (actionId === "whatsapp") {
        window.open(`https://wa.me/${workspace.phone.replace(/\D/g, "")}`, "_blank");
        await postMissionControlAction(workspace.phone, "log_whatsapp_open");
        return;
      }

      try {
        let actionPayload = {};

        if (actionId === "notes") {
          const text = window.prompt(translate("missionControlAddNotePrompt"));

          if (!text?.trim()) {
            return;
          }

          actionPayload = { text: text.trim() };
        }

        const result = await postMissionControlAction(workspace.phone, actionId, actionPayload);

        if (!result.success) {
          setActionError(result.message);
          return;
        }

        await refreshWorkspace();
      } catch (error) {
        console.error(error);
        setActionError(
          error instanceof MissionControlError
            ? translate("missionControlActionFailed")
            : error.message
        );
      }
    },
    [workspace?.phone, refreshWorkspace, translate]
  );

  const handleGateOutcome = useCallback(
    async (localState) => {
      if (!workspace?.phone) {
        return;
      }

      const saved = saveWorkflowState(workspace.phone, localState);
      setWorkflowState(saved);

      try {
        await syncMissionControlWorkflow(workspace.phone, saved);
      } catch (error) {
        console.error(error);
      }

      await refreshWorkspace();

      if (saved.outcome === "Recruited" && saved.orientationScheduled) {
        setWorkflowComplete({
          message: translate("missionControlOrientationReady")
        });
      }
    },
    [workspace?.phone, refreshWorkspace, translate]
  );

  const workspaceContext = useMemo(() => {
    if (!workspace || workflowState === null || !organizationSettings) {
      return null;
    }

    return buildWorkspaceContext({
      workspace,
      organizationSettings,
      workflowState,
      translate,
      handlers: {
        onAction: handleMissionAction,
        onOrganizationResourceMissing: handleOrganizationResourceMissing
      }
    });
  }, [
    workspace,
    organizationSettings,
    workflowState,
    translate,
    handleMissionAction,
    handleOrganizationResourceMissing
  ]);

  const showGate =
    workspace?.workflowGate?.active ??
    (workspace && workflowState
      ? shouldShowWorkflowGate(workspace, null, workflowState)
      : false);

  if (loading) {
    return (
      <div className="prospect-workspace">
        <p className="prospect-workspace__loading">{translate("workspaceLoading")}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="prospect-workspace">
        <p className="prospect-workspace__error">{translate(loadError.key)}</p>
      </div>
    );
  }

  if (!workspace || !workspaceContext) {
    return (
      <div className="prospect-workspace">
        <p className="prospect-workspace__error">{translate("workspaceNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="prospect-workspace">
      <header className="prospect-workspace__toolbar">
        <Link to="/" className="prospect-workspace__back">
          ← {translate("workspaceBack")}
        </Link>
        <span className="prospect-workspace__title">{translate("workspaceTitle")}</span>
        <button
          type="button"
          className="prospect-workspace__mission-link"
          onClick={() =>
            navigate(`/mission-control?phone=${encodeURIComponent(workspace.phone)}`)
          }
        >
          {translate("executiveOpenMissionControl")}
        </button>
      </header>

      <ProspectIdentityStrip identity={workspace.identity} />
      <JourneyProgress journey={workspace.journey} />

      <section className="prospect-workspace__actions" aria-label={translate("workspaceSectionActions")}>
        <h2 className="workspace-eyebrow">{translate("workspaceSectionActions")}</h2>

        {workflowComplete ? (
          <WorkflowCompleteBanner
            message={workflowComplete.message}
            hasNextPriority={false}
            onNextPriority={() => {}}
          />
        ) : null}

        {actionError ? <p className="prospect-workspace__action-error">{actionError}</p> : null}

        {showGate ? (
          <WorkflowGatePanel
            gate={workspace.workflowGate}
            workflow={payload?.workflow}
            prospectName={workspace.identity.name}
            phone={workspace.phone}
            onComplete={handleGateOutcome}
          />
        ) : (
          <NextActions actions={workspaceContext.nextActions} />
        )}
      </section>

      <div className="prospect-workspace__columns">
        <ActivityFeed
          phone={workspace.phone}
          previewItems={payload?.activityPreview || []}
          onNoteAdded={refreshWorkspace}
        />
        <ProspectDetailsPanel
          interview={workspace.interview}
          status={workspace.status}
          capture={workspace.capture}
          owner={workspace.owner}
          collapsible={!isDesktop}
          onCommunicationLanguageChange={handleCommunicationLanguageChange}
          communicationLanguageSaving={communicationLanguageSaving}
          communicationLanguageError={communicationLanguageError}
        />
      </div>
    </div>
  );
}
