import { useCallback, useEffect, useRef, useState } from "react";
import { getExecutiveDashboard, getAlphaMorningBrief } from "../services/executiveDashboardService";
import { getDashboard } from "../services/api";
import { fetchOrganizationBranding } from "../services/organizationBrandingService";
import { useWorkspace } from "../contexts/WorkspaceContext";

export const EXECUTIVE_LOAD_TIMEOUT_MS = 5000;

/**
 * Progressive Executive Dashboard data loading.
 * Phase 1: executive aggregate (KPI + interviews shell)
 * Phase 2: alpha brief + branding (morning summary, priorities)
 * Phase 3: dashboard prospects (agenda enrichment) — deferred, non-blocking
 */
export function useExecutiveDashboardV2Data() {
  const { supportMode } = useWorkspace();
  const [executive, setExecutive] = useState(null);
  const [alphaBrief, setAlphaBrief] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [phase, setPhase] = useState(1);
  const [loadingExecutive, setLoadingExecutive] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [errors, setErrors] = useState({});
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef(null);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    setExecutive(null);
    setAlphaBrief(null);
    setDashboard(null);
    setPhase(1);
    setLoadingExecutive(true);
    setLoadingTimedOut(false);
    setErrors({});

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoadingTimedOut(true);
      }
    }, EXECUTIVE_LOAD_TIMEOUT_MS);

    async function loadPhase1() {
      try {
        const executivePayload = await getExecutiveDashboard({
          signal: controller.signal
        });

        if (!cancelled) {
          setExecutive(executivePayload);
          if (!executivePayload?.v2Metrics) {
            setErrors((prev) => ({
              ...prev,
              v2Metrics: "executiveV2MetricsUnavailable"
            }));
          }
          setPhase(2);
        }
      } catch (error) {
        if (!cancelled && error.name !== "AbortError") {
          setErrors((prev) => ({ ...prev, executive: "executiveLoadError" }));
        }
      } finally {
        if (!cancelled) {
          setLoadingExecutive(false);
          clearTimeout(timeoutId);
        }
      }
    }

    async function loadPhase2() {
      const tasks = [
        getAlphaMorningBrief({ signal: controller.signal })
          .then((payload) => {
            if (!cancelled) {
              setAlphaBrief(payload);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setErrors((prev) => ({ ...prev, alphaBrief: "executiveV2AlphaBriefUnavailable" }));
            }
          }),
        fetchOrganizationBranding({ signal: controller.signal })
          .then((branding) => {
            if (!cancelled) {
              setOrganizationName(branding?.name || "");
            }
          })
          .catch(() => {
            if (!cancelled) {
              setErrors((prev) => ({ ...prev, branding: "executiveV2BrandingUnavailable" }));
            }
          })
      ];

      await Promise.all(tasks);

      if (!cancelled) {
        setPhase(3);
      }
    }

    async function loadPhase3() {
      try {
        const dashboardPayload = await getDashboard({ signal: controller.signal });
        if (!cancelled) {
          setDashboard(dashboardPayload);
        }
      } catch {
        if (!cancelled) {
          setErrors((prev) => ({ ...prev, dashboard: "executiveV2AgendaEnrichmentUnavailable" }));
        }
      }
    }

    async function run() {
      await loadPhase1();
      if (cancelled) {
        return;
      }
      await loadPhase2();
      if (cancelled) {
        return;
      }
      await loadPhase3();
    }

    run();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [reloadToken, supportMode?.active, supportMode?.organizationId]);

  const v2MetricsMissing = Boolean(executive && !executive.v2Metrics);
  const metricsResolved = Boolean(executive?.v2Metrics);
  const metricsLoading = loadingExecutive && !loadingTimedOut && !metricsResolved;
  const metricsUnavailable =
    Boolean(errors.v2Metrics) ||
    v2MetricsMissing ||
    (loadingTimedOut && !metricsResolved);

  return {
    executive,
    alphaBrief,
    dashboard,
    organizationName,
    phase,
    loadingExecutive,
    loadingTimedOut,
    metricsLoading,
    metricsUnavailable,
    metricsResolved,
    v2MetricsMissing,
    errors,
    reload,
    prospects: dashboard?.prospects || []
  };
}
