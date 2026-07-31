export function extractOutboundPayload(result) {
  return result?.outboundPayload || null;
}

export function previewMessageMatchesSendPayload(previewPayload, sendPayload) {
  if (!previewPayload || !sendPayload) {
    return false;
  }

  return (
    previewPayload.message === sendPayload.message &&
    previewPayload.template === sendPayload.template &&
    previewPayload.language === sendPayload.language &&
    previewPayload.phone === sendPayload.phone
  );
}
