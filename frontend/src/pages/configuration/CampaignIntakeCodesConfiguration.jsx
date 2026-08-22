import { useEffect, useState } from "react";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  createCampaignIntakeCode,
  fetchCampaignIntakeCodes,
  pauseCampaignIntakeCode,
  reactivateCampaignIntakeCode,
  retireCampaignIntakeCode
} from "../../services/campaignIntakeCodeService";
import "./CampaignIntakeCodesConfiguration.css";

export default function CampaignIntakeCodesConfiguration() {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [lastCreated, setLastCreated] = useState(null);
  const [form, setForm] = useState({
    campaignName: "",
    purpose: "RECRUITING",
    language: "es"
  });

  async function reload() {
    setError("");
    const result = await fetchCampaignIntakeCodes();
    setCodes(result.codes || []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load campaign intake codes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const result = await createCampaignIntakeCode({
        campaignName: form.campaignName,
        purpose: form.purpose,
        language: form.language
      });
      setLastCreated(result);
      setMessage("Campaign intake code created.");
      setShowForm(false);
      setForm({ campaignName: "", purpose: "RECRUITING", language: "es" });
      await reload();
    } catch (err) {
      setError(err.message || "Failed to create campaign intake code");
    } finally {
      setCreating(false);
    }
  }

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label}.`);
    }
  }

  async function handleStatusAction(id, action) {
    setError("");
    setMessage("");
    try {
      if (action === "pause") await pauseCampaignIntakeCode(id);
      if (action === "reactivate") await reactivateCampaignIntakeCode(id);
      if (action === "retire") await retireCampaignIntakeCode(id);
      await reload();
      setMessage("Campaign intake code updated.");
    } catch (err) {
      setError(err.message || "Failed to update campaign intake code");
    }
  }

  if (loading) {
    return <ConfigurationLoading />;
  }

  return (
    <ConfigurationSection
      title={SETTINGS_SECTIONS.campaignIntakeCodes}
      description="Generate intake codes for WhatsApp ad prefilled messages."
    >
      {error ? <p className="campaign-intake-error">{error}</p> : null}
      {message ? <p className="campaign-intake-message">{message}</p> : null}

      <div className="campaign-intake-actions">
        <AtlasButton type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New Campaign Intake Code"}
        </AtlasButton>
      </div>

      {showForm ? (
        <form className="campaign-intake-form" onSubmit={handleCreate}>
          <label>
            Campaign Name
            <input
              value={form.campaignName}
              onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
              required
            />
          </label>
          <label>
            Purpose
            <select
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            >
              <option value="RECRUITING">Recruiting</option>
              <option value="IUL">IUL</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Language
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            >
              <option value="es">Spanish</option>
              <option value="en">English</option>
            </select>
          </label>
          <AtlasButton type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </AtlasButton>
        </form>
      ) : null}

      {lastCreated ? (
        <div className="campaign-intake-created">
          <h3>Latest created</h3>
          <p>
            <strong>Code:</strong> {lastCreated.code?.code}
          </p>
          <p>
            <strong>Prefilled message:</strong> {lastCreated.prefilledMessage}
          </p>
          <div className="campaign-intake-row-actions">
            <AtlasButton
              type="button"
              onClick={() => copyText(lastCreated.code?.code, "Intake code")}
            >
              Copy Intake Code
            </AtlasButton>
            <AtlasButton
              type="button"
              onClick={() => copyText(lastCreated.prefilledMessage, "Prefilled message")}
            >
              Copy Prefilled Message
            </AtlasButton>
          </div>
        </div>
      ) : null}

      <div className="campaign-intake-list">
        {codes.map((row) => (
          <article key={row.id} className="campaign-intake-card">
            <header>
              <h3>{row.campaignName}</h3>
              <span className={`campaign-intake-status status-${row.status.toLowerCase()}`}>
                {row.status}
              </span>
            </header>
            <p>
              <strong>Code:</strong> {row.code}
            </p>
            <p>
              <strong>Purpose:</strong> {row.purpose}
            </p>
            <p>
              <strong>WhatsApp phone ID:</strong> {row.whatsappPhoneNumberId}
            </p>
            <p>
              <strong>Prefilled:</strong> {row.prefilledMessage}
            </p>
            <div className="campaign-intake-row-actions">
              <AtlasButton type="button" onClick={() => copyText(row.code, "Intake code")}>
                Copy Intake Code
              </AtlasButton>
              <AtlasButton
                type="button"
                onClick={() => copyText(row.prefilledMessage, "Prefilled message")}
              >
                Copy Prefilled Message
              </AtlasButton>
              {row.status === "ACTIVE" ? (
                <AtlasButton type="button" onClick={() => handleStatusAction(row.id, "pause")}>
                  Pause
                </AtlasButton>
              ) : null}
              {row.status === "PAUSED" ? (
                <AtlasButton
                  type="button"
                  onClick={() => handleStatusAction(row.id, "reactivate")}
                >
                  Reactivate
                </AtlasButton>
              ) : null}
              {row.status !== "RETIRED" ? (
                <AtlasButton type="button" onClick={() => handleStatusAction(row.id, "retire")}>
                  Retire
                </AtlasButton>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </ConfigurationSection>
  );
}
