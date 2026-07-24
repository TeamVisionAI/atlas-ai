import { useEffect, useMemo, useState } from "react";
import { getMissionControlSummary } from "../services/missionControlReadModelApi";

export function useMissionControlContext(prospectCoreId, { enabled = true } = {}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await getMissionControlSummary();
        if (!cancelled) {
          setSummary(result);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!cancelled) {
          setSummary(null);
          setError({ key: "workspaceMissionControlLoadError" });
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
  }, [enabled]);

  const prospectContext = useMemo(() => {
    if (!summary || !prospectCoreId) {
      return null;
    }

    const metrics = summary.metrics || {};
    const isActive = summary.activeProspectIds?.includes(prospectCoreId) ?? false;

    return {
      isActive,
      activeProspectCount: summary.activeProspectCount ?? metrics.activeProspects ?? 0,
      newLeads: metrics.newLeads ?? 0,
      contactAttempts: metrics.contactAttempts ?? 0,
      scheduledInterviews: metrics.scheduledInterviews ?? 0,
      completedInterviews: metrics.completedInterviews ?? 0
    };
  }, [summary, prospectCoreId]);

  return {
    summary,
    prospectContext,
    loading,
    error
  };
}
