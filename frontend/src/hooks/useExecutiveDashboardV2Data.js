import { useEffect, useRef, useState } from "react";
import { getExecutiveDashboard, getAlphaMorningBrief } from "../services/executiveDashboardService";
import { getDashboard } from "../services/api";
import { fetchOrganizationBranding } from "../services/organizationBrandingService";

/**
 * Progressive Executive Dashboard data loading.
 * Phase 1: executive aggregate (KPI + interviews shell)
 * Phase 2: alpha brief + branding (morning summary, priorities)
 * Phase 3: dashboard prospects (agenda enrichment) — deferred, non-blocking
 */
export function useExecutiveDashboardV2Data() {
  const [executive, setExecutive] = useState(null);
  const [alphaBrief, setAlphaBrief] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [phase, setPhase] = useState(1);
  const [loadingExecutive, setLoadingExecutive] = useState(true);
  const [errors, setErrors] = useState({});
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    async function loadPhase1() {
      setLoadingExecutive(true);
      setErrors({});

      try {
        const executivePayload = await getExecutiveDashboard({
          signal: controller.signal
        });

        if (!cancelled) {
          setExecutive(executivePayload);
          setPhase(2);
        }
      } catch (error) {
        if (!cancelled && error.name !== "AbortError") {
          setErrors((prev) => ({ ...prev, executive: "executiveLoadError" }));
        }
      } finally {
        if (!cancelled) {
          setLoadingExecutive(false);
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
      controller.abort();
    };
  }, []);

  return {
    executive,
    alphaBrief,
    dashboard,
    organizationName,
    phase,
    loadingExecutive,
    errors,
    prospects: dashboard?.prospects || []
  };
}
