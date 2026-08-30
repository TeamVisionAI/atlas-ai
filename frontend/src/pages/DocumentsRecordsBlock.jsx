/**
 * BR-183 — Shared document and request UI for Client Workspace.
 */

import StatusBadge from "../components/ui/StatusBadge";
import {
  DOCUMENT_REQUEST_STATUSES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  buildDocumentDueLabel,
  buildDocumentRequestStatusLabel,
  buildDocumentStatusLabel,
  buildDocumentTypeLabel,
  documentStatusVariant,
  emptyDocumentRequestForm,
  emptyDocumentUploadForm,
  formatDocumentDate,
  presentDocumentHistoryEvent,
  requestStatusVariant
} from "../engines/documentsViewModel";

function DocumentDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
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

export function DocumentRequestCard({ item, translate, locale, onStatus, onFollowUp, onUpload }) {
  return (
    <li className="clients-card">
      <div>
        <strong>{item.title}</strong>
        <span>
          {buildDocumentTypeLabel(item.documentType, translate)}
          {item.dueDate ? ` · ${formatDocumentDate(item.dueDate, locale)}` : ` · ${translate("serviceDueNeedsDate")}`}
        </span>
      </div>
      <StatusBadge variant={requestStatusVariant(item.status, item.dueStatus)}>
        {buildDocumentRequestStatusLabel(item.status, translate)}
        {item.dueStatus && item.dueStatus !== "closed" ? ` · ${buildDocumentDueLabel(item.dueStatus, translate)}` : ""}
      </StatusBadge>
      <dl className="clients-card__details">
        <div>
          <dt>{translate("documentsOwner")}</dt>
          <dd>{item.ownerName || translate("followUpsRepresentativeUnassigned")}</dd>
        </div>
        <div>
          <dt>{translate("documentsRequested")}</dt>
          <dd>{formatDocumentDate(item.requestedAt, locale) || "—"}</dd>
        </div>
        {item.serviceCaseId ? (
          <div>
            <dt>{translate("documentsLinkedService")}</dt>
            <dd>{translate("documentsLinked")}</dd>
          </div>
        ) : null}
      </dl>
      <div className="clients-card__actions">
        {item.status === "OPEN" && onUpload ? (
          <button type="button" onClick={() => onUpload(item)}>
            {translate("documentsUpload")}
          </button>
        ) : null}
        <button type="button" onClick={() => onStatus(item)}>
          {translate("documentsChangeRequestStatus")}
        </button>
        <button type="button" onClick={() => onFollowUp(item)}>
          {translate("followUpsCreate")}
        </button>
      </div>
      {(item.history || []).length ? (
        <ol className="clients-history">
          {item.history.map((event, index) => {
            const presented = presentDocumentHistoryEvent(event, translate, locale);
            return (
              <li key={`${item.id}-rh-${index}`}>
                {presented.atLabel} · {presented.actorLabel} · {presented.summary}
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

export function DocumentCard({ item, translate, locale, openRequests = [], onStatus, onDownload, onLink }) {
  return (
    <li className="clients-card">
      <div>
        <strong>{item.originalFilename}</strong>
        <span>{buildDocumentTypeLabel(item.documentType, translate)}</span>
      </div>
      <StatusBadge variant={documentStatusVariant(item.status)}>
        {buildDocumentStatusLabel(item.status, translate)}
      </StatusBadge>
      <dl className="clients-card__details">
        <div>
          <dt>{translate("documentsOwner")}</dt>
          <dd>{item.ownerName || translate("followUpsRepresentativeUnassigned")}</dd>
        </div>
        <div>
          <dt>{translate("documentsReceived")}</dt>
          <dd>{formatDocumentDate(item.receivedAt, locale) || "—"}</dd>
        </div>
        {item.serviceCaseId ? (
          <div>
            <dt>{translate("documentsLinkedService")}</dt>
            <dd>{translate("documentsLinked")}</dd>
          </div>
        ) : null}
        {item.requestId ? (
          <div>
            <dt>{translate("documentsLinkedRequest")}</dt>
            <dd>{translate("documentsLinked")}</dd>
          </div>
        ) : null}
      </dl>
      <div className="clients-card__actions">
        <button type="button" onClick={() => onDownload(item)}>
          {translate("documentsDownload")}
        </button>
        <button type="button" onClick={() => onStatus(item)}>
          {translate("documentsChangeStatus")}
        </button>
        {!item.requestId && openRequests.length ? (
          <button type="button" onClick={() => onLink(item)}>
            {translate("documentsLinkRequest")}
          </button>
        ) : null}
      </div>
      {(item.history || []).length ? (
        <ol className="clients-history">
          {item.history.map((event, index) => {
            const presented = presentDocumentHistoryEvent(event, translate, locale);
            return (
              <li key={`${item.id}-dh-${index}`}>
                {presented.atLabel} · {presented.actorLabel} · {presented.summary}
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

export function DocumentDialogs({
  dialog,
  form,
  setForm,
  translate,
  saving,
  onClose,
  onConfirm,
  serviceCases = [],
  openRequests = []
}) {
  if (!dialog) return null;
  if (dialog.type === "request-create") {
    return (
      <DocumentDialog
        title={translate("documentsRequestAdd")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("documentsType")}
          <select value={form.documentType} onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}>
            {Object.values(DOCUMENT_TYPES).map((type) => (
              <option key={type} value={type}>
                {buildDocumentTypeLabel(type, translate)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("documentsRequestTitle")}
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <label>
          {translate("serviceDueDate")}
          <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
        </label>
        {serviceCases.length ? (
          <label>
            {translate("documentsLinkedService")}
            <select value={form.serviceCaseId} onChange={(event) => setForm((current) => ({ ...current, serviceCaseId: event.target.value }))}>
              <option value="">{translate("documentsNoService")}</option>
              {serviceCases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {translate("documentsInstructions")}
          <textarea rows={3} value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} />
        </label>
      </DocumentDialog>
    );
  }
  if (dialog.type === "request-status") {
    return (
      <DocumentDialog
        title={translate("documentsChangeRequestStatus")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("documentsRequestStatus")}
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {Object.values(DOCUMENT_REQUEST_STATUSES).map((status) => (
              <option key={status} value={status}>
                {buildDocumentRequestStatusLabel(status, translate)}
              </option>
            ))}
          </select>
        </label>
      </DocumentDialog>
    );
  }
  if (dialog.type === "request-follow-up") {
    return (
      <DocumentDialog
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
      </DocumentDialog>
    );
  }
  if (dialog.type === "document-upload") {
    return (
      <DocumentDialog
        title={translate("documentsUpload")}
        confirmLabel={translate("documentsUpload")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("documentsType")}
          <select value={form.documentType} onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}>
            {Object.values(DOCUMENT_TYPES).map((type) => (
              <option key={type} value={type}>
                {buildDocumentTypeLabel(type, translate)}
              </option>
            ))}
          </select>
        </label>
        {openRequests.length ? (
          <label>
            {translate("documentsLinkRequest")}
            <select value={form.requestId} onChange={(event) => setForm((current) => ({ ...current, requestId: event.target.value }))}>
              <option value="">{translate("documentsNoRequest")}</option>
              {openRequests.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {serviceCases.length ? (
          <label>
            {translate("documentsLinkedService")}
            <select value={form.serviceCaseId} onChange={(event) => setForm((current) => ({ ...current, serviceCaseId: event.target.value }))}>
              <option value="">{translate("documentsNoService")}</option>
              {serviceCases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {translate("documentsFile")}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
          />
        </label>
        <label>
          {translate("followUpsNote")}
          <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
      </DocumentDialog>
    );
  }
  if (dialog.type === "document-status") {
    return (
      <DocumentDialog
        title={translate("documentsChangeStatus")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("documentsStatus")}
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {Object.values(DOCUMENT_STATUSES).map((status) => (
              <option key={status} value={status}>
                {buildDocumentStatusLabel(status, translate)}
              </option>
            ))}
          </select>
        </label>
      </DocumentDialog>
    );
  }
  if (dialog.type === "document-link") {
    return (
      <DocumentDialog
        title={translate("documentsLinkRequest")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("documentsLinkRequest")}
          <select value={form.requestId} onChange={(event) => setForm((current) => ({ ...current, requestId: event.target.value }))}>
            <option value="">{translate("documentsNoRequest")}</option>
            {openRequests.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </DocumentDialog>
    );
  }
  return null;
}

export { emptyDocumentRequestForm, emptyDocumentUploadForm };
