import { useEffect, useMemo, useState } from "react";
import { fetchInterviewAssignmentCandidates } from "../../services/interviewAssignmentService";
import "./InterviewAssignmentSection.css";

export function resolveUserDisplayName(user) {
  if (!user) {
    return "";
  }

  return (
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    ""
  );
}

export function resolveInterviewerLabel(candidates, userId, currentUser) {
  if (currentUser?.id === userId) {
    return resolveUserDisplayName(currentUser);
  }

  const match = candidates.find((candidate) => candidate.id === userId);
  return match?.display_name || "";
}

export default function InterviewAssignmentSection({
  form,
  onChange,
  currentUser = null,
  candidates = [],
  disabled = false
}) {
  const [showOtherSelect, setShowOtherSelect] = useState(form.interviewerSelection === "other");

  const currentUserId = currentUser?.id || "";
  const currentUserName = resolveUserDisplayName(currentUser);
  const quickColleagues = useMemo(
    () => candidates.filter((candidate) => candidate.id !== currentUserId).slice(0, 2),
    [candidates, currentUserId]
  );
  const otherCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.id !== currentUserId),
    [candidates, currentUserId]
  );

  function selectAssignment(selection, interviewerUserId) {
    onChange({
      ...form,
      interviewerSelection: selection,
      interviewerUserId
    });
    setShowOtherSelect(selection === "other");
  }

  return (
    <section className="interview-assignment" aria-labelledby="interview-assignment-heading">
      <h3 id="interview-assignment-heading" className="interview-assignment__title">
        Interview Assignment
      </h3>
      <p className="interview-assignment__label">Conducted by</p>
      <div className="interview-assignment__options" role="radiogroup" aria-labelledby="interview-assignment-heading">
        <label className="interview-assignment__option">
          <input
            type="radio"
            name="interviewer-assignment"
            value="self"
            checked={form.interviewerSelection === "self"}
            disabled={disabled || !currentUserId}
            onChange={() => selectAssignment("self", currentUserId)}
          />
          <span>
            Me{currentUserName ? ` (${currentUserName})` : ""}
          </span>
        </label>

        {quickColleagues.map((colleague) => (
          <label key={colleague.id} className="interview-assignment__option">
            <input
              type="radio"
              name="interviewer-assignment"
              value={colleague.id}
              checked={form.interviewerSelection === colleague.id}
              disabled={disabled}
              onChange={() => selectAssignment(colleague.id, colleague.id)}
            />
            <span>{colleague.display_name}</span>
          </label>
        ))}

        <label className="interview-assignment__option">
          <input
            type="radio"
            name="interviewer-assignment"
            value="other"
            checked={form.interviewerSelection === "other"}
            disabled={disabled}
            onChange={() => selectAssignment("other", form.interviewerUserId || otherCandidates[0]?.id || "")}
          />
          <span>Another Representative…</span>
        </label>
      </div>

      {showOtherSelect || form.interviewerSelection === "other" ? (
        <label className="interview-assignment__select">
          <span className="interview-assignment__label">Select representative</span>
          <select
            value={form.interviewerUserId || ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...form,
                interviewerSelection: "other",
                interviewerUserId: event.target.value
              })
            }
          >
            {otherCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.display_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}

export function useInterviewAssignmentCandidates(active) {
  const [candidates, setCandidates] = useState([]);
  const [defaultInterviewer, setDefaultInterviewer] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchInterviewAssignmentCandidates()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setDefaultInterviewer(result.defaultInterviewer || null);
        setCandidates(result.candidates || []);
      })
      .catch(() => {
        if (!cancelled) {
          setCandidates([]);
          setDefaultInterviewer(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { candidates, defaultInterviewer, loading };
}
