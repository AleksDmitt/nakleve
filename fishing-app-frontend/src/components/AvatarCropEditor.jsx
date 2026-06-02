import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const AVATAR_CROP_OUTPUT_SIZE = 512;
const AVATAR_CROP_MAX_ZOOM = 3;
const AVATAR_CROP_MIN_FALLBACK = 0.76;
const AVATAR_CROP_WHEEL_STEP = 0.0016;
const AVATAR_CROP_MIN_ZOOM_EPSILON = 0.015;

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getAvatarBaseDimensions(stageSize, imageRatio) {
  if (!stageSize || !imageRatio) {
    return { width: stageSize || 0, height: stageSize || 0 };
  }

  if (imageRatio >= 1) {
    return { width: stageSize * imageRatio, height: stageSize };
  }

  return { width: stageSize, height: stageSize / imageRatio };
}

function getAvatarCropFileName(fileName) {
  const safeName = fileName?.trim() || "avatar";
  const withoutExtension = safeName.replace(/\.[^/.]+$/, "") || "avatar";
  return `${withoutExtension}-avatar.jpg`;
}

function loadImageForCanvas(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Не удалось подготовить изображение"));
      }
    }, type, quality);
  });
}

function getPointerDistance(firstPointer, secondPointer) {
  if (!firstPointer || !secondPointer) return 0;

  return Math.hypot(firstPointer.clientX - secondPointer.clientX, firstPointer.clientY - secondPointer.clientY);
}

async function createCroppedAvatarFile(imageUrl, imageElement, cropElement, fileName) {
  if (!imageUrl || !imageElement || !cropElement) {
    throw new Error("Не удалось определить область аватара");
  }

  const sourceImage = await loadImageForCanvas(imageUrl);
  const imageRect = imageElement.getBoundingClientRect();
  const cropRect = cropElement.getBoundingClientRect();

  if (!imageRect.width || !imageRect.height || !cropRect.width || !cropRect.height) {
    throw new Error("Редактор аватара еще не готов. Попробуй еще раз.");
  }

  const scaleX = sourceImage.naturalWidth / imageRect.width;
  const scaleY = sourceImage.naturalHeight / imageRect.height;

  const sourceX = clampNumber((cropRect.left - imageRect.left) * scaleX, 0, sourceImage.naturalWidth - 1);
  const sourceY = clampNumber((cropRect.top - imageRect.top) * scaleY, 0, sourceImage.naturalHeight - 1);
  const sourceWidth = clampNumber(cropRect.width * scaleX, 1, sourceImage.naturalWidth - sourceX);
  const sourceHeight = clampNumber(cropRect.height * scaleY, 1, sourceImage.naturalHeight - sourceY);

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CROP_OUTPUT_SIZE;
  canvas.height = AVATAR_CROP_OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#020617";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    sourceImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await canvasToBlob(canvas);
  return new File([blob], getAvatarCropFileName(fileName), { type: blob.type || "image/jpeg" });
}

export default function AvatarCropEditor({
  isOpen,
  imageUrl,
  fileName,
  onClose,
  onApply,
  saving = false,
  kicker = "Аватар профиля",
  title = "Выбери область фото",
  hint = "Перетащи фото внутри круга и настрой масштаб. В профиле аватар будет отображаться именно так.",
  applyLabel = "Сохранить аватар",
  savingLabel = "Сохраняем...",
  imageAlt = "Выбранный аватар",
}) {
  const stageRef = useRef(null);
  const cropRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const zoomRef = useRef(1);
  const minZoomRef = useRef(AVATAR_CROP_MIN_FALLBACK);
  const positionRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoomState] = useState(1);
  const [minZoom, setMinZoomState] = useState(AVATAR_CROP_MIN_FALLBACK);
  const [position, setPositionState] = useState({ x: 0, y: 0 });
  const [imageRatio, setImageRatio] = useState(1);
  const [error, setError] = useState("");

  const imageFitClass = useMemo(() => (imageRatio >= 1 ? "is-wide" : "is-tall"), [imageRatio]);

  const zoomProgress = useMemo(() => {
    const range = AVATAR_CROP_MAX_ZOOM - minZoom;
    if (range <= 0) return 0;
    return clampNumber((zoom - minZoom) / range, 0, 1);
  }, [minZoom, zoom]);

  function setZoom(nextZoom) {
    const safeZoom = clampNumber(nextZoom, minZoomRef.current, AVATAR_CROP_MAX_ZOOM);
    zoomRef.current = safeZoom;
    setZoomState(safeZoom);
    return safeZoom;
  }

  function setMinZoom(nextMinZoom) {
    const safeMinZoom = clampNumber(nextMinZoom || AVATAR_CROP_MIN_FALLBACK, 0.1, AVATAR_CROP_MAX_ZOOM);
    minZoomRef.current = safeMinZoom;
    setMinZoomState(safeMinZoom);
    return safeMinZoom;
  }

  function setPosition(nextPosition, nextZoom = zoomRef.current) {
    const safePosition = clampCropPosition(nextPosition, nextZoom);
    positionRef.current = safePosition;
    setPositionState(safePosition);
    return safePosition;
  }

  useEffect(() => {
    if (!isOpen) return;

    activePointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    zoomRef.current = 1;
    minZoomRef.current = AVATAR_CROP_MIN_FALLBACK;
    positionRef.current = { x: 0, y: 0 };
    setZoomState(1);
    setMinZoomState(AVATAR_CROP_MIN_FALLBACK);
    setPositionState({ x: 0, y: 0 });
    setImageRatio(1);
    setError("");
  }, [isOpen, imageUrl]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, saving]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function updateMinZoomFromLayout() {
      const wasAtMinimum = zoomRef.current <= minZoomRef.current + AVATAR_CROP_MIN_ZOOM_EPSILON;
      const nextMinZoom = getCalculatedMinZoom();
      const safeMinZoom = setMinZoom(nextMinZoom);
      const nextZoom = wasAtMinimum ? safeMinZoom : Math.max(zoomRef.current, safeMinZoom);
      setZoom(nextZoom);
      setPosition(positionRef.current, nextZoom);
    }

    updateMinZoomFromLayout();
    window.addEventListener("resize", updateMinZoomFromLayout);
    return () => window.removeEventListener("resize", updateMinZoomFromLayout);
  }, [isOpen, imageRatio]);

  if (!isOpen || !imageUrl || typeof document === "undefined") return null;

  function getCalculatedMinZoom() {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const cropRect = cropRef.current?.getBoundingClientRect();

    if (!stageRect || !cropRect || !stageRect.width || !cropRect.width) {
      return AVATAR_CROP_MIN_FALLBACK;
    }

    const baseDimensions = getAvatarBaseDimensions(stageRect.width, imageRatio || 1);

    if (!baseDimensions.width || !baseDimensions.height) {
      return AVATAR_CROP_MIN_FALLBACK;
    }

    return Math.max(cropRect.width / baseDimensions.width, cropRect.height / baseDimensions.height);
  }

  function getCropLimits(nextZoom = zoomRef.current) {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const cropRect = cropRef.current?.getBoundingClientRect();

    if (!stageRect || !cropRect) {
      return { x: 0, y: 0 };
    }

    const baseDimensions = getAvatarBaseDimensions(stageRect.width, imageRatio || 1);
    return {
      x: Math.max(0, (baseDimensions.width * nextZoom - cropRect.width) / 2),
      y: Math.max(0, (baseDimensions.height * nextZoom - cropRect.height) / 2),
    };
  }

  function clampCropPosition(nextPosition, nextZoom = zoomRef.current) {
    const limits = getCropLimits(nextZoom);
    return {
      x: clampNumber(nextPosition.x, -limits.x, limits.x),
      y: clampNumber(nextPosition.y, -limits.y, limits.y),
    };
  }

  function handleImageLoad(event) {
    const image = event.currentTarget;
    const ratio = image.naturalWidth && image.naturalHeight
      ? image.naturalWidth / image.naturalHeight
      : 1;

    setImageRatio(ratio);
    setPosition({ x: 0, y: 0 });
  }

  function handlePointerDown(event) {
    if (saving) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length >= 2) {
      const distance = getPointerDistance(pointers[0], pointers[1]);
      pinchRef.current = {
        startDistance: distance || 1,
        startZoom: zoomRef.current,
      };
      dragRef.current = null;
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: positionRef.current,
    };
  }

  function handlePointerMove(event) {
    if (!activePointersRef.current.has(event.pointerId)) return;

    activePointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const pointers = Array.from(activePointersRef.current.values());

    if (pointers.length >= 2 && pinchRef.current) {
      event.preventDefault();
      const distance = getPointerDistance(pointers[0], pointers[1]);
      const nextZoom = setZoom(pinchRef.current.startZoom * (distance / pinchRef.current.startDistance));
      setPosition(positionRef.current, nextZoom);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const nextPosition = {
      x: drag.startPosition.x + event.clientX - drag.startX,
      y: drag.startPosition.y + event.clientY - drag.startY,
    };

    setPosition(nextPosition);
  }

  function handlePointerUp(event) {
    activePointersRef.current.delete(event.pointerId);

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }

    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleWheel(event) {
    if (saving) return;

    event.preventDefault();
    const nextZoom = setZoom(zoomRef.current - event.deltaY * AVATAR_CROP_WHEEL_STEP);
    setPosition(positionRef.current, nextZoom);
  }

  function handleZoomChange(event) {
    const nextZoom = setZoom(Number(event.target.value));
    setPosition(positionRef.current, nextZoom);
  }

  async function handleApply() {
    if (saving) return;

    try {
      setError("");
      const croppedFile = await createCroppedAvatarFile(imageUrl, imageRef.current, cropRef.current, fileName);
      await onApply?.(croppedFile);
    } catch (err) {
      console.error(err);
      setError(err.message || "Не удалось подготовить аватар");
    }
  }

  return createPortal(
    <div className="profile-avatar-crop-backdrop" role="dialog" aria-modal="true" aria-label="Настройка аватара">
      <div className="profile-avatar-crop-modal">
        <div className="profile-avatar-crop-modal__header">
          <div>
            <p className="profile-avatar-crop-modal__kicker">{kicker}</p>
            <h2>{title}</h2>
          </div>
          <button className="profile-avatar-crop-modal__close" type="button" onClick={onClose} disabled={saving} aria-label="Закрыть">
            ×
          </button>
        </div>

        <p className="profile-avatar-crop-modal__hint">{hint}</p>

        <div
          className="profile-avatar-crop-modal__stage"
          ref={stageRef}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            "--avatar-crop-x": `${position.x}px`,
            "--avatar-crop-y": `${position.y}px`,
            "--avatar-crop-zoom": zoom,
          }}
        >
          <img
            ref={imageRef}
            className={`profile-avatar-crop-modal__image ${imageFitClass}`}
            src={imageUrl}
            alt={imageAlt}
            draggable="false"
            onLoad={handleImageLoad}
          />
          <div className="profile-avatar-crop-modal__circle" ref={cropRef} aria-hidden="true" />
        </div>

        <label
          className="profile-avatar-crop-modal__zoom"
          style={{ "--avatar-zoom-progress": `${zoomProgress * 100}%` }}
        >
          <span>Масштаб</span>
          <input
            type="range"
            min={minZoom}
            max={AVATAR_CROP_MAX_ZOOM}
            step="0.01"
            value={clampNumber(zoom, minZoom, AVATAR_CROP_MAX_ZOOM)}
            onChange={handleZoomChange}
            disabled={saving}
          />
        </label>

        {error && <div className="profile-avatar-crop-modal__error">{error}</div>}

        <div className="profile-avatar-crop-modal__actions">
          <button className="profile-avatar-crop-modal__secondary" type="button" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button className="profile-avatar-crop-modal__primary" type="button" onClick={handleApply} disabled={saving}>
            {saving ? savingLabel : applyLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
