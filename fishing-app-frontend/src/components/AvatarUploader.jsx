import { useEffect, useRef, useState } from "react";
import AvatarCropEditor from "./AvatarCropEditor";
import { getSafeImageUrl } from "../utils/safeUrl";

function getInitials(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "НК";

  const parts = cleanValue.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function isSupportedImage(file) {
  if (!file) return false;
  const fileName = file.name || "";
  return file.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);
}

export default function AvatarUploader({
  avatarUrl,
  displayName,
  disabled = false,
  uploading = false,
  onUpload,
  onRemove,
}) {
  const inputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [cropSource, setCropSource] = useState(null);
  const [localError, setLocalError] = useState("");

  function clearObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => clearObjectUrl, []);

  function openFileDialog() {
    if (disabled || uploading) return;
    setLocalError("");
    inputRef.current?.click();
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!isSupportedImage(file)) {
      setLocalError("Выбери изображение в формате JPG, PNG, WEBP, GIF или BMP.");
      return;
    }

    clearObjectUrl();
    const nextObjectUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextObjectUrl;
    setLocalError("");
    setCropSource({ imageUrl: nextObjectUrl, fileName: file.name || "avatar.jpg" });
  }

  function closeCropEditor() {
    if (uploading) return;
    setCropSource(null);
    clearObjectUrl();
  }

  async function handleCropApply(croppedFile) {
    await onUpload?.(croppedFile);
    setCropSource(null);
    clearObjectUrl();
  }

  const safeAvatarUrl = getSafeImageUrl(avatarUrl);

  return (
    <div className="profile-avatar-picker">
      <div className="profile-avatar-picker__preview" aria-hidden="true">
        {safeAvatarUrl ? <img src={safeAvatarUrl} alt="" /> : <span>{getInitials(displayName)}</span>}
      </div>

      <div className="profile-avatar-picker__body">
        <span className="profile-avatar-picker__title">Аватар профиля</span>

        <div className="profile-avatar-picker__actions">
          <input
            ref={inputRef}
            className="profile-avatar-picker__input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />

          <button
            className={`profile-avatar-picker__button${uploading ? " is-loading" : ""}`}
            type="button"
            onClick={openFileDialog}
            disabled={disabled || uploading}
            title="Выбрать фото профиля"
          >
            <span className="profile-avatar-picker__icon" aria-hidden="true">
              {uploading ? "…" : "+"}
            </span>
            <span className="profile-avatar-picker__text">
              {uploading ? "Загрузка аватара" : safeAvatarUrl ? "Заменить фото" : "Добавить фото"}
            </span>
          </button>

          {safeAvatarUrl && (
            <button
              className="profile-avatar-picker__remove"
              type="button"
              onClick={onRemove}
              disabled={disabled || uploading}
            >
              Удалить фото
            </button>
          )}
        </div>

        <p className="profile-avatar-picker__note">
          После выбора фото откроется редактор: можно подвинуть изображение и настроить масштаб.
        </p>

        {localError && <p className="profile-avatar-picker__error">{localError}</p>}
      </div>

      <AvatarCropEditor
        isOpen={Boolean(cropSource)}
        imageUrl={cropSource?.imageUrl}
        fileName={cropSource?.fileName}
        onClose={closeCropEditor}
        onApply={handleCropApply}
        saving={uploading}
      />
    </div>
  );
}
