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
