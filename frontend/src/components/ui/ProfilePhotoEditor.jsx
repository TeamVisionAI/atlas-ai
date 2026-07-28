import { useRef, useState } from "react";
import UserAvatar from "./UserAvatar";
import "./ProfilePhotoEditor.css";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePhotoEditor({
  profile,
  onUpload,
  onRemove,
  uploading = false
}) {
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState("");

  const displayName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "User";

  function openFilePicker() {
    setLocalError("");
    inputRef.current?.click();
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("Photo must be JPG, PNG, or WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLocalError("Photo must be 5 MB or smaller.");
      return;
    }

    try {
      setLocalError("");
      await onUpload(file);
    } catch (uploadError) {
      setLocalError(uploadError.message);
    }
  }

  async function handleRemove() {
    try {
      setLocalError("");
      await onRemove();
    } catch (removeError) {
      setLocalError(removeError.message);
    }
  }

  const hasPhoto = Boolean(profile?.photo_url);

  return (
    <div className="profile-photo-editor">
      <UserAvatar
        photoUrl={profile?.photo_url}
        name={displayName}
        email={profile?.email}
        size="xl"
      />

      <div className="profile-photo-editor__actions">
        <button
          type="button"
          className="identity-button-secondary"
          onClick={openFilePicker}
          disabled={uploading}
        >
          {hasPhoto ? "Change Photo" : "Upload Photo"}
        </button>

        {hasPhoto ? (
          <button
            type="button"
            className="identity-button-secondary"
            onClick={handleRemove}
            disabled={uploading}
          >
            Remove Photo
          </button>
        ) : null}
      </div>

      <p className="profile-photo-editor__hint">JPG, PNG, or WebP up to 5 MB.</p>

      {localError ? <p className="identity-error">{localError}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        hidden
        onChange={handleFileChange}
      />
    </div>
  );
}
