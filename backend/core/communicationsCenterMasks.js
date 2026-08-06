function maskPhoneLast4(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length < 4) {
    return "***";
  }

  return `***${digits.slice(-4)}`;
}

function maskProviderMessageId(value) {
  if (!value) {
    return null;
  }

  const text = String(value);

  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`;
  }

  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

module.exports = {
  maskPhoneLast4,
  maskProviderMessageId
};
