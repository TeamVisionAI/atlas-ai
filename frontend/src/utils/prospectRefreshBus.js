export function notifyProspectProfileUpdated(phone) {
  if (typeof window === "undefined" || !phone) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("atlas:prospect-profile-updated", {
      detail: { phone }
    })
  );
}

export function subscribeProspectProfileUpdated(handler) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function onUpdated(event) {
    handler(event.detail?.phone || null);
  }

  window.addEventListener("atlas:prospect-profile-updated", onUpdated);
  return () => window.removeEventListener("atlas:prospect-profile-updated", onUpdated);
}
