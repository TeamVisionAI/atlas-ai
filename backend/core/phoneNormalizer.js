/**
 * Sprint 10.1 — Phone normalization for Quick Capture deduplication.
 * US-default: strips non-digits, prepends country code 1 for 10-digit numbers.
 */

function normalizePhoneNumber(rawPhone, defaultCountryCode = "1") {
  if (!rawPhone) {
    return null;
  }

  const digits = String(rawPhone).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits;
  }

  return digits;
}

function formatPhoneForStorage(normalizedPhone) {
  if (!normalizedPhone) {
    return null;
  }

  return `+${normalizedPhone}`;
}

module.exports = {
  normalizePhoneNumber,
  formatPhoneForStorage
};
