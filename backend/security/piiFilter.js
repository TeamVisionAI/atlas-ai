/**
 * LC1 — PII masking for support and API responses.
 */

const { ROLES } = require("./roles");

function maskPhone(value) {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");

  if (digits.length < 4) {
    return "***";
  }

  return `***-***-${digits.slice(-4)}`;
}

function maskEmail(value) {
  if (!value) {
    return null;
  }

  const [local, domain] = String(value).split("@");

  if (!domain) {
    return "***";
  }

  return `${local.slice(0, 1)}***@${domain}`;
}

function shouldMaskPii(role) {
  return role === ROLES.SUPPORT;
}

function maskProspectRecord(prospect, role) {
  if (!prospect || !shouldMaskPii(role)) {
    return prospect;
  }

  return {
    ...prospect,
    primary_phone: maskPhone(prospect.primary_phone || prospect.phone),
    phone: maskPhone(prospect.phone || prospect.primary_phone),
    email: maskEmail(prospect.email),
    notes: prospect.notes ? "[redacted]" : prospect.notes
  };
}

function sanitizeProspectResponse(prospect, role) {
  return maskProspectRecord(prospect, role);
}

function sanitizeProspectList(items, role) {
  if (!Array.isArray(items)) {
    return items;
  }

  return items.map((item) => sanitizeProspectResponse(item, role));
}

module.exports = {
  maskPhone,
  maskEmail,
  shouldMaskPii,
  maskProspectRecord,
  sanitizeProspectResponse,
  sanitizeProspectList
};
