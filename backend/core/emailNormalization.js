/**
 * Sprint 22 — Prospect email normalization and validation.
 */

const { EMAIL_STATUSES } = require("./configuration/appointmentDomain");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMMON_DOMAIN_TYPOS = Object.freeze({
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "hotmail.con": "hotmail.com",
  "yahoo.con": "yahoo.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com"
});

function normalizeEmail(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = String(raw).trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  const atIndex = trimmed.lastIndexOf("@");

  if (atIndex <= 0) {
    return trimmed;
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const correctedDomain = COMMON_DOMAIN_TYPOS[domain] || domain;

  return `${local}@${correctedDomain}`;
}

function validateEmailFormat(email) {
  if (!email) {
    return false;
  }

  return EMAIL_PATTERN.test(email);
}

function detectDomainTypo(email) {
  if (!email || !email.includes("@")) {
    return null;
  }

  const domain = email.split("@")[1];
  const suggestion = COMMON_DOMAIN_TYPOS[domain];

  if (suggestion && suggestion !== domain) {
    const local = email.split("@")[0];
    return `${local}@${suggestion}`;
  }

  return null;
}

function resolveEmailStatus(email, options = {}) {
  if (!email) {
    return EMAIL_STATUSES.MISSING;
  }

  if (!validateEmailFormat(email)) {
    return EMAIL_STATUSES.INVALID;
  }

  if (options.verified) {
    return EMAIL_STATUSES.VERIFIED;
  }

  return EMAIL_STATUSES.UNVERIFIED;
}

function formatEmailForProspectNotes(email) {
  if (!email) {
    return null;
  }

  return `EMAIL:${email}`;
}

function extractEmailFromProspectNotes(notes) {
  if (!notes) {
    return null;
  }

  const stored = String(notes).match(/EMAIL:([^|]+)/i);

  if (stored) {
    return stored[1].trim();
  }

  return null;
}

module.exports = {
  normalizeEmail,
  validateEmailFormat,
  detectDomainTypo,
  resolveEmailStatus,
  formatEmailForProspectNotes,
  extractEmailFromProspectNotes,
  EMAIL_PATTERN
};
