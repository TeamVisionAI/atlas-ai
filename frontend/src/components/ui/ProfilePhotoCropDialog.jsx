import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { createCroppedProfilePhoto } from "../../utils/profilePhotoCrop";
import "./ProfilePhotoCropDialog.css";

const DEFAULT_CROP = { x: 0, y: 0 };
const DEFAULT_ZOOM = 1;

export default function ProfilePhotoCropDialog({
  file,
  open,
  onCancel,
  onSave,
  saving = false
}) {
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [imageSrc, setImageSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file || !open) {
      setImageSrc("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setImageSrc(objectUrl);
    setCrop(DEFAULT_CROP);
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
    setError("");

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onCancel, saving]);

  const handleCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  function handleReset() {
    setCrop(DEFAULT_CROP);
    setZoom(DEFAULT_ZOOM);
    setError("");
  }

  async function handleSave() {
    if (!file || !croppedAreaPixels) {
      setError("Adjust the crop before saving.");
      return;
    }

    try {
      setError("");
      const croppedFile = await createCroppedProfilePhoto(file, croppedAreaPixels);
      await onSave(croppedFile);
    } catch (saveError) {
      setError(saveError.message || "Unable to save photo.");
    }
  }

  if (!open || !file) {
    return null;
  }

  return (
    <div className="profile-photo-crop-dialog" role="presentation" onMouseDown={onCancel}>
      <div
        className="profile-photo-crop-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-crop-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="profile-photo-crop-dialog__header">
          <div>
            <h2 id="profile-photo-crop-title">Adjust your photo</h2>
            <p>Drag to reposition and use the slider to zoom. Your avatar will appear in a circle.</p>
          </div>
          <button
            type="button"
            className="profile-photo-crop-dialog__close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close crop dialog"
          >
            ×
          </button>
        </header>

        <div className="profile-photo-crop-dialog__crop-area">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              objectFit="contain"
            />
          ) : null}
        </div>

        <div className="profile-photo-crop-dialog__controls">
          <label className="profile-photo-crop-dialog__zoom-label" htmlFor="profile-photo-zoom">
            Zoom
          </label>
          <input
            id="profile-photo-zoom"
            className="profile-photo-crop-dialog__zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            disabled={saving}
          />
          <button
            type="button"
            className="profile-photo-crop-dialog__reset"
            onClick={handleReset}
            disabled={saving}
          >
            Reset
          </button>
        </div>

        {error ? <p className="profile-photo-crop-dialog__error">{error}</p> : null}

        <footer className="profile-photo-crop-dialog__actions">
          <button
            type="button"
            className="identity-button-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="identity-button"
            onClick={handleSave}
            disabled={saving || !croppedAreaPixels}
          >
            {saving ? "Saving…" : "Save photo"}
          </button>
        </footer>
      </div>
    </div>
  );
}
