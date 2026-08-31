import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import StatusBadge from "../components/ui/StatusBadge";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import { appPath } from "../config/appRoutes";
import {
  addClientNote,
  ClientsError,
  getClient,
  getClients,
  updateClientStatus
} from "../services/clientsService";
import {
  completeFollowUp,
  createFollowUp,
  cancelFollowUp,
  rescheduleFollowUp,
  FollowUpsError
} from "../services/followUpsService";
import {
  createProduction,
  createProductionFollowUp,
  getProductionList,
  ProductionError,
  updateProduction,
  updateProductionStatus
} from "../services/productionService";
import { emptyProductionForm } from "../engines/productionViewModel";
import { ProductionDialogs, ProductionRecordCard } from "./ProductionRecordsBlock";
import {
  createServiceCase,
  createServiceFollowUp,
  getServiceCases,
  ServiceCasesError,
  updateServiceCase,
  updateServiceCaseStatus
} from "../services/serviceCasesService";
import { emptyServiceForm } from "../engines/serviceViewModel";
import { ServiceCaseCard, ServiceDialogs } from "./ServiceRecordsBlock";
import {
  createPolicyReview,
  getPolicyReviews,
  PolicyReviewsError
} from "../services/policyReviewsService";
import {
  buildPolicyReviewStageLabel,
  emptyPolicyReviewForm
} from "../engines/policyReviewViewModel";
import {
  createDocumentRequest,
  createDocumentRequestFollowUp,
  downloadDocument,
  getDocumentRequests,
  getDocuments,
  linkDocumentToRequest,
  updateDocumentRequestStatus,
  updateDocumentStatus,
  uploadDocument,
  ClientDocumentsError
} from "../services/clientDocumentsService";
import {
  emptyDocumentRequestForm,
  emptyDocumentUploadForm
} from "../engines/documentsViewModel";
import { DocumentCard, DocumentDialogs, DocumentRequestCard } from "./DocumentsRecordsBlock";
import {
  buildClientStatusLabel,
  formatClientTimestamp,
  presentClientHistoryEvent
} from "../engines/clientsViewModel";
import { buildFollowUpDueDate, buildFollowUpStatusLabel } from "../engines/followUpsViewModel";
import RescheduleAppointmentDialog from "../components/appointments/RescheduleAppointmentDialog";
import CancelAppointmentDialog from "../components/appointments/CancelAppointmentDialog";
import CompleteAppointmentDialog from "../components/appointments/CompleteAppointmentDialog";
import "./ClientsPage.css";

function statusVariant(status) {
  switch (String(status || "").toUpperCase()) {
    case "FOLLOW_UP":
      return "warning";
    case "INACTIVE":
      return "neutral";
    default:
      return "success";
  }
}

function ClientDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
  return (
    <div className="clients-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="clients-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="clients-dialog__actions">
          <button type="button" className="clients-dialog__secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="clients-dialog__primary" onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const locale = language === "es" ? "es-US" : "en-US";
  const activeScope = searchParams.get("scope") || "mine";
  const searchQuery = searchParams.get("q") || "";

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [production, setProduction] = useState(null);
  const [service, setService] = useState(null);
  const [documentRequests, setDocumentRequests] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [policyReviews, setPolicyReviews] = useState(null);

  const loadList = useCallback(async () => {
    if (controlPlane) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPayload(await getClients({ search: searchQuery, scope: activeScope }));
    } catch (err) {
      setError(err instanceof ClientsError ? translate("clientsLoadError") : err.message);
    } finally {
      setLoading(false);
    }
  }, [activeScope, controlPlane, searchQuery, translate]);

  const loadDetail = useCallback(async () => {
    if (controlPlane || !clientId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [clientDetail, productionPayload, servicePayload, requestPayload, documentPayload, reviewPayload] =
        await Promise.all([
          getClient(clientId),
          getProductionList({ clientId }),
          getServiceCases({ clientId }),
          getDocumentRequests({ clientId }),
          getDocuments({ clientId }),
          getPolicyReviews({ clientId })
        ]);
      setDetail(clientDetail);
      setProduction(productionPayload);
      setService(servicePayload);
      setDocumentRequests(requestPayload);
      setDocuments(documentPayload);
      setPolicyReviews(reviewPayload);
    } catch (err) {
      setError(
        err instanceof ClientsError ||
        err instanceof ProductionError ||
        err instanceof ServiceCasesError ||
        err instanceof ClientDocumentsError ||
        err instanceof PolicyReviewsError
          ? translate("clientsLoadError")
          : err.message
      );
      setDetail(null);
      setProduction(null);
      setService(null);
      setDocumentRequests(null);
      setDocuments(null);
      setPolicyReviews(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, controlPlane, translate]);

  useEffect(() => {
    if (clientId) {
      loadDetail();
      return;
    }
    loadList();
  }, [clientId, loadDetail, loadList]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed === searchQuery.trim()) return;
      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery, searchParams, setSearchParams]);

  function patchScope(scope) {
    const next = new URLSearchParams(searchParams);
    if (scope === "mine") next.delete("scope");
    else next.set("scope", scope);
    setSearchParams(next, { replace: true });
  }

  async function refresh() {
    if (clientId) await loadDetail();
    else await loadList();
  }

  async function submitDialog() {
    setSaving(true);
    setError(null);
    try {
      if (dialog?.type === "note") {
        await addClientNote(clientId, { body: form.notes });
      } else if (dialog?.type === "status") {
        await updateClientStatus(clientId, { status: form.status });
      } else if (dialog?.type === "create-follow-up") {
        await createFollowUp({
          entityType: "client",
          entityId: clientId,
          subjectLabel: detail?.client?.name,
          subjectPhone: detail?.client?.phone || null,
          ownerUserId: detail?.client?.ownerUserId || null,
          title: form.title || translate("followUpsTitle"),
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: form.notes
        });
      } else if (dialog?.type === "complete-follow-up") {
        await completeFollowUp(dialog.item.id, { completionNote: form.notes });
      } else if (dialog?.type === "reschedule-follow-up") {
        await rescheduleFollowUp(dialog.item.id, { dueDate: form.dueDate, dueTime: form.dueTime || null });
      } else if (dialog?.type === "cancel-follow-up") {
        await cancelFollowUp(dialog.item.id, { notes: form.notes });
      } else if (dialog?.type === "create") {
        await createProduction({
          clientId,
          activityType: form.activityType,
          status: form.status,
          carrier: form.carrier || null,
          productType: form.productType || null,
          amount: form.amount === undefined || form.amount === null || String(form.amount).trim() === "" ? null : form.amount,
          notes: form.notes || null
        });
      } else if (dialog?.type === "edit") {
        await updateProduction(dialog.item.id, {
          activityType: form.activityType,
          carrier: form.carrier || null,
          productType: form.productType || null,
          amount: form.amount === undefined || form.amount === null || String(form.amount).trim() === "" ? null : form.amount,
          notes: form.notes || null
        });
      } else if (dialog?.type === "production-status") {
        await updateProductionStatus(dialog.item.id, { status: form.status });
      } else if (dialog?.type === "production-follow-up") {
        await createProductionFollowUp(dialog.item.id, {
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: form.notes || null
        });
      } else if (dialog?.type === "policy-review-create") {
        await createPolicyReview({
          clientId,
          language: form.language || null,
          state: form.state || null,
          source: form.source || null,
          campaign: form.campaign || null
        });
      } else if (dialog?.type === "service-create") {
        await createServiceCase({
          clientId,
          serviceType: form.serviceType,
          title: form.title,
          notes: form.notes || null,
          dueDate: form.dueDate || null,
          scheduledAppointmentId: form.scheduledAppointmentId || null
        });
      } else if (dialog?.type === "service-edit") {
        await updateServiceCase(dialog.item.id, {
          serviceType: form.serviceType,
          title: form.title,
          notes: form.notes || null,
          dueDate: form.dueDate || null,
          scheduledAppointmentId: form.scheduledAppointmentId || null
        });
      } else if (dialog?.type === "service-status") {
        await updateServiceCaseStatus(dialog.item.id, { status: form.status });
      } else if (dialog?.type === "service-follow-up") {
        await createServiceFollowUp(dialog.item.id, {
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: form.notes || null
        });
      } else if (dialog?.type === "request-create") {
        await createDocumentRequest({
          clientId,
          documentType: form.documentType,
          title: form.title,
          instructions: form.instructions || null,
          dueDate: form.dueDate || null,
          serviceCaseId: form.serviceCaseId || null
        });
      } else if (dialog?.type === "request-status") {
        await updateDocumentRequestStatus(dialog.item.id, { status: form.status });
      } else if (dialog?.type === "request-follow-up") {
        await createDocumentRequestFollowUp(dialog.item.id, {
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: form.notes || null
        });
      } else if (dialog?.type === "document-upload") {
        await uploadDocument({
          file: form.file,
          clientId,
          documentType: form.documentType,
          requestId: form.requestId || null,
          serviceCaseId: form.serviceCaseId || null,
          notes: form.notes || null
        });
      } else if (dialog?.type === "document-status") {
        await updateDocumentStatus(dialog.item.id, { status: form.status });
      } else if (dialog?.type === "document-link") {
        await linkDocumentToRequest(dialog.item.id, { requestId: form.requestId });
      }
      setDialog(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ClientsError || err instanceof FollowUpsError ? err.message : err.message);
    } finally {
      setSaving(false);
    }
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  if (clientId) {
    const client = detail?.client;
    return (
      <div className="clients-page">
        <button type="button" className="clients-page__back" onClick={() => navigate(appPath("clients"))}>
          {translate("clientsBack")}
        </button>
        {loading ? <p className="clients-page__status">{translate("clientsLoading")}</p> : null}
        {error ? <p className="clients-page__error">{error}</p> : null}
        {client ? (
          <>
            <header className="clients-page__header">
              <div>
                <h1 className="clients-page__title">{client.name}</h1>
                <p className="clients-page__subtitle">{translate("clientsProfileSubtitle")}</p>
              </div>
              <StatusBadge variant={statusVariant(client.status)}>
                {buildClientStatusLabel(client.status, translate)}
              </StatusBadge>
            </header>

            <section className="clients-profile">
              <dl className="clients-profile__details">
                <div><dt>{translate("clientsPhone")}</dt><dd>{client.phone || "—"}</dd></div>
                <div><dt>{translate("clientsEmail")}</dt><dd>{client.email || "—"}</dd></div>
                <div><dt>{translate("clientsLanguage")}</dt><dd>{client.preferredLanguage || "—"}</dd></div>
                <div><dt>{translate("clientsOwner")}</dt><dd>{client.ownerName || translate("followUpsRepresentativeUnassigned")}</dd></div>
                <div><dt>{translate("clientsSource")}</dt><dd>{client.sourceLabel || "—"}</dd></div>
                <div><dt>{translate("clientsPromoted")}</dt><dd>{formatClientTimestamp(client.promotedAt, locale) || "—"}</dd></div>
              </dl>
              {client.notes ? <p className="clients-profile__notes">{client.notes}</p> : null}
              <div className="clients-profile__actions">
                <button type="button" onClick={() => { setForm({ notes: "" }); setDialog({ type: "note" }); }}>
                  {translate("clientsAddNote")}
                </button>
                <button type="button" onClick={() => { setForm({ status: client.status }); setDialog({ type: "status" }); }}>
                  {translate("clientsChangeStatus")}
                </button>
                <button type="button" onClick={() => { setForm({ dueDate: "", dueTime: "", notes: "", title: "" }); setDialog({ type: "create-follow-up" }); }}>
                  {translate("followUpsCreate")}
                </button>
              </div>
            </section>

            {detail.contact ? (
              <section className="clients-section">
                <h2>{translate("clientsLinkedContact")}</h2>
                <p>{detail.contact.name}{detail.contact.phone ? ` · ${detail.contact.phone}` : ""}</p>
              </section>
            ) : null}

            <section className="clients-section">
              <h2>{translate("clientsAppointments")}</h2>
              {(detail.appointments || []).length === 0 ? (
                <p className="clients-page__status">{translate("clientsNoAppointments")}</p>
              ) : (
                <ul className="clients-list">
                  {(detail.appointments || []).map((appointment) => (
                    <li key={appointment.id} className="clients-card">
                      <div>
                        <strong>{formatClientTimestamp(appointment.startDateTime, locale) || appointment.status}</strong>
                        <span>{appointment.status}{appointment.outcome ? ` · ${appointment.outcome}` : ""}</span>
                      </div>
                      <div className="clients-card__actions">
                        <button type="button" onClick={() => navigate(`${appPath("appointments")}?appointmentId=${encodeURIComponent(appointment.id)}`)}>
                          {translate("clientsOpenAppointment")}
                        </button>
                        <button type="button" onClick={() => setDialog({ type: "reschedule-appointment", appointment })}>
                          {translate("followUpsReschedule")}
                        </button>
                        <button type="button" onClick={() => setDialog({ type: "cancel-appointment", appointment })}>
                          {translate("followUpsCancel")}
                        </button>
                        <button type="button" onClick={() => setDialog({ type: "complete-appointment", appointment })}>
                          {translate("agendaRecordOutcome")}
                        </button>
                      </div>
                      {(appointment.history || []).length ? (
                        <ol className="clients-history">
                          {appointment.history.map((event, index) => {
                            const presented = presentClientHistoryEvent(event, translate, locale);
                            return (
                              <li key={`${appointment.id}-h-${index}`}>
                                {presented.atLabel} · {presented.actorLabel} · {presented.summary}
                              </li>
                            );
                          })}
                        </ol>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="clients-section">
              <h2>{translate("productionSectionTitle")}</h2>
              <div className="clients-profile__actions">
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyProductionForm());
                    setDialog({ type: "create" });
                  }}
                >
                  {translate("productionAdd")}
                </button>
              </div>
              {(production?.items || []).length === 0 ? (
                <p className="clients-page__status">{translate("productionEmptyClient")}</p>
              ) : (
                <ul className="clients-list">
                  {(production?.items || []).map((item) => (
                    <ProductionRecordCard
                      key={item.id}
                      item={item}
                      translate={translate}
                      locale={locale}
                      showClient={false}
                      onEdit={(record) => {
                        setForm(
                          emptyProductionForm({
                            activityType: record.activityType,
                            carrier: record.carrier || "",
                            productType: record.productType || "",
                            amount: record.amount == null ? "" : String(record.amount),
                            notes: record.notes || ""
                          })
                        );
                        setDialog({ type: "edit", item: record });
                      }}
                      onStatus={(record) => {
                        setForm(emptyProductionForm({ status: record.status }));
                        setDialog({ type: "production-status", item: record });
                      }}
                      onFollowUp={(record) => {
                        setForm(emptyProductionForm());
                        setDialog({ type: "production-follow-up", item: record });
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="clients-section">
              <h2>{translate("documentsSectionTitle")}</h2>
              <div className="clients-profile__actions">
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyDocumentRequestForm());
                    setDialog({ type: "request-create" });
                  }}
                >
                  {translate("documentsRequestAdd")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyDocumentUploadForm());
                    setDialog({ type: "document-upload" });
                  }}
                >
                  {translate("documentsUpload")}
                </button>
              </div>
              {(documentRequests?.items || []).length === 0 && (documents?.items || []).length === 0 ? (
                <p className="clients-page__status">{translate("documentsEmptyClient")}</p>
              ) : (
                <>
                  {(documentRequests?.items || []).length ? (
                    <ul className="clients-list">
                      {(documentRequests?.items || []).map((item) => (
                        <DocumentRequestCard
                          key={item.id}
                          item={item}
                          translate={translate}
                          locale={locale}
                          onStatus={(record) => {
                            setForm(emptyDocumentRequestForm({ status: record.status }));
                            setDialog({ type: "request-status", item: record });
                          }}
                          onFollowUp={(record) => {
                            setForm(emptyDocumentRequestForm({ title: record.title }));
                            setDialog({ type: "request-follow-up", item: record });
                          }}
                          onUpload={(record) => {
                            setForm(
                              emptyDocumentUploadForm({
                                requestId: record.id,
                                documentType: record.documentType,
                                serviceCaseId: record.serviceCaseId || ""
                              })
                            );
                            setDialog({ type: "document-upload", item: record });
                          }}
                        />
                      ))}
                    </ul>
                  ) : null}
                  {(documents?.items || []).length ? (
                    <ul className="clients-list">
                      {(documents?.items || []).map((item) => (
                        <DocumentCard
                          key={item.id}
                          item={item}
                          translate={translate}
                          locale={locale}
                          openRequests={(documentRequests?.items || []).filter((request) => request.status === "OPEN")}
                          onStatus={(record) => {
                            setForm(emptyDocumentUploadForm({ status: record.status }));
                            setDialog({ type: "document-status", item: record });
                          }}
                          onDownload={async (record) => {
                            try {
                              const blob = await downloadDocument(record.id);
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = record.originalFilename || "document";
                              link.click();
                              URL.revokeObjectURL(url);
                            } catch (err) {
                              setError(err.message);
                            }
                          }}
                          onLink={(record) => {
                            setForm(emptyDocumentUploadForm());
                            setDialog({ type: "document-link", item: record });
                          }}
                        />
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </section>

            <section className="clients-section">
              <h2>{translate("serviceSectionTitle")}</h2>
              <div className="clients-profile__actions">
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyServiceForm());
                    setDialog({ type: "service-create" });
                  }}
                >
                  {translate("serviceAdd")}
                </button>
              </div>
              {(service?.items || []).length === 0 ? (
                <p className="clients-page__status">{translate("serviceEmptyClient")}</p>
              ) : (
                <ul className="clients-list">
                  {(service?.items || []).map((item) => (
                    <ServiceCaseCard
                      key={item.id}
                      item={item}
                      translate={translate}
                      locale={locale}
                      showClient={false}
                      linkedRequests={(documentRequests?.items || []).filter((request) => request.serviceCaseId === item.id)}
                      linkedDocuments={(documents?.items || []).filter((doc) => doc.serviceCaseId === item.id)}
                      onEdit={(record) => {
                        setForm(
                          emptyServiceForm({
                            serviceType: record.serviceType,
                            title: record.title || "",
                            notes: record.notes || "",
                            dueDate: record.dueDate || "",
                            scheduledAppointmentId: record.scheduledAppointmentId || ""
                          })
                        );
                        setDialog({ type: "service-edit", item: record });
                      }}
                      onStatus={(record) => {
                        setForm(emptyServiceForm({ status: record.status }));
                        setDialog({ type: "service-status", item: record });
                      }}
                      onFollowUp={(record) => {
                        setForm(emptyServiceForm({ title: record.title }));
                        setDialog({ type: "service-follow-up", item: record });
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="clients-section">
              <h2>{translate("policyReviewSectionTitle")}</h2>
              <div className="clients-profile__actions">
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPolicyReviewForm());
                    setDialog({ type: "policy-review-create" });
                  }}
                >
                  {translate("policyReviewAdd")}
                </button>
                <button type="button" onClick={() => navigate(appPath(`policy-reviews?clientId=${clientId}`))}>
                  {translate("policyReviewTitle")}
                </button>
              </div>
              {(policyReviews?.items || []).length === 0 ? (
                <p className="clients-page__status">{translate("policyReviewEmptyClient")}</p>
              ) : (
                <ul className="clients-list">
                  {(policyReviews?.items || []).map((item) => (
                    <li key={item.id} className="clients-card">
                      <div>
                        <strong>{buildPolicyReviewStageLabel(item.stage, translate)}</strong>
                        <span>
                          {[item.source, item.campaign, item.language, item.state].filter(Boolean).join(" · ") ||
                            translate("policyReviewNoAttribution")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="clients-section">
              <h2>{translate("clientsFollowUps")}</h2>
              {(detail.followUps || []).length === 0 ? (
                <p className="clients-page__status">{translate("clientsNoFollowUps")}</p>
              ) : (
                <ul className="clients-list">
                  {(detail.followUps || []).map((item) => (
                    <li key={item.id} className="clients-card">
                      <div>
                        <strong>{item.title || translate("followUpsTitle")}</strong>
                        <span>
                          {buildFollowUpStatusLabel(item, translate)} ·{" "}
                          {buildFollowUpDueDate(item.dueDate || item.followUpDate, item.dueTime || item.followUpTime, locale) ||
                            translate("followUpsStatusNeedsDate")}
                        </span>
                      </div>
                      {item.status !== "completed" ? (
                        <div className="clients-card__actions">
                          <button type="button" onClick={() => { setForm({ notes: "" }); setDialog({ type: "complete-follow-up", item }); }}>
                            {translate("followUpsComplete")}
                          </button>
                          <button type="button" onClick={() => { setForm({ dueDate: item.dueDate || "", dueTime: item.dueTime || "" }); setDialog({ type: "reschedule-follow-up", item }); }}>
                            {translate("followUpsReschedule")}
                          </button>
                          <button type="button" onClick={() => { setForm({ notes: "" }); setDialog({ type: "cancel-follow-up", item }); }}>
                            {translate("followUpsCancel")}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="clients-section">
              <h2>{translate("clientsHistory")}</h2>
              <p className="clients-page__hint">{translate("clientsNotesHint")}</p>
              <ol className="clients-history">
                {(client.history || []).map((event, index) => {
                  const presented = presentClientHistoryEvent(event, translate, locale);
                  return (
                    <li key={`client-h-${index}`}>
                      {presented.atLabel} · {presented.actorLabel} · {presented.summary}
                      {event.body ? ` — ${event.body}` : ""}
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        ) : null}

        {dialog?.type === "note" ? (
          <ClientDialog title={translate("clientsAddNote")} confirmLabel={translate("followUpsSave")} cancelLabel={translate("followUpsDialogClose")} loading={saving} onClose={() => setDialog(null)} onConfirm={submitDialog}>
            <label>
              {translate("followUpsNote")}
              <textarea rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </ClientDialog>
        ) : null}
        {dialog?.type === "status" ? (
          <ClientDialog title={translate("clientsChangeStatus")} confirmLabel={translate("followUpsSave")} cancelLabel={translate("followUpsDialogClose")} loading={saving} onClose={() => setDialog(null)} onConfirm={submitDialog}>
            <label>
              {translate("clientsStatus")}
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="ACTIVE">{translate("clientsStatusActive")}</option>
                <option value="FOLLOW_UP">{translate("clientsStatusFollowUp")}</option>
                <option value="INACTIVE">{translate("clientsStatusInactive")}</option>
              </select>
            </label>
          </ClientDialog>
        ) : null}
        {dialog?.type === "create-follow-up" ? (
          <ClientDialog title={translate("followUpsCreate")} confirmLabel={translate("followUpsSave")} cancelLabel={translate("followUpsDialogClose")} loading={saving} onClose={() => setDialog(null)} onConfirm={submitDialog}>
            <label>
              {translate("followUpsDate")}
              <input type="date" required value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
            </label>
            <label>
              {translate("followUpsTimeOptional")}
              <input type="time" value={form.dueTime} onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))} />
            </label>
            <label>
              {translate("followUpsNote")}
              <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </ClientDialog>
        ) : null}
        {dialog?.type === "complete-follow-up" || dialog?.type === "cancel-follow-up" ? (
          <ClientDialog title={dialog.type === "complete-follow-up" ? translate("followUpsComplete") : translate("followUpsCancel")} confirmLabel={translate("followUpsSave")} cancelLabel={translate("followUpsDialogClose")} loading={saving} onClose={() => setDialog(null)} onConfirm={submitDialog}>
            <label>
              {translate("followUpsNote")}
              <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </ClientDialog>
        ) : null}
        {dialog?.type === "reschedule-follow-up" ? (
          <ClientDialog title={translate("followUpsReschedule")} confirmLabel={translate("followUpsSave")} cancelLabel={translate("followUpsDialogClose")} loading={saving} onClose={() => setDialog(null)} onConfirm={submitDialog}>
            <label>
              {translate("followUpsDate")}
              <input type="date" required value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
            </label>
            <label>
              {translate("followUpsTimeOptional")}
              <input type="time" value={form.dueTime} onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))} />
            </label>
          </ClientDialog>
        ) : null}

        {dialog?.type === "policy-review-create" ? (
          <ClientDialog
            title={translate("policyReviewAdd")}
            confirmLabel={translate("followUpsSave")}
            cancelLabel={translate("followUpsDialogClose")}
            loading={saving}
            onClose={() => setDialog(null)}
            onConfirm={submitDialog}
          >
            <label>
              {translate("policyReviewSource")}
              <input value={form.source || ""} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} />
            </label>
            <label>
              {translate("policyReviewCampaign")}
              <input value={form.campaign || ""} onChange={(event) => setForm((current) => ({ ...current, campaign: event.target.value }))} />
            </label>
            <label>
              {translate("policyReviewLanguage")}
              <input value={form.language || ""} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} />
            </label>
            <label>
              {translate("policyReviewState")}
              <input value={form.state || ""} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} />
            </label>
          </ClientDialog>
        ) : null}

        <ServiceDialogs
          dialog={
            dialog?.type === "service-status"
              ? { ...dialog, type: "status" }
              : dialog?.type === "service-follow-up"
                ? { ...dialog, type: "follow-up" }
                : dialog?.type === "service-create"
                  ? { ...dialog, type: "create" }
                  : dialog?.type === "service-edit"
                    ? { ...dialog, type: "edit" }
                    : null
          }
          form={form}
          setForm={setForm}
          translate={translate}
          saving={saving}
          appointments={detail?.appointments || []}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        />

        <DocumentDialogs
          dialog={
            ["request-create", "request-status", "request-follow-up", "document-upload", "document-status", "document-link"].includes(
              dialog?.type
            )
              ? dialog
              : null
          }
          form={form}
          setForm={setForm}
          translate={translate}
          saving={saving}
          serviceCases={service?.items || []}
          openRequests={(documentRequests?.items || []).filter((item) => item.status === "OPEN")}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        />

        <ProductionDialogs
          dialog={
            dialog?.type === "production-status"
              ? { ...dialog, type: "status" }
              : dialog?.type === "production-follow-up"
                ? { ...dialog, type: "follow-up" }
                : dialog?.type === "create" || dialog?.type === "edit"
                  ? dialog
                  : null
          }
          form={form}
          setForm={setForm}
          translate={translate}
          saving={saving}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        />

        <RescheduleAppointmentDialog
          open={dialog?.type === "reschedule-appointment"}
          appointment={dialog?.appointment}
          onClose={() => setDialog(null)}
          onSuccess={() => { setDialog(null); refresh(); }}
        />
        <CancelAppointmentDialog
          open={dialog?.type === "cancel-appointment"}
          appointment={dialog?.appointment}
          onClose={() => setDialog(null)}
          onSuccess={() => { setDialog(null); refresh(); }}
        />
        <CompleteAppointmentDialog
          open={dialog?.type === "complete-appointment"}
          appointment={dialog?.appointment}
          onClose={() => setDialog(null)}
          onSuccess={() => { setDialog(null); refresh(); }}
        />
      </div>
    );
  }

  return (
    <div className="clients-page">
      <header className="clients-page__header">
        <div>
          <h1 className="clients-page__title">{translate("clientsTitle")}</h1>
          <p className="clients-page__subtitle">{translate("clientsSubtitle")}</p>
        </div>
      </header>

      <div className="clients-page__scope" role="tablist" aria-label={translate("clientsScopeLabel")}>
        <button type="button" className={`clients-page__filter${activeScope === "mine" ? " is-active" : ""}`} onClick={() => patchScope("mine")}>
          {translate("clientsScopeMine")}
        </button>
        {payload?.teamAvailable ? (
          <button type="button" className={`clients-page__filter${activeScope === "team" ? " is-active" : ""}`} onClick={() => patchScope("team")}>
            {translate("clientsScopeTeam")}
          </button>
        ) : null}
      </div>

      <label className="clients-page__search-label" htmlFor="clients-search">
        {translate("clientsSearchLabel")}
        <input
          id="clients-search"
          type="search"
          className="clients-page__search"
          value={searchInput}
          placeholder={translate("clientsSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </label>

      {error ? <p className="clients-page__error">{error}</p> : null}
      {loading ? <p className="clients-page__status">{translate("clientsLoading")}</p> : null}
      {!loading && !payload?.items?.length ? <p className="clients-page__status">{translate("clientsEmpty")}</p> : null}

      {!loading && payload?.items?.length ? (
        <div className="clients-list">
          {payload.items.map((item) => (
            <article key={item.id} className="clients-card">
              <button type="button" className="clients-card__main" onClick={() => navigate(appPath(`clients/${item.id}`))}>
                <div className="clients-card__header">
                  <h2>{item.name}</h2>
                  <StatusBadge variant={statusVariant(item.status)}>
                    {buildClientStatusLabel(item.status, translate)}
                  </StatusBadge>
                </div>
                <dl className="clients-card__details">
                  <div><dt>{translate("clientsPhone")}</dt><dd>{item.phone || "—"}</dd></div>
                  <div><dt>{translate("clientsEmail")}</dt><dd>{item.email || "—"}</dd></div>
                  <div><dt>{translate("clientsLanguage")}</dt><dd>{item.preferredLanguage || "—"}</dd></div>
                  <div><dt>{translate("clientsOwner")}</dt><dd>{item.ownerName || translate("followUpsRepresentativeUnassigned")}</dd></div>
                  <div><dt>{translate("clientsSource")}</dt><dd>{item.sourceLabel || "—"}</dd></div>
                  <div>
                    <dt>{translate("clientsNextAppointment")}</dt>
                    <dd>{formatClientTimestamp(item.nextAppointment?.startDateTime || item.latestAppointment?.startDateTime, locale) || "—"}</dd>
                  </div>
                  <div>
                    <dt>{translate("clientsNextFollowUp")}</dt>
                    <dd>
                      {buildFollowUpDueDate(
                        item.nextFollowUp?.dueDate || item.nextFollowUp?.followUpDate,
                        item.nextFollowUp?.dueTime || item.nextFollowUp?.followUpTime,
                        locale
                      ) || "—"}
                    </dd>
                  </div>
                </dl>
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
