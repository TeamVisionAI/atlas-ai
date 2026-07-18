/**
 * Sprint 10.2b — Cursor encode/decode for prospect activity feed pagination.
 */

function encodeActivityFeedCursor(item) {
  if (!item?.timestamp || !item?.id) {
    return null;
  }

  const payload = JSON.stringify({
    t: item.timestamp,
    id: item.id
  });

  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeActivityFeedCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

    if (!parsed?.t || !parsed?.id) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Returns true when `item` is strictly older than the cursor position (DESC sort).
 */
function isActivityBeforeCursor(item, cursor) {
  if (!cursor) {
    return true;
  }

  const itemTime = new Date(item.timestamp).getTime();
  const cursorTime = new Date(cursor.t).getTime();

  if (itemTime < cursorTime) {
    return true;
  }

  if (itemTime > cursorTime) {
    return false;
  }

  return String(item.id) < String(cursor.id);
}

module.exports = {
  encodeActivityFeedCursor,
  decodeActivityFeedCursor,
  isActivityBeforeCursor
};
