import { useCallback, useEffect, useState } from "react";
import { getOrganizationSettings } from "../../../services/organizationService";
import {
  adaptProspectWorkspaceResponse,
  getProspectWorkspace,
  ProspectWorkspaceError
} from "../services/prospectWorkspaceApi";
import { searchProspects } from "../services/prospectLifecycleApi";

function normalizePhoneQuery(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function useProspectCore(prospectPhone, { enabled = true } = {}) {
  const [prospectCore, setProspectCore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const query = normalizePhoneQuery(prospectPhone);

    if (!query || !enabled) {
      setProspectCore(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await searchProspects({ q: query, limit: 5 });
        const match =
          result.items?.find(
            (item) => normalizePhoneQuery(item.contact?.primaryPhone) === query
          ) || result.items?.[0] || null;

        if (!cancelled) {
          setProspectCore(match);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!cancelled) {
          setProspectCore(null);
          setError(loadError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [prospectPhone, enabled]);

  return {
    prospectCore,
    prospectCoreId: prospectCore?.prospectId || null,
    loading,
    error
  };
}

export function useProspectWorkspace(phone) {
  const [payload, setPayload] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [organizationSettings, setOrganizationSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

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
    return { workspacePayload, adapted, orgSettings };
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

  useEffect(() => {
    const refreshLiveWorkspace = () => {
      if (document.visibilityState !== "visible" || loading) {
        return;
      }

      refreshWorkspace().catch((error) => {
        console.error(error);
      });
    };

    const intervalId = window.setInterval(refreshLiveWorkspace, 20000);
    window.addEventListener("focus", refreshLiveWorkspace);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLiveWorkspace);
    };
  }, [loading, refreshWorkspace]);

  return {
    payload,
    workspace,
    organizationSettings,
    loading,
    loadError,
    refreshWorkspace
  };
}

export function useIsDesktop() {
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
