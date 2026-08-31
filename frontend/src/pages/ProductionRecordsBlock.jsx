/**
 * BR-181 — Shared production records UI for My Production and Client Workspace.
 */

import StatusBadge from "../components/ui/StatusBadge";
import {
  PRODUCTION_ACTIVITY_TYPES,
  PRODUCTION_STATUSES,
  buildProductionStatusLabel,
  buildProductionTypeLabel,
  emptyProductionForm,
  formatProductionAmount,
  formatProductionTimestamp,
  presentProductionHistoryEvent,
  productionStatusVariant
} from "../engines/productionViewModel";

function ProductionDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
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

export function ProductionRecordCard({
  item,
  translate,
  locale,
  showClient = true,
  onEdit,
  onStatus,
  onFollowUp,
  onOpenClient
}) {
  const amountLabel = formatProductionAmount(item.amount, locale, item.currency || "USD");
  return (
    <li className="clients-card">
      <div>
        <strong>
          {showClient ? item.clientName || translate("productionUnknownClient") : buildProductionTypeLabel(item.activityType, translate)}
        </strong>
        <span>
          {buildProductionTypeLabel(item.activityType, translate)}
          {item.carrier ? ` · ${item.carrier}` : ""}
          {item.productType ? ` · ${item.productType}` : ""}
        </span>
      </div>
      <StatusBadge variant={productionStatusVariant(item.status)}>
        {buildProductionStatusLabel(item.status, translate)}
      </StatusBadge>
      <dl className="clients-card__details">
        {amountLabel ? (
          <div>
            <dt>{translate("productionAmount")}</dt>
            <dd>{amountLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt>{translate("productionSubmitted")}</dt>
          <dd>{formatProductionTimestamp(item.submittedAt, locale) || "—"}</dd>
        </div>
        <div>
          <dt>{translate("productionIssued")}</dt>
          <dd>{formatProductionTimestamp(item.issuedAt, locale) || "—"}</dd>
        </div>
        <div>
          <dt>{translate("productionPaid")}</dt>
          <dd>{formatProductionTimestamp(item.paidAt, locale) || "—"}</dd>
        </div>
        <div>
          <dt>{translate("productionOwner")}</dt>
          <dd>{item.ownerName || translate("followUpsRepresentativeUnassigned")}</dd>
        </div>
        <div>
          <dt>{translate("productionUpdated")}</dt>
          <dd>{formatProductionTimestamp(item.updatedAt, locale) || "—"}</dd>
        </div>
      </dl>
      <div className="clients-card__actions">
        {onOpenClient ? (
          <button type="button" onClick={() => onOpenClient(item)}>
            {translate("productionOpenClient")}
          </button>
        ) : null}
        <button type="button" onClick={() => onEdit(item)}>
          {translate("productionEdit")}
        </button>
        <button type="button" onClick={() => onStatus(item)}>
          {translate("productionChangeStatus")}
        </button>
        <button type="button" onClick={() => onFollowUp(item)}>
          {translate("followUpsCreate")}
        </button>
      </div>
      {(item.history || []).length ? (
        <ol className="clients-history">
          {item.history.map((event, index) => {
            const presented = presentProductionHistoryEvent(event, translate, locale);
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

export function ProductionActivityFields({ form, setForm, translate, clients = [], showClient = false }) {
  return (
    <>
      {showClient ? (
        <label>
          {translate("productionClient")}
          <select
            value={form.clientId}
            onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
          >
            <option value="">{translate("productionSelectClient")}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        {translate("productionType")}
        <select
          value={form.activityType}
          onChange={(event) => setForm((current) => ({ ...current, activityType: event.target.value }))}
        >
          {Object.values(PRODUCTION_ACTIVITY_TYPES).map((type) => (
            <option key={type} value={type}>
              {buildProductionTypeLabel(type, translate)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {translate("productionCarrier")}
        <input value={form.carrier} onChange={(event) => setForm((current) => ({ ...current, carrier: event.target.value }))} />
      </label>
      <label>
        {translate("productionProduct")}
        <input value={form.productType} onChange={(event) => setForm((current) => ({ ...current, productType: event.target.value }))} />
      </label>
      <label>
        {translate("productionAmount")}
        <input
          type="number"
          inputMode="decimal"
          value={form.amount}
          placeholder={translate("productionAmountOptional")}
          onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
        />
      </label>
      <label>
        {translate("followUpsNote")}
        <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
      </label>
    </>
  );
}

export function ProductionDialogs({
  dialog,
  form,
  setForm,
  translate,
  saving,
  onClose,
  onConfirm,
  clients = [],
  showClientOnCreate = false
}) {
  if (!dialog) return null;
  if (dialog.type === "create" || dialog.type === "edit") {
    return (
      <ProductionDialog
        title={dialog.type === "create" ? translate("productionAdd") : translate("productionEdit")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <ProductionActivityFields
          form={form}
          setForm={setForm}
          translate={translate}
          clients={clients}
          showClient={dialog.type === "create" && showClientOnCreate}
        />
      </ProductionDialog>
    );
  }
  if (dialog.type === "status") {
    return (
      <ProductionDialog
        title={translate("productionChangeStatus")}
        confirmLabel={translate("followUpsSave")}
        cancelLabel={translate("followUpsDialogClose")}
        loading={saving}
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <label>
          {translate("productionStatus")}
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {Object.values(PRODUCTION_STATUSES).map((status) => (
              <option key={status} value={status}>
                {buildProductionStatusLabel(status, translate)}
              </option>
            ))}
          </select>
        </label>
      </ProductionDialog>
    );
  }
  if (dialog.type === "follow-up") {
    return (
      <ProductionDialog
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
      </ProductionDialog>
    );
  }
  return null;
}

export { emptyProductionForm, ProductionDialog };
