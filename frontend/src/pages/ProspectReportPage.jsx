import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import {
  downloadProspectReportCsv,
  getProspectReport,
  ProspectCenterError
} from "../services/prospectCenterService";
import { appPath } from "../config/appRoutes";
import "./ProspectReportPage.css";

const LIFECYCLES = ["all", "active", "archived"];

function formatWhen(value, locale) {
  if (!value) {
    return "—";
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en-US", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(ms));
}

function readFilters(searchParams) {
  return {
    lifecycle: searchParams.get("lifecycle") || "all",
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo: searchParams.get("dateTo") || "",
    ownerUserId: searchParams.get("ownerUserId") || "",
    milestone: searchParams.get("milestone") || "",
    source: searchParams.get("source") || "",
    appointmentStatus: searchParams.get("appointmentStatus") || ""
  };
}

export default function ProspectReportPage() {
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(!controlPlane);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (controlPlane) {
      setPayload(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getProspectReport({ ...filters, export: true })
      .then((data) => {
        if (!cancelled) {
          setPayload(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ProspectCenterError
              ? translate("prospectReportLoadError")
              : err.message
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controlPlane, filters, translate]);

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  async function handleCsv() {
    setExporting(true);
    try {
      await downloadProspectReportCsv(filters);
    } catch {
      setError(translate("prospectReportLoadError"));
    } finally {
      setExporting(false);
    }
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  const rows = payload?.items || [];
  const generatedAt = payload?.generatedAt || new Date().toISOString();

  return (
    <div className="prospect-report">
      <header className="prospect-report__header no-print">
        <div>
          <h1 className="prospect-report__title">{translate("prospectReportTitle")}</h1>
          <p className="prospect-report__subtitle">{translate("prospectReportSubtitle")}</p>
        </div>
        <div className="prospect-report__actions">
          <Link to={appPath("prospect-center")} className="prospect-report__link">
            {translate("navProspectCenter")}
          </Link>
          <button type="button" className="prospect-report__button" onClick={() => window.print()}>
            {translate("prospectReportPrint")}
          </button>
          <button
            type="button"
            className="prospect-report__button prospect-report__button--secondary"
            onClick={handleCsv}
            disabled={exporting}
          >
            {translate("prospectReportExportCsv")}
          </button>
        </div>
      </header>

      <form className="prospect-report__filters no-print" onSubmit={(event) => event.preventDefault()}>
        <label>
          {translate("prospectReportLifecycle")}
          <select
            value={filters.lifecycle}
            onChange={(event) => updateFilter("lifecycle", event.target.value)}
          >
            {LIFECYCLES.map((value) => (
              <option key={value} value={value}>
                {translate(
                  value === "active"
                    ? "prospectReportLifecycleActive"
                    : value === "archived"
                      ? "prospectReportLifecycleArchived"
                      : "prospectReportLifecycleAll"
                )}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("prospectReportDateFrom")}
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter("dateFrom", event.target.value)}
          />
        </label>
        <label>
          {translate("prospectReportDateTo")}
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter("dateTo", event.target.value)}
          />
        </label>
        <label>
          {translate("prospectReportOwner")}
          <input
            value={filters.ownerUserId}
            onChange={(event) => updateFilter("ownerUserId", event.target.value)}
          />
        </label>
        <label>
          {translate("prospectReportStatus")}
          <input
            value={filters.milestone}
            onChange={(event) => updateFilter("milestone", event.target.value)}
          />
        </label>
        <label>
          {translate("prospectReportSource")}
          <input
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
          />
        </label>
        <label>
          {translate("prospectReportAppointmentStatus")}
          <input
            value={filters.appointmentStatus}
            onChange={(event) => updateFilter("appointmentStatus", event.target.value)}
          />
        </label>
      </form>

      <p className="prospect-report__meta">
        {translate("prospectReportGeneratedAt", { when: formatWhen(generatedAt, language) })}
        {" · "}
        {translate("prospectReportCount", { count: payload?.totalCount ?? rows.length })}
      </p>

      {error ? <p className="prospect-report__error no-print">{error}</p> : null}
      {loading ? <p className="prospect-report__status no-print">{translate("loading")}</p> : null}
      {!loading && !rows.length ? (
        <p className="prospect-report__status">{translate("prospectReportEmpty")}</p>
      ) : null}

      {rows.length ? (
        <table className="prospect-report__table">
          <thead>
            <tr>
              <th>{translate("prospectReportColProspectId")}</th>
              <th>{translate("prospectReportColName")}</th>
              <th>{translate("prospectReportColPhone")}</th>
              <th>{translate("prospectReportColStatus")}</th>
              <th>{translate("prospectReportColOwner")}</th>
              <th>{translate("prospectReportColSource")}</th>
              <th>{translate("prospectReportColCity")}</th>
              <th>{translate("prospectReportColState")}</th>
              <th>{translate("prospectReportColLanguage")}</th>
              <th>{translate("prospectReportColAppointmentStatus")}</th>
              <th>{translate("prospectReportColAppointmentAt")}</th>
              <th>{translate("prospectReportColLastActivity")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.prospectId || ""}-${row.phone || ""}`}>
                <td>{row.prospectId || "—"}</td>
                <td>{row.name || "—"}</td>
                <td>{row.phone || "—"}</td>
                <td>{row.status || "—"}</td>
                <td>{row.owner || "—"}</td>
                <td>{row.source || "—"}</td>
                <td>{row.city || "—"}</td>
                <td>{row.state || "—"}</td>
                <td>{row.language || "—"}</td>
                <td>{row.appointmentStatus || "—"}</td>
                <td>{formatWhen(row.appointmentAt, language)}</td>
                <td>{formatWhen(row.lastActivityAt, language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <p className="prospect-report__hint no-print">{translate("prospectReportPageHint")}</p>
    </div>
  );
}
