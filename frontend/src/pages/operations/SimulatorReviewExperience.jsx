import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { operationsCenterPath } from "../../config/operationsCenterNav";
import { adaptMissionControlResponse } from "../../adapters/missionControlAdapter";
import { buildAtlasBriefBullets } from "../../engines/missionPresentationEngine";
import ConversationPanel from "../../components/ConversationPanel";
import AiActionCenter from "../../components/AiActionCenter";
import AtlasBrief from "../../components/design-system/AtlasBrief";
import RecruitingFunnelStatus from "../../components/RecruitingFunnelStatus";
import {
  OpsErrorState,
  OpsLoadingState,
  OpsStatusBadge
} from "../../components/operations/OpsShared";
import {
  fetchSimulatorReviewExperience,
  sendSimulatorReviewMessage
} from "../../services/operationsCenterService";

function ReviewTracePanel({ trace, t }) {
  const [expanded, setExpanded] = useState(false);

  if (!trace) {
    return null;
  }

  return (
    <section className="ops-review-panel ops-review-panel--trace">
      <header className="ops-review-panel__header">
        <div>
          <h3>{t.opsReviewWorkflowTrace}</h3>
          <p className="ops-muted">{t.opsReviewWorkflowTraceHint}</p>
        </div>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t.opsReviewHideTechnical : t.opsReviewShowTechnical}
        </button>
      </header>

      <ol className="ops-review-trace">
        {(trace.pipelineSteps || []).map((step) => (
          <li key={`${step.step}-${step.timestamp}`} className={`ops-review-trace__item is-${step.status}`}>
            <span className="ops-review-trace__label">{t[`opsReviewStep_${step.step}`] || step.step}</span>
            <OpsStatusBadge status={step.status === "complete" ? "pass" : step.status} />
            {step.detail ? <span className="ops-review-trace__detail">{String(step.detail)}</span> : null}
          </li>
        ))}
      </ol>

      {expanded ? (
        <div className="ops-review-trace__technical">
          <h4>{t.opsReviewEventTimeline}</h4>
          <ul>
            {(trace.timeline || []).map((entry) => (
              <li key={`${entry.kind}-${entry.timestamp}-${entry.label}`}>
                <time dateTime={entry.timestamp}>
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
                <span>{entry.label}</span>
                {entry.summary ? <span className="ops-muted">{entry.summary}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ProspectSummaryCard({ workspace, t }) {
  const prospect = workspace?.prospect;

  if (!prospect) {
    return null;
  }

  return (
    <section className="ops-review-panel">
      <header className="ops-review-panel__header">
        <h3>{t.opsReviewProspectTitle}</h3>
      </header>
      <dl className="ops-review-grid">
        <div>
          <dt>{t.opsReviewProspectName}</dt>
          <dd>{prospect.name || "—"}</dd>
        </div>
        <div>
          <dt>{t.opsReviewProspectPhone}</dt>
          <dd>{prospect.phone || "—"}</dd>
        </div>
        <div>
          <dt>{t.opsReviewProspectLanguage}</dt>
          <dd>{prospect.communication_language || prospect.language || "—"}</dd>
        </div>
        <div>
          <dt>{t.opsReviewProspectLocation}</dt>
          <dd>
            {[prospect.city, prospect.state].filter(Boolean).join(", ") || "—"}
          </dd>
        </div>
        <div>
          <dt>{t.opsReviewProspectMilestone}</dt>
          <dd>{workspace.workflow?.canonicalMilestone || prospect.current_step || "—"}</dd>
        </div>
        <div>
          <dt>{t.opsReviewProspectQualification}</dt>
          <dd>{workspace.workflow?.missionControlPriorityTier || "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function SimulatorReviewExperience({ t: parentT }) {
  const { phone: encodedPhone } = useParams();
  const phone = decodeURIComponent(encodedPhone || "");
  const { t: contextT } = useLanguage();
  const t = parentT || contextT;

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!phone) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchSimulatorReviewExperience(phone);
      setPayload(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  const workspace = useMemo(() => {
    if (!payload?.missionControl) {
      return null;
    }

    return adaptMissionControlResponse(payload.missionControl, null, { isLive: false });
  }, [payload]);

  const atlasBriefBullets = useMemo(
    () => buildAtlasBriefBullets(workspace?.aiBriefLines || [], null, t),
    [workspace?.aiBriefLines, t]
  );

  async function handleSendMessage(event) {
    event.preventDefault();

    const message = draftMessage.trim();

    if (!message || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const data = await sendSimulatorReviewMessage(phone, message);
      setPayload(data);
      setDraftMessage("");
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  }

  if (loading && !payload) {
    return <OpsLoadingState label={t.loading} />;
  }

  if (error && !payload) {
    return (
      <section className="ops-section">
        <OpsErrorState message={error} />
        <Link className="ops-button ops-button--secondary" to={operationsCenterPath("workflow-simulator")}>
          {t.opsReviewBackToSimulator}
        </Link>
      </section>
    );
  }

  const review = payload?.review;
  const messages = workspace?.conversation?.messages || [];

  return (
    <section className="ops-section ops-review">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsReviewEyebrow}</p>
          <h2>{t.opsReviewTitle}</h2>
          <p className="ops-muted">{review?.disclaimer}</p>
        </div>
        <div className="ops-action-row">
          <span className="ops-review-badge">{review?.badgeLabel}</span>
          <Link className="ops-button ops-button--secondary" to={operationsCenterPath("workflow-simulator")}>
            {t.opsReviewBackToSimulator}
          </Link>
        </div>
      </header>

      {error ? <OpsErrorState message={error} /> : null}

      <div className="ops-review-layout">
        <div className="ops-review-column">
          <section className="ops-review-panel">
            <header className="ops-review-panel__header">
              <div>
                <h3>{t.opsReviewConversationTitle}</h3>
                <p className="ops-muted">{t.opsReviewConversationHint}</p>
              </div>
              <span className="ops-review-badge ops-review-badge--inline">{review?.badgeLabel}</span>
            </header>

            <ConversationPanel
              messages={messages}
              lastMessage={workspace?.conversation?.lastMessage}
              direction={workspace?.conversation?.direction}
              timestamp={workspace?.conversation?.timestamp}
            />

            <form className="ops-review-compose" onSubmit={handleSendMessage}>
              <label htmlFor="ops-review-message">{t.opsReviewComposeLabel}</label>
              <textarea
                id="ops-review-message"
                rows={3}
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                placeholder={t.opsReviewComposePlaceholder}
              />
              <button type="submit" className="ops-button" disabled={sending || !draftMessage.trim()}>
                {sending ? t.opsReviewSending : t.opsReviewSendSimulated}
              </button>
            </form>
          </section>

          <ProspectSummaryCard workspace={payload?.workspace} t={t} />
        </div>

        <div className="ops-review-column">
          <section className="ops-review-panel">
            <header className="ops-review-panel__header">
              <h3>{t.opsReviewMissionControlTitle}</h3>
            </header>

            <RecruitingFunnelStatus recruitingStatus={workspace?.recruitingStatus} />

            <div className="ops-review-mc-stack">
              <AtlasBrief
                bullets={atlasBriefBullets}
                expandedContent={workspace?.expandedBrief}
              />
              <AiActionCenter actionCenter={workspace?.aiActionCenter} />
            </div>
          </section>

          <ReviewTracePanel trace={payload?.workflowTrace} t={t} />
        </div>
      </div>
    </section>
  );
}
