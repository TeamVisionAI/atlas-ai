/**
 * Appointments UI — friendly error copy; technical details stay in console only.
 */

export function logAppointmentError(scope, error, meta = {}) {
  console.error(`[Appointments:${scope}]`, {
    message: error?.message,
    stack: error?.stack,
    ...meta
  });
}

export function parseHttpStatus(error) {
  if (typeof error?.status === "number" && Number.isFinite(error.status)) {
    return error.status;
  }

  const message = error?.message;
  if (!message) {
    return null;
  }

  const match = String(message).match(/^API (\d{3}):/);
  return match ? Number(match[1]) : null;
}

export function isNetworkError(error) {
  if (!error) {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = String(error.message || "").toLowerCase();
  return message.includes("failed to fetch") || message.includes("network");
}

export function getAppointmentErrorBodyKey(error) {
  const status = parseHttpStatus(error);

  if (isNetworkError(error)) {
    return "appointmentsErrorBody_network";
  }

  if (status === 401 || status === 403) {
    return "appointmentsErrorBody_unauthorized";
  }

  if (status === 404) {
    return "appointmentsErrorBody_notFound";
  }

  if (status === 409) {
    return "appointmentsErrorBody_conflict";
  }

  if (status && status >= 500) {
    return "appointmentsErrorBody_server";
  }

  return "appointmentsErrorBody_generic";
}

export function getAppointmentErrorCopy(error, translate, scope = "load") {
  const titleKey = `appointmentsErrorTitle_${scope}`;
  const bodyKey = getAppointmentErrorBodyKey(error);

  const title = translate(titleKey);
  const body = translate(bodyKey);

  return {
    title: title === titleKey ? translate("appointmentsErrorTitle") : title,
    body: body === bodyKey ? translate("appointmentsErrorBody_generic") : body
  };
}

export function captureAppointmentError(scope, error, translate, meta) {
  logAppointmentError(scope, error, meta);
  return getAppointmentErrorCopy(error, translate, scope);
}
