import { useMemo, useState } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { isSuperAdminUser } from "../../security/isSuperAdminUser";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  findCanaryCandidates,
  markCanaryProspectAsTest,
  resetCanaryProspect
} from "../../services/platformService";

const cardStyle = {
  border: "1px solid var(--border-color, #d8dee9)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
  background: "var(--surface-card, #fff)"
};

export default function CanaryResetPage() {
  const { user, supportMode } = useWorkspace();
  const organizationId = supportMode?.organizationId || "";
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [reasonById, setReasonById] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canUse = useMemo(
    () => isSuperAdminUser(user) && Boolean(organizationId),
    [user, organizationId]
  );

  async function search() {
    const q = String(query || "").trim();
    if (!canUse || q.length < 2 || loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await findCanaryCandidates({ organizationId, q });
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch (err) {
      setError(err.message || "Unable to search canary prospects.");
    } finally {
      setLoading(false);
    }
  }

  async function markTest(item) {
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await markCanaryProspectAsTest({
        organizationId,
        prospectId: item.id,
        reason: "SUPER_ADMIN canary preparation"
      });
      setItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, inboxMarkedTestAt: new Date().toISOString() }
            : row
        )
      );
      setMessage(`${item.name || item.prospectNumber || item.phone} is now marked TEST.`);
    } catch (err) {
      setError(err.message || "Unable to mark prospect as test.");
    } finally {
      setBusyId("");
    }
  }

  async function reset(item) {
    const resetReason = String(reasonById[item.id] || "").trim();
    if (resetReason.length < 3) {
      setError("Enter a reset reason with at least 3 characters.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await resetCanaryProspect({
        organizationId,
        prospectId: item.id,
        resetReason
      });
      setItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                canaryAwaitingFreshIntake: true,
                canaryResetAt: new Date().toISOString()
              }
            : row
        )
      );
      setMessage(
        `${item.name || item.prospectNumber || item.phone} is reset and waiting for a fresh valid intake.`
      );
    } catch (err) {
      setError(err.message || "Unable to reset canary prospect.");
    } finally {
      setBusyId("");
    }
  }

  if (!isSuperAdminUser(user)) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Canary Reset</h1>
        <p>Super Admin access is required.</p>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Canary Reset</h1>
        <p>Enter Support Mode for the tenant you want to test first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Canary Reset</h1>
      <p>
        Tenant-wide Super Admin locator. Search by prospect number, name, or phone. This does not
        bypass intake eligibility; after reset the prospect still needs a fresh valid CTWA, QR, or
        campaign intake before Atlas can reply.
      </p>

      <div style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") search();
          }}
          placeholder="TV-000030, Anthony Perez, or phone"
          style={{ flex: 1, minWidth: 260, padding: "10px 12px", borderRadius: 8 }}
        />
        <AtlasButton variant="primary" disabled={loading || query.trim().length < 2} onClick={search}>
          {loading ? "Searching…" : "Find canary"}
        </AtlasButton>
      </div>

      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      {!loading && query.trim().length >= 2 && items.length === 0 ? (
        <p>No tenant prospect matched that search.</p>
      ) : null}

      {items.map((item) => {
        const marked = Boolean(item.inboxMarkedTestAt);
        const busy = busyId === item.id;
        return (
          <div key={item.id} style={cardStyle}>
            <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
              <strong>{item.name || "Unnamed prospect"}</strong>
              <span>{item.prospectNumber || "No prospect number"}</span>
              <span>{item.phone || "No phone"}</span>
              <span>{marked ? "TEST marker present" : "Not marked TEST yet"}</span>
              {item.canaryAwaitingFreshIntake ? (
                <span>Reset complete — awaiting fresh intake</span>
              ) : null}
            </div>

            {!marked ? (
              <AtlasButton variant="secondary" disabled={busy} onClick={() => markTest(item)}>
                {busy ? "Working…" : "Mark as TEST"}
              </AtlasButton>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <textarea
                  rows={2}
                  value={reasonById[item.id] || ""}
                  onChange={(event) =>
                    setReasonById((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  placeholder="Reset reason, e.g. New IUL canary test"
                  disabled={busy}
                />
                <div>
                  <AtlasButton
                    variant="primary"
                    disabled={busy || String(reasonById[item.id] || "").trim().length < 3}
                    onClick={() => reset(item)}
                  >
                    {busy ? "Resetting…" : "Reset Canary"}
                  </AtlasButton>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
