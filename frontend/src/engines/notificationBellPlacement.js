/**
 * BR-176 — viewport placement for the notification popover (portal to body).
 * Opens to the right of the bell when space allows; otherwise clamps inside the viewport.
 */

export const NOTIFICATION_PANEL_MIN_WIDTH = 360;
export const NOTIFICATION_PANEL_MAX_WIDTH = 420;

export function resolveNotificationPanelPlacement({
  triggerRect,
  viewportWidth,
  viewportHeight,
  panelHeight = 360,
  gap = 8,
  padding = 8
} = {}) {
  const vw = Number(viewportWidth) || 0;
  const vh = Number(viewportHeight) || 0;
  const usableWidth = Math.max(0, vw - padding * 2);
  const width = Math.min(NOTIFICATION_PANEL_MAX_WIDTH, usableWidth);
  const maxHeight = Math.min(520, Math.max(160, vh - padding * 2));
  const height = Math.min(Number(panelHeight) || maxHeight, maxHeight);

  const rect = triggerRect || { top: 0, right: 0, left: 0, bottom: 0 };
  let left = Number(rect.right) + gap;
  if (left + width > vw - padding) {
    left = Number(rect.left) - gap - width;
  }
  if (left < padding) {
    left = padding;
  }
  if (left + width > vw - padding) {
    left = Math.max(padding, vw - padding - width);
  }

  let top = Number(rect.top);
  if (top + height > vh - padding) {
    top = vh - padding - height;
  }
  if (top < padding) {
    top = padding;
  }

  return {
    left,
    top,
    width,
    maxHeight
  };
}
