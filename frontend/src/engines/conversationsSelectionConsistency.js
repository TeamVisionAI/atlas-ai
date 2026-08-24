/**
 * Conversations Center selection ↔ transcript consistency.
 * Pure helpers so selection races never leave header / composer / timeline disagreeing.
 */

export function isConversationDetailCurrent(detail, selectedPhone) {
  if (!detail || !selectedPhone) {
    return false;
  }
  return (
    detail.phone === selectedPhone ||
    detail.conversation?.phone === selectedPhone
  );
}

/**
 * Prefer list-row prospect id (available immediately on click); fall back to
 * detail.prospectId only when detail matches the selected phone.
 */
export function resolveSelectedTranscriptProspectId({
  selectedPhone,
  selectedItem = null,
  detail = null
} = {}) {
  if (!selectedPhone) {
    return null;
  }

  if (selectedItem?.phone === selectedPhone && selectedItem.id) {
    return selectedItem.id;
  }

  if (isConversationDetailCurrent(detail, selectedPhone) && detail.prospectId) {
    return detail.prospectId;
  }

  return null;
}

export function shouldCommitConversationDetail({ requestPhone, selectedPhone }) {
  return Boolean(requestPhone) && requestPhone === selectedPhone;
}

/**
 * Reject timeline payloads that belong to a different prospect than the request.
 * Missing response id is treated as non-committable (fail closed on identity).
 */
export function shouldCommitTimelinePayload({ requestedProspectId, payload }) {
  if (!requestedProspectId || !payload) {
    return false;
  }
  const responseId = payload?.prospect?.id || payload?.prospectId || null;
  if (!responseId) {
    return false;
  }
  return String(responseId) === String(requestedProspectId);
}

/**
 * Latest message cursor for open-thread freshness (sidebar vs thread convergence).
 */
export function getTimelineFreshnessCursor(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  let latestAt = null;
  let latestId = null;

  for (const item of items) {
    const at =
      item?.occurredAt ||
      item?.createdAt ||
      item?.timestamp ||
      item?.created_at ||
      null;
    if (!at) {
      continue;
    }
    const id = item?.id != null ? String(item.id) : "";
    if (
      !latestAt ||
      String(at) > String(latestAt) ||
      (String(at) === String(latestAt) && id > String(latestId || ""))
    ) {
      latestAt = String(at);
      latestId = id || null;
    }
  }

  return {
    latestAt,
    latestId,
    itemCount: items.length
  };
}

/**
 * Newest thread data wins. Stale in-flight responses must not replace fresher state.
 * requestGeneration < committedGeneration → reject (out-of-order completion).
 */
export function shouldCommitFresherTimelinePayload({
  requestedProspectId,
  incoming,
  current = null,
  requestGeneration = null,
  committedGeneration = null
} = {}) {
  if (
    !shouldCommitTimelinePayload({
      requestedProspectId,
      payload: incoming
    })
  ) {
    return false;
  }

  if (
    typeof requestGeneration === "number" &&
    typeof committedGeneration === "number" &&
    requestGeneration < committedGeneration
  ) {
    return false;
  }

  if (!current) {
    return true;
  }

  const incomingFresh = getTimelineFreshnessCursor(incoming);
  const currentFresh = getTimelineFreshnessCursor(current);

  if (!incomingFresh.latestAt) {
    return true;
  }
  if (!currentFresh.latestAt) {
    return true;
  }
  if (String(incomingFresh.latestAt) < String(currentFresh.latestAt)) {
    return false;
  }
  if (String(incomingFresh.latestAt) > String(currentFresh.latestAt)) {
    return true;
  }

  // Same timestamp: prefer equal-or-newer id; never shrink to older id.
  if (
    incomingFresh.latestId &&
    currentFresh.latestId &&
    String(incomingFresh.latestId) < String(currentFresh.latestId)
  ) {
    return false;
  }

  return true;
}

/**
 * Simulate rapid A→B→C selection commits; last selected phone wins.
 * Used for regression coverage of stale async overwrite prevention.
 */
export function resolveWinningSelection(commits = []) {
  let selectedPhone = null;
  let detail = null;
  let timelineProspectId = null;

  for (const commit of commits) {
    if (commit.type === "select") {
      selectedPhone = commit.phone;
      detail = null;
      timelineProspectId = commit.prospectId || null;
    } else if (commit.type === "detail") {
      if (
        shouldCommitConversationDetail({
          requestPhone: commit.phone,
          selectedPhone
        })
      ) {
        detail = commit.detail;
        if (!timelineProspectId && commit.detail?.prospectId) {
          timelineProspectId = commit.detail.prospectId;
        }
      }
    } else if (commit.type === "timeline") {
      if (
        shouldCommitTimelinePayload({
          requestedProspectId: commit.requestedProspectId,
          payload: commit.payload
        }) &&
        String(commit.requestedProspectId) === String(timelineProspectId)
      ) {
        // Timeline commits only when still binding the same prospect id.
        detail = detail || {
          phone: selectedPhone,
          prospectId: commit.requestedProspectId
        };
      }
    }
  }

  return {
    selectedPhone,
    detail: isConversationDetailCurrent(detail, selectedPhone) ? detail : null,
    timelineProspectId:
      selectedPhone && timelineProspectId
        ? resolveSelectedTranscriptProspectId({
            selectedPhone,
            selectedItem: timelineProspectId
              ? { phone: selectedPhone, id: timelineProspectId }
              : null,
            detail
          })
        : null
  };
}
