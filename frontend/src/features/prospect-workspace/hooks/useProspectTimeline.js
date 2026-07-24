import { useEffect, useState } from "react";
import { getProspectTimeline, ProspectTimelineError } from "../services/timelineApi";

export function useProspectTimeline(prospectId, { enabled = false, limit = 20 } = {}) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !prospectId) {
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await getProspectTimeline(prospectId, { limit });
        if (!cancelled) {
          setTimeline(result);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!cancelled) {
          setTimeline(null);
          setError(
            loadError instanceof ProspectTimelineError
              ? { key: "workspaceTimelineLoadError" }
              : { key: "workspaceTimelineLoadError" }
          );
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
  }, [enabled, prospectId, limit]);

  return { timeline, loading, error };
}
