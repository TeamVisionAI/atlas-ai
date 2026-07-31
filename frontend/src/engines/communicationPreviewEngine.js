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

export function partitionValidationItems(missingContent = []) {
  const items = Array.isArray(missingContent) ? missingContent : [];

  return {
    required: items.filter((item) => item.severity === "error"),
    recommended: items.filter((item) => item.severity === "recommended")
  };
}

export function hasRequiredValidationErrors(missingContent = []) {
  return partitionValidationItems(missingContent).required.length > 0;
}

export function resolveDeliveryChannelLabel(channel, translate) {
  if (channel === "whatsapp") {
    return translate("communicationPreviewDeliveryWhatsApp");
  }

  return translate("communicationPreviewDeliveryWhatsApp");
}
