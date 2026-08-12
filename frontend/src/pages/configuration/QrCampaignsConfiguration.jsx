import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  activateQrCampaign,
  createQrCampaign,
  deactivateQrCampaign,
  downloadQrCampaignPng,
  downloadQrCampaignSvg,
  fetchQrCampaignMeta,
  fetchQrCampaignPngObjectUrl,
  fetchQrCampaignPublicUrl,
  fetchQrCampaigns
} from "../../services/qrCampaignService";
import "./QrCampaignsConfiguration.css";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "—";
  }
}

export default function QrCampaignsConfiguration() {
  const { user } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [gateReason, setGateReason] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignTypes, setCampaignTypes] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [canCreateForOthers, setCanCreateForOthers] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [previewUrlById, setPreviewUrlById] = useState({});
  const [lastCreated, setLastCreated] = useState(null);

  const [form, setForm] = useState({
    name: "",
    campaignType: "car_magnet",
    ownerUserId: user?.id || "",
    description: ""
  });

  const selfId = user?.id || "";

  async function reload() {
    setError("");
    const [meta, list] = await Promise.all([
      fetchQrCampaignMeta(),
      fetchQrCampaigns().catch((err) => {
        if (err.status === 403) {
          return null;
        }
        throw err;
      })
    ]);
    setEnabled(Boolean(meta.enabled));
    setGateReason(meta.reason || null);
    setCandidates(meta.candidates || []);
    setCanCreateForOthers(Boolean(meta.canCreateForOthers));
    setCampaignTypes(meta.campaignTypes || []);
    if (list) {
      setCampaigns(list.campaigns || []);
      setCanCreateForOthers(Boolean(list.canCreateForOthers));
      setCampaignTypes(list.campaignTypes || meta.campaignTypes || []);
    } else {
      setCampaigns([]);
    }
    setForm((current) => ({
      ...current,
      ownerUserId: current.ownerUserId || selfId
    }));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load QR campaigns");
          setEnabled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId]);

  useEffect(() => {
    return () => {
      Object.values(previewUrlById).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
    };
  }, [previewUrlById]);

  const ownerOptions = useMemo(() => {
    if (canCreateForOthers && candidates.length) {
      return candidates;
    }
    return [
      {
        id: selfId,
        displayName: user?.display_name || user?.full_name || user?.email || "Me"
      }
    ];
  }, [canCreateForOthers, candidates, selfId, user]);

  async function ensurePreview(campaignId) {
    if (previewUrlById[campaignId]) return previewUrlById[campaignId];
    const url = await fetchQrCampaignPngObjectUrl(campaignId);
    setPreviewUrlById((current) => ({ ...current, [campaignId]: url }));
    return url;
  }

  async function onCreate(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setCreating(true);
    try {
      const result = await createQrCampaign({
        name: form.name.trim(),
        campaignType: form.campaignType,
        ownerUserId: form.ownerUserId || selfId,
        description: form.description.trim() || null
      });
      setLastCreated(result);
      setShowForm(false);
      setForm({
        name: "",
        campaignType: "car_magnet",
        ownerUserId: selfId,
        description: ""
      });
      await reload();
      if (result.campaign?.id) {
        await ensurePreview(result.campaign.id);
      }
      setMessage("Campaign created. QR is ready to download.");
    } catch (err) {
      setError(err.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function onToggleStatus(campaign) {
    setError("");
    setMessage("");
    try {
      if (campaign.status === "active") {
        await deactivateQrCampaign(campaign.id);
        setMessage("Campaign deactivated.");
      } else {
        await activateQrCampaign(campaign.id);
        setMessage("Campaign activated.");
      }
      await reload();
    } catch (err) {
      setError(err.message || "Status update failed");
    }
  }

  async function onCopyLink(campaign) {
    setError("");
    setMessage("");
    try {
      const result = await fetchQrCampaignPublicUrl(campaign.id);
      await navigator.clipboard.writeText(result.publicUrl);
      setMessage("Campaign URL copied.");
    } catch (err) {
      setError(err.message || "Copy link failed");
    }
  }

  if (loading) {
    return <ConfigurationLoading />;
  }

  if (!enabled) {
    return (
      <ConfigurationSection title={SETTINGS_SECTIONS.qrCampaigns}>
        <p className="configuration-message" role="status">
          QR Campaign Manager is not enabled for this organization yet. Storage
          and APIs are multi-tenant ready; public WhatsApp destination and
          interstitial branding are still being made tenant-configurable.
        </p>
        {gateReason ? (
          <p className="configuration-message configuration-message--muted">
            Gate: {gateReason}
          </p>
        ) : null}
      </ConfigurationSection>
    );
  }

  return (
    <>
      <ConfigurationSection title={SETTINGS_SECTIONS.qrCampaigns}>
        <div className="qr-campaigns__toolbar">
          <p className="qr-campaigns__lede">
            Create org-scoped recruiting QR codes. New prospects from a campaign
            are assigned to the campaign owner. Existing prospects are never
            reassigned.
          </p>
          <AtlasButton type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ New Campaign"}
          </AtlasButton>
        </div>

        {error ? (
          <p className="configuration-message configuration-message--error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="configuration-message" role="status">
            {message}
          </p>
        ) : null}

        {showForm ? (
          <form className="configuration-form qr-campaigns__form" onSubmit={onCreate}>
            <label>
              Campaign Name
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              />
            </label>
            <label>
              Owner
              <select
                value={form.ownerUserId || selfId}
                disabled={!canCreateForOthers}
                onChange={(e) =>
                  setForm((c) => ({ ...c, ownerUserId: e.target.value }))
                }
              >
                {ownerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.displayName || opt.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Campaign Type
              <select
                value={form.campaignType}
                onChange={(e) =>
                  setForm((c) => ({ ...c, campaignType: e.target.value }))
                }
              >
                {(campaignTypes.length
                  ? campaignTypes
                  : [{ value: "car_magnet", label: "Car Magnet" }]
                ).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description (optional)
              <textarea
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) =>
                  setForm((c) => ({ ...c, description: e.target.value }))
                }
              />
            </label>
            <p className="qr-campaigns__hint">Goal is fixed to interview for Phase A.</p>
            <AtlasButton type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create & Generate QR"}
            </AtlasButton>
          </form>
        ) : null}

        {lastCreated?.publicUrl ? (
          <div className="qr-campaigns__created">
            <strong>Just created:</strong> {lastCreated.campaign?.name}
            <div className="qr-campaigns__actions">
              <AtlasButton
                type="button"
                onClick={() => downloadQrCampaignPng(lastCreated.campaign.id)}
              >
                Download PNG
              </AtlasButton>
              <AtlasButton
                type="button"
                onClick={() => downloadQrCampaignSvg(lastCreated.campaign.id)}
              >
                Download SVG
              </AtlasButton>
              <AtlasButton
                type="button"
                onClick={() => onCopyLink(lastCreated.campaign)}
              >
                Copy Link
              </AtlasButton>
            </div>
          </div>
        ) : null}
      </ConfigurationSection>

      <div className="qr-campaigns__list">
        {campaigns.map((campaign) => {
          const legacy = campaign.legacyRedownloadUnavailable;
          const preview = previewUrlById[campaign.id];
          return (
            <ConfigurationSection
              key={campaign.id}
              title={campaign.name}
              className="qr-campaigns__card"
            >
              <dl className="qr-campaigns__meta">
                <div>
                  <dt>Owner</dt>
                  <dd>{campaign.ownerUserId}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{campaign.campaignTypeLabel || campaign.campaignType}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span
                      className={`qr-campaigns__status qr-campaigns__status--${campaign.status}`}
                    >
                      {campaign.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(campaign.createdAt)}</dd>
                </div>
              </dl>

              {legacy ? (
                <p className="qr-campaigns__legacy" role="status">
                  Legacy QR — existing printed code remains active. Re-download
                  unavailable until a future controlled reissue.
                </p>
              ) : (
                <div className="qr-campaigns__preview-wrap">
                  {preview ? (
                    <img
                      className="qr-campaigns__preview"
                      src={preview}
                      alt={`QR for ${campaign.name}`}
                    />
                  ) : (
                    <AtlasButton
                      type="button"
                      onClick={() =>
                        ensurePreview(campaign.id).catch((err) =>
                          setError(err.message || "Preview failed")
                        )
                      }
                    >
                      Show QR Preview
                    </AtlasButton>
                  )}
                </div>
              )}

              <div className="qr-campaigns__actions">
                {!legacy ? (
                  <>
                    <AtlasButton
                      type="button"
                      onClick={() =>
                        downloadQrCampaignPng(campaign.id).catch((err) =>
                          setError(err.message)
                        )
                      }
                    >
                      Download PNG
                    </AtlasButton>
                    <AtlasButton
                      type="button"
                      onClick={() =>
                        downloadQrCampaignSvg(campaign.id).catch((err) =>
                          setError(err.message)
                        )
                      }
                    >
                      Download SVG
                    </AtlasButton>
                    <AtlasButton type="button" onClick={() => onCopyLink(campaign)}>
                      Copy Link
                    </AtlasButton>
                  </>
                ) : null}
                <AtlasButton type="button" onClick={() => onToggleStatus(campaign)}>
                  {campaign.status === "active" ? "Deactivate" : "Activate"}
                </AtlasButton>
              </div>
            </ConfigurationSection>
          );
        })}
        {!campaigns.length ? (
          <p className="configuration-message">No campaigns yet.</p>
        ) : null}
      </div>
    </>
  );
}
