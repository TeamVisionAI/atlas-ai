import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import AtlasSelect from "../components/ui/AtlasSelect";
import StatusBadge from "../components/ui/StatusBadge";
import { getIulFollowUpWorklist } from "../services/iulFollowUpWorklistService";
import { navigateToProspectWorkspace } from "../utils/prospectRoutes";
import "./IulFollowUpWorklistPage.css";

const FILTER_OPTIONS = [
  { value: "all", labelKey: "iulFollowUpFilterAll" },
  { value: "DUE_TODAY", labelKey: "iulFollowUpFilterDueToday" },
  { value: "OVERDUE", labelKey: "iulFollowUpFilterOverdue" },
  { value: "THIS_WEEK", labelKey: "iulFollowUpFilterThisWeek" },
  { value: "WAITING_ON_PROSPECT", labelKey: "iulFollowUpFilterWaiting" },
  { value: "REVIEW_SCHEDULED", labelKey: "iulFollowUpFilterScheduled" },
  { value: "NO_FOLLOW_UP_SET", labelKey: "iulFollowUpFilterNone" }
];

function statusVariant(status) {
  switch (status) {
    case "OVERDUE":
      return "danger";
    case "DUE_TODAY":
      return "warning";
    case "REVIEW_SCHEDULED":
      return "success";
    default:
      return "neutral";
  }
}

export default function IulFollowUpWorklistPage() {
  const { translate } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [payload, setPayload] = useState({ items: [], filters: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filter = searchParams.get("filter") || "all";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIulFollowUpWorklist({ filter: filter === "all" ? undefined : filter });
      setPayload(data);
    } catch (err) {
      setError(err.message || "Failed to load worklist");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = payload.items || [];
  const summary = useMemo(
    () => ({
      total: payload.filters?.all || rows.length,
      nearExpiry: payload.filters?.nearExpiry || 0
    }),
    [payload.filters, rows.length]
  );

  return (
    <div className="iul-worklist-page">
      <header className="iul-worklist-page__header no-print">
        <div>
          <h1>{translate("iulFollowUpWorklistTitle")}</h1>
          <p>{translate("iulFollowUpWorklistSubtitle")}</p>
        </div>
        <div className="iul-worklist-page__actions">
          <AtlasSelect
            value={filter}
            onChange={(value) =>
              setSearchParams(value === "all" ? {} : { filter: value })
            }
            options={FILTER_OPTIONS.map((option) => ({
              value: option.value,
              label: translate(option.labelKey)
            }))}
          />
          <button type="button" className="atlas-btn" onClick={() => window.print()}>
            {translate("iulFollowUpPrint")}
          </button>
          <a
            className="atlas-btn atlas-btn--secondary"
            href={`/api/iul-follow-up-worklist/export.csv?filter=${encodeURIComponent(filter === "all" ? "" : filter)}`}
          >
            {translate("iulFollowUpExportCsv")}
          </a>
        </div>
      </header>

      <div className="iul-worklist-page__summary no-print">
        <span>{translate("iulFollowUpTotal", { count: summary.total })}</span>
        {summary.nearExpiry ? (
          <span className="iul-worklist-page__near-expiry">
            {translate("iulFollowUpNearExpiry", { count: summary.nearExpiry })}
          </span>
        ) : null}
      </div>

      {loading ? <p>{translate("loading")}</p> : null}
      {error ? <p className="iul-worklist-page__error">{error}</p> : null}

      <table className="iul-worklist-table">
        <thead>
          <tr>
            <th>{translate("iulFollowUpColumnName")}</th>
            <th>{translate("iulFollowUpColumnPhone")}</th>
            <th>{translate("iulFollowUpColumnStage")}</th>
            <th>{translate("iulFollowUpColumnStatus")}</th>
            <th>{translate("iulFollowUpColumnNext")}</th>
            <th>{translate("iulFollowUpColumnWhatsApp")}</th>
            <th>{translate("iulFollowUpColumnChannel")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.phone} className={item.whatsappNearExpiry ? "is-near-expiry" : ""}>
              <td>
                <button
                  type="button"
                  className="iul-worklist-link"
                  onClick={() => navigateToProspectWorkspace(item.phone)}
                >
                  {item.name || item.phone}
                </button>
              </td>
              <td>{item.phone}</td>
              <td>{item.iulStage}</td>
              <td>
                <StatusBadge variant={statusVariant(item.followUpStatus)}>
                  {item.followUpStatus}
                </StatusBadge>
              </td>
              <td>{item.nextFollowUpAt || item.appointmentAt || "—"}</td>
              <td>{item.whatsappWindowStatus}</td>
              <td>{item.recommendedFollowUpChannel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
