/**
 * BR-182 — Shared service-case UI for My Service and Client Workspace.
 */

import StatusBadge from "../components/ui/StatusBadge";
import {
  SERVICE_STATUSES,
  SERVICE_TYPES,
  buildServiceDueLabel,
  buildServiceStatusLabel,
  buildServiceTypeLabel,
  emptyServiceForm,
  formatServiceDate,
  presentServiceHistoryEvent,
  serviceStatusVariant
} from "../engines/serviceViewModel";

function ServiceDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
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

export function ServiceCaseCard({
  item,
  translate,
  locale,
  showClient = true,
  linkedRequests = [],
  linkedDocuments = [],
  onEdit,
  onStatus,
  onFollowUp,
  onOpenClient
}) {
  return (
    <li className="clients-card">
      <div>
        <strong>{showClient ? item.clientName || item.title : item.title}</strong>
        <span>
          {buildServiceTypeLabel(item.serviceType, translate)}
          {item.dueDate ? ` · ${formatServiceDate(item.dueDate, locale)}` : ` · ${translate("serviceDueNeedsDate")}`}
        </span>
      </div>
      <StatusBadge variant={serviceStatusVariant(item.status, item.dueStatus)}>
        {buildServiceStatusLabel(item.status, translate)}
        {item.dueStatus && item.dueStatus !== "closed" ? ` · ${buildServiceDueLabel(item.dueStatus, translate)}` : ""}
      </StatusBadge>
      <dl className="clients-card__details">
        <div>
          <dt>{translate("serviceOwner")}</dt>
          <dd>{item.ownerName || translate("followUpsRepresentativeUnassigned")}</dd>
        </div>
        <div>
          <dt>{translate("serviceUpdated")}</dt>
          <dd>{formatServiceDate(item.updatedAt, locale) || "—"}</dd>
        </div>
        {item.scheduledAppointmentId ? (
          <div>
            <dt>{translate("serviceAppointment")}</dt>
            <dd>{translate("serviceAppointmentLinked")}</dd>
          </div>
        ) : null}
        {linkedRequests.length || linkedDocuments.length ? (
          <div>
            <dt>{translate("documentsSectionTitle")}</dt>
            <dd>
              {linkedRequests.filter((request) => request.status === "OPEN").length
                ? `${linkedRequests.filter((request) => request.status === "OPEN").length} ${translate("documentsOpenRequests")}`
                : translate("documentsLinked")}
              {linkedDocuments.length ? ` · ${linkedDocuments.length} ${translate("documentsReceivedCount")}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="clients-card__actions">
        {onOpenClient ? (
          <button type="button" onClick={() => onOpenClient(item)}>
            {translate("serviceOpenClient")}
          </button>
        ) : null}
        <button type="button" onClick={() => onEdit(item)}>
          {translate("serviceEdit")}
        </button>
        <button type="button" onClick={() => onStatus(item)}>
          {translate("serviceChangeStatus")}
        </button>
        <button type="button" onClick={() => onFollowUp(item)}>
          {translate("followUpsCreate")}
        </button>
      </div>
      {(item.history || []).length ? (
        <ol className="clients-history">
          {item.history.map((event, index) => {
            const presented = presentServiceHistoryEvent(event, translate, locale);
            return (
              <li key={`${item.id}-h-${index}`}>
                {presented.atLabel} · {presented.actorLabel} · {presented.summary}
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

export function ServiceDialogs({
  dialog,
  form,
  setForm,
  translate,
  saving,
  onClose,
  onConfirm,
  clients = [],
  appointments = [],
  showClientOnCreate = false
}) {
  if (!dialog) return null;
  if (dialog.type === "create" || dialog.type === "edit") {
    return (
      <ServiceDialog
        title={dialog.type === "create" ? translate("serviceAdd") : translate("serviceEdit")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        {dialog.type === "create" && showClientOnCreate ? (
          <label>
            {translate("serviceClient")}
            <select value={form.clientId} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}>
              <option value="">{translate("serviceSelectClient")}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {translate("serviceType")}
          <select value={form.serviceType} onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value }))}>
            {Object.values(SERVICE_TYPES).map((type) => (
              <option key={type} value={type}>
                {buildServiceTypeLabel(type, translate)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("serviceCaseTitle")}
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <label>
          {translate("serviceDueDate")}
          <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
        </label>
        {appointments.length ? (
          <label>
            {translate("serviceAppointment")}
            <select
              value={form.scheduledAppointmentId}
              onChange={(event) => setForm((current) => ({ ...current, scheduledAppointmentId: event.target.value }))}
            >
              <option value="">{translate("serviceNoAppointment")}</option>
              {appointments.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  {appointment.startDateTime || appointment.id}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {translate("followUpsNote")}
          <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
      </ServiceDialog>
    );
  }
  if (dialog.type === "status") {
    return (
      <ServiceDialog
        title={translate("serviceChangeStatus")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("serviceStatus")}
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {Object.values(SERVICE_STATUSES).map((status) => (
              <option key={status} value={status}>
                {buildServiceStatusLabel(status, translate)}
              </option>
            ))}
          </select>
        </label>
      </ServiceDialog>
    );
  }
  if (dialog.type === "follow-up") {
    return (
      <ServiceDialog
        title={translate("followUpsCreate")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("followUpsDate")}
          <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
        </label>
        <label>
          {translate("followUpsTimeOptional")}
          <input type="time" value={form.dueTime} onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))} />
        </label>
        <label>
          {translate("followUpsNote")}
          <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
      </ServiceDialog>
    );
  }
  return null;
}

export { emptyServiceForm };
