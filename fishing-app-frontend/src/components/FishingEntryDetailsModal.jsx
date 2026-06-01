import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MediaLightbox from "./MediaLightbox";
import { getSafeAppFileUrl, getSafeImageUrl } from "../utils/safeUrl.js";


function markEntryDetailsModalOpen() {
  if (typeof window === "undefined") return () => {};

  window.__nakleveEntryDetailsModalOpenCount = (window.__nakleveEntryDetailsModalOpenCount || 0) + 1;
  window.__nakleveEntryDetailsModalOpen = true;

  return () => {
    window.__nakleveEntryDetailsModalOpenCount = Math.max(0, (window.__nakleveEntryDetailsModalOpenCount || 1) - 1);
    window.__nakleveEntryDetailsModalOpen = window.__nakleveEntryDetailsModalOpenCount > 0;
  };
}

function lockDocumentScroll() {
  // Модалка занимает весь экран и сама управляет прокруткой внутри себя.
  // Не трогаем overflow у body/html, чтобы после закрытия полной записи
  // не могла залипнуть прокрутка ленты, профиля, карты или чатов.
  return () => {};
}

function normalizeMedia(entry) {
  const media = Array.isArray(entry?.media) ? entry.media : [];
  const normalized = media
    .map((item, index) => {
      const rawUrl = item?.url || item?.fileUrl || item?.photoUrl || item?.previewUrl || item?.thumbnailUrl;
      if (!rawUrl) return null;

      const mediaType = String(item?.mediaType || item?.type || "image").toLowerCase().startsWith("video")
        ? "video"
        : "image";

      return {
        id: item?.id || rawUrl || `entry-media-${index}`,
        url: rawUrl,
        mediaType,
        sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (normalized.length === 0 && entry?.photoUrl) {
    normalized.push({
      id: `entry-photo-${entry.photoUrl}`,
      url: entry.photoUrl,
      mediaType: "image",
      sortOrder: 0,
    });
  }

  return normalized;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(first, second) {
  return first && second
    && first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function formatDateShort(date) {
  if (!date) return "Дата не указана";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(/\.$/, "");
}

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function getFishingRange(entry) {
  const start = toDate(entry?.fishingStartedAt || entry?.startTime || entry?.fishingDate || entry?.createdAt);
  const end = toDate(entry?.fishingEndedAt || entry?.endTime);

  if (!start && !end) return "Дата не указана";
  if (start && !end) return `${formatDateShort(start)}, ${formatTime(start)}`;
  if (!start && end) return `${formatDateShort(end)}, до ${formatTime(end)}`;

  if (sameDay(start, end)) {
    return `${formatDateShort(start)}, ${formatTime(start)}–${formatTime(end)}`;
  }

  return `${formatDateShort(start)}, ${formatTime(start)} — ${formatDateShort(end)}, ${formatTime(end)}`;
}

function getPublishedDate(entry) {
  const date = toDate(entry?.createdAt || entry?.publishedAt);
  if (!date) return "";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCatchLabel(entry) {
  const parts = [];
  if (entry?.catchType) parts.push(entry.catchType);
  if (entry?.catchWeight != null && entry.catchWeight !== "") parts.push(`${entry.catchWeight} кг`);
  return parts.length > 0 ? parts.join(" · ") : "Улов не указан";
}


function isPrivateEntry(entry) {
  const value = String(entry?.visibility ?? "").toLowerCase();
  return entry?.visibility === 0 || value === "0" || value.includes("private") || value.includes("приват");
}

function getInitials(name) {
  const parts = String(name || "Р")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "Р";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function getAuthorUserId(entry) {
  return entry?.userId || entry?.authorId || entry?.createdByUserId || entry?.ownerId || entry?.profileUserId || null;
}

function createHistoryEntrySnapshot(entry) {
  if (!entry || typeof entry !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(entry));
  } catch {
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      userId: getAuthorUserId(entry),
      userName: entry.userName || entry.authorName || entry.displayName,
      avatarUrl: entry.avatarUrl || entry.userAvatarUrl || entry.authorAvatarUrl || entry.avatarPreviewUrl,
      media: Array.isArray(entry.media) ? entry.media : [],
      photoUrl: entry.photoUrl,
      locationName: entry.locationName,
      weatherSummary: entry.weatherSummary,
      catchType: entry.catchType,
      catchWeight: entry.catchWeight,
      bait: entry.bait,
      fishingDate: entry.fishingDate,
      fishingStartedAt: entry.fishingStartedAt,
      fishingEndedAt: entry.fishingEndedAt,
      createdAt: entry.createdAt,
      latitude: entry.latitude,
      longitude: entry.longitude,
      isPublishedToFeed: entry.isPublishedToFeed,
      visibility: entry.visibility,
    };
  }
}

function isSameHistoryEntry(state, historyKey, entry) {
  if (!state?.fishingEntryDetailsModal) return false;
  if (state?.fishingEntryDetailsHistoryKey !== historyKey) return false;
  const stateEntryId = state?.fishingEntryDetailsEntry?.id;
  return String(stateEntryId || "") === String(entry?.id || "");
}

function RepostIcon() {
  return (
    <svg className="entry-viewer-repost-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7.4 8.2h7.8c2.3 0 4.1 1.8 4.1 4.1 0 1-.4 2-1 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 5.6 7.2 8.2 10 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.6 15.8H8.8c-2.3 0-4.1-1.8-4.1-4.1 0-1 .4-2 1-2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m14 18.4 2.8-2.6L14 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandableValue({ value, empty = "Не указано", limit = 150, className = "", muted = false }) {
  const [expanded, setExpanded] = useState(false);
  const text = value != null && String(value).trim() ? String(value).trim() : empty;
  const shouldCollapse = text.length > limit;
  const visibleText = shouldCollapse && !expanded ? `${text.slice(0, limit).trimEnd()}…` : text;

  return (
    <div className={["entry-viewer-expandable", muted ? "entry-viewer-expandable--muted" : "", className].filter(Boolean).join(" ")}>
      <span>{visibleText}</span>
      {shouldCollapse && (
        <button
          type="button"
          className="entry-viewer-more-button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "свернуть" : "далее"}
        </button>
      )}
    </div>
  );
}

function ActionButton({ children, primary = false, danger = false, iconOnly = false, onClick, disabled, title }) {
  return (
    <button
      type="button"
      className={[
        "entry-viewer-action",
        primary ? "entry-viewer-action--primary" : "",
        danger ? "entry-viewer-action--danger" : "",
        iconOnly ? "entry-viewer-action--icon" : "",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, children, wide = false, asButton = false, onClick, disabled, title }) {
  const className = [
    "entry-viewer-info-card",
    asButton ? "entry-viewer-info-button" : "",
    wide ? "entry-viewer-info-card--wide" : "",
  ].filter(Boolean).join(" ");

  if (asButton) {
    return (
      <button className={className} type="button" onClick={onClick} disabled={disabled} title={title}>
        <span>{label}</span>
        <span className="entry-viewer-info-open-hint">Открыть</span>
        {children}
      </button>
    );
  }

  return (
    <div className={className}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export default function FishingEntryDetailsModal({
  entry,
  isOpen = true,
  onClose,
  sourceLabel = "Запись",
  authorLabel,
  authorAvatarUrl,
  authorUserId,
  onOpenAuthor,
  onOpenMap,
  onOpenWeather,
  onOpenFeed,
  onShare,
  onAdminDelete,
  isAdmin = false,
  showAuthor = true,
  showFeedAction = true,
  showShareAction = true,
  historyKey = "entry-details-modal",
}) {
  const [fullscreenViewer, setFullscreenViewer] = useState(null);
  const historyTokenRef = useRef(null);
  const fallbackCloseTimerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const media = useMemo(() => normalizeMedia(entry), [entry]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) setFullscreenViewer(null);
  }, [isOpen]);

  useEffect(() => () => {
    if (fallbackCloseTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(fallbackCloseTimerRef.current);
      fallbackCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !entry || typeof window === "undefined") return undefined;
    return markEntryDetailsModalOpen();
  }, [entry, isOpen]);

  useEffect(() => {
    if (!isOpen || !entry?.id || typeof window === "undefined") return undefined;

    const currentState = window.history.state || {};
    const existingToken = isSameHistoryEntry(currentState, historyKey, entry)
      ? currentState.fishingEntryDetailsModal
      : null;
    const token = existingToken || `${historyKey}-${entry.id}-${Date.now()}`;

    historyTokenRef.current = token;

    if (!existingToken) {
      window.history.pushState({
        ...currentState,
        fishingEntryDetailsModal: token,
        fishingEntryDetailsHistoryKey: historyKey,
        fishingEntryDetailsEntry: createHistoryEntrySnapshot(entry),
      }, "");
    }

    function handlePopState() {
      if (!historyTokenRef.current) return;

      historyTokenRef.current = null;

      if (fallbackCloseTimerRef.current) {
        window.clearTimeout(fallbackCloseTimerRef.current);
        fallbackCloseTimerRef.current = null;
      }

      onCloseRef.current?.();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [entry, entry?.id, historyKey, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;

      // В чатах есть свой глобальный обработчик Escape для выхода из страницы чата.
      // Когда поверх чата открыта полная запись, Escape должен работать только внутри
      // этой записи/просмотра фото/окна шаринга и не должен доходить до страницы чата.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (fullscreenViewer) return;
      if (document.querySelector(".feed-share-modal-backdrop")) return;

      closeDetails();
    }

    const unlockScroll = lockDocumentScroll();
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      unlockScroll();
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [fullscreenViewer, isOpen]);

  if (!isOpen || !entry || typeof document === "undefined") return null;

  const canOpenMap = entry.latitude != null && entry.longitude != null && typeof onOpenMap === "function";
  const canOpenWeather = entry.latitude != null && entry.longitude != null && typeof onOpenWeather === "function";
  const canOpenFeed = Boolean(entry.id && entry.isPublishedToFeed && !isPrivateEntry(entry) && typeof onOpenFeed === "function");
  const canShare = typeof onShare === "function";
  const publishedDate = getPublishedDate(entry);
  const authorName = authorLabel || entry.userName || entry.authorName || entry.displayName || "Рыбак";
  const avatarUrl = getSafeImageUrl(authorAvatarUrl || entry.avatarUrl || entry.userAvatarUrl || entry.authorAvatarUrl || entry.avatarPreviewUrl);
  const resolvedAuthorUserId = authorUserId || getAuthorUserId(entry);
  const canOpenAuthor = showAuthor && Boolean(resolvedAuthorUserId) && typeof onOpenAuthor === "function";

  function clearCurrentModalHistoryState(token) {
    if (!token || typeof window === "undefined") return;
    if (window.history.state?.fishingEntryDetailsModal !== token) return;

    const nextState = { ...(window.history.state || {}) };
    delete nextState.fishingEntryDetailsModal;
    delete nextState.fishingEntryDetailsHistoryKey;
    delete nextState.fishingEntryDetailsEntry;
    window.history.replaceState(nextState, "");
  }

  function closeDetails() {
    const token = historyTokenRef.current;
    const isCurrentModalState = token && typeof window !== "undefined" && window.history.state?.fishingEntryDetailsModal === token;

    if (isCurrentModalState) {
      window.history.back();

      if (fallbackCloseTimerRef.current) {
        window.clearTimeout(fallbackCloseTimerRef.current);
      }

      fallbackCloseTimerRef.current = window.setTimeout(() => {
        if (historyTokenRef.current !== token) return;
        clearCurrentModalHistoryState(token);
        historyTokenRef.current = null;
        fallbackCloseTimerRef.current = null;
        onCloseRef.current?.();
      }, 220);

      return;
    }

    clearCurrentModalHistoryState(token);
    historyTokenRef.current = null;
    onCloseRef.current?.();
  }

  function handleAction(action) {
    action?.(entry);
  }

  function handleOpenAuthor(event) {
    event.stopPropagation();
    if (!canOpenAuthor) return;
    onOpenAuthor(entry, resolvedAuthorUserId);
  }

  function openFullscreen(initialIndex) {
    if (media.length === 0) return;
    setFullscreenViewer({
      title: entry.title || "Запись о рыбалке",
      media,
      initialIndex,
    });
  }

  const node = (
    <div className="entry-viewer-backdrop" role="dialog" aria-modal="true" onClick={closeDetails}>
      <style>{`
        .entry-viewer-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9300;
          display: flex;
          justify-content: center;
          align-items: stretch;
          padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
          color: #f8fafc;
          background:
            radial-gradient(circle at 15% 0%, rgba(34, 197, 94, 0.13), transparent 32%),
            radial-gradient(circle at 85% 100%, rgba(14, 165, 233, 0.12), transparent 30%),
            rgba(2, 6, 23, 0.9);
          backdrop-filter: blur(16px);
          overflow: hidden;
        }

        .entry-viewer {
          width: min(980px, 100%);
          height: calc(100dvh - 24px);
          max-height: calc(100dvh - 24px);
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(8, 15, 28, 0.98));
          box-shadow: 0 34px 90px rgba(0, 0, 0, 0.52);
          overflow: hidden;
        }

        .entry-viewer-header {
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(8, 15, 28, 0.84);
        }

        .entry-viewer-header-title {
          min-width: 0;
          color: rgba(226, 232, 240, 0.86);
          font-size: 13px;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .entry-viewer-close {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 50%;
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.82);
          cursor: pointer;
          font-size: 24px;
          font-weight: 800;
          line-height: 1;
          flex: 0 0 auto;
        }

        .entry-viewer-scroll {
          min-height: 0;
          overflow: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding: 16px;
        }

        .entry-viewer-content {
          display: grid;
          gap: 14px;
        }

        .entry-viewer-media-block {
          min-width: 0;
          display: grid;
          gap: 10px;
        }

        .entry-viewer-hero {
          position: relative;
          width: 100%;
          height: clamp(260px, 52dvh, 540px);
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 24px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.76);
          cursor: zoom-in;
        }

        .entry-viewer-hero img,
        .entry-viewer-hero video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .entry-viewer-counter {
          position: absolute;
          left: 12px;
          bottom: 12px;
          padding: 7px 11px;
          border-radius: 999px;
          color: #fff;
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.13);
          font-size: 12px;
          font-weight: 900;
          backdrop-filter: blur(10px);
        }

        .entry-viewer-thumbs {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .entry-viewer-thumb {
          position: relative;
          aspect-ratio: 1 / 1;
          padding: 0;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 14px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.72);
          cursor: zoom-in;
        }

        .entry-viewer-thumb img,
        .entry-viewer-thumb video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .entry-viewer-thumb-more {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: #fff;
          background: rgba(2, 6, 23, 0.58);
          font-size: 18px;
          font-weight: 900;
        }

        .entry-viewer-no-media {
          min-height: 260px;
          display: grid;
          place-items: center;
          border: 1px dashed rgba(148, 163, 184, 0.22);
          border-radius: 24px;
          color: rgba(226, 232, 240, 0.7);
          background: rgba(15, 23, 42, 0.48);
          font-weight: 800;
        }

        .entry-viewer-panel {
          min-width: 0;
          display: grid;
          gap: 12px;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.48);
        }

        .entry-viewer-title-card {
          display: grid;
          gap: 7px;
          padding: 14px 15px;
          border: 1px solid rgba(34, 197, 94, 0.16);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(14, 165, 233, 0.08));
        }

        .entry-viewer-kicker,
        .entry-viewer-info-card > span,
        .entry-viewer-info-button > span,
        .entry-viewer-description-label {
          display: block;
          color: rgba(148, 163, 184, 0.88);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .entry-viewer-title {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(24px, 3vw, 36px);
          line-height: 1.09;
          letter-spacing: -0.035em;
          overflow-wrap: anywhere;
        }

        .entry-viewer-author {
          width: 100%;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 20px;
          color: inherit;
          background: rgba(15, 23, 42, 0.6);
          text-align: left;
        }

        .entry-viewer-author-button {
          cursor: pointer;
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }

        .entry-viewer-author-button:hover {
          transform: translateY(-1px);
          border-color: rgba(34, 197, 94, 0.36);
          background: rgba(20, 83, 45, 0.22);
        }

        .entry-viewer-author-avatar {
          width: 50px;
          height: 50px;
          flex: 0 0 50px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          overflow: hidden;
          color: #d1fae5;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.24);
          font-weight: 900;
        }

        .entry-viewer-author-avatar img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .entry-viewer-author-text {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .entry-viewer-author-text strong {
          min-width: 0;
          color: #f8fafc;
          font-size: 15px;
          font-weight: 950;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .entry-viewer-author-text span {
          color: rgba(203, 213, 225, 0.74);
          font-size: 12px;
          font-weight: 700;
        }

        .entry-viewer-info-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .entry-viewer-info-card {
          min-width: 0;
          display: grid;
          align-content: start;
          gap: 6px;
          padding: 12px 13px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.58);
          text-align: left;
        }

        .entry-viewer-info-button {
          position: relative;
          color: inherit;
          cursor: pointer;
          border-color: rgba(34, 197, 94, 0.26);
          background:
            linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(14, 165, 233, 0.08)),
            rgba(15, 23, 42, 0.62);
          box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.04);
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
        }

        .entry-viewer-info-button:not(:disabled):hover {
          transform: translateY(-1px);
          border-color: rgba(34, 197, 94, 0.5);
          background:
            linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(14, 165, 233, 0.12)),
            rgba(20, 83, 45, 0.22);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
        }

        .entry-viewer-info-open-hint {
          position: absolute;
          top: 10px;
          right: 12px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          color: #bbf7d0;
          background: rgba(22, 101, 52, 0.36);
          border: 1px solid rgba(134, 239, 172, 0.18);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0;
          text-transform: none;
        }

        .entry-viewer-info-open-hint::after {
          content: "↗";
          font-size: 11px;
          line-height: 1;
        }

        .entry-viewer-info-button:disabled {
          cursor: default;
          opacity: 0.86;
        }

        .entry-viewer-info-button .entry-viewer-value {
          padding-right: 74px;
          color: #dcfce7;
        }

        .entry-viewer-value,
        .entry-viewer-info-card strong,
        .entry-viewer-info-button strong {
          min-width: 0;
          display: block;
          color: #f8fafc;
          font-size: 14px;
          font-weight: 900;
          line-height: 1.38;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .entry-viewer-expandable {
          min-width: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .entry-viewer-expandable--muted {
          color: rgba(203, 213, 225, 0.62);
        }

        .entry-viewer-more-button {
          display: inline-flex;
          align-items: center;
          margin-left: 6px;
          padding: 0;
          border: 0;
          color: #86efac;
          background: transparent;
          font: inherit;
          font-weight: 1000;
          cursor: pointer;
        }

        .entry-viewer-info-card--wide {
          grid-column: 1 / -1;
        }

        .entry-viewer-description-card {
          display: grid;
          gap: 8px;
          padding: 14px 15px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 20px;
          color: rgba(241, 245, 249, 0.9);
          background: rgba(15, 23, 42, 0.45);
        }

        .entry-viewer-description {
          color: rgba(241, 245, 249, 0.9);
          font-size: 15px;
          line-height: 1.62;
        }

        .entry-viewer-description.entry-viewer-expandable--muted {
          color: rgba(203, 213, 225, 0.62);
        }

        .entry-viewer-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 2px;
        }

        .entry-viewer-action {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 15px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 999px;
          color: #f8fafc;
          background: rgba(30, 41, 59, 0.78);
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
        }

        .entry-viewer-action--primary {
          border-color: rgba(34, 197, 94, 0.32);
          color: #dcfce7;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.34), rgba(14, 165, 233, 0.28));
        }

        .entry-viewer-action--danger {
          border-color: rgba(248, 113, 113, 0.38);
          color: #fecaca;
          background: rgba(127, 29, 29, 0.34);
        }

        .entry-viewer-action--icon {
          width: 44px;
          min-width: 44px;
          padding-inline: 0;
          border-color: rgba(94, 234, 212, 0.28);
          color: #bbf7d0;
          background: rgba(15, 118, 110, 0.16);
        }

        .entry-viewer-repost-icon {
          width: 20px;
          height: 20px;
          display: block;
        }

        .entry-viewer-action:disabled {
          opacity: 0.55;
          cursor: default;
        }

        @media (max-width: 780px) {
          .entry-viewer-backdrop {
            padding: 0;
          }

          .entry-viewer {
            width: 100%;
            height: 100dvh;
            max-height: 100dvh;
            border-width: 0;
            border-radius: 0;
          }

          .entry-viewer-header {
            min-height: 58px;
            padding: max(8px, env(safe-area-inset-top)) 10px 9px;
          }

          .entry-viewer-header-title {
            font-size: 12px;
          }

          .entry-viewer-close {
            width: 40px;
            height: 40px;
            font-size: 0;
          }

          .entry-viewer-close::before {
            content: "←";
            font-size: 24px;
            line-height: 1;
          }

          .entry-viewer-scroll {
            padding: 10px 10px calc(18px + env(safe-area-inset-bottom));
          }

          .entry-viewer-content {
            gap: 11px;
          }

          .entry-viewer-hero {
            height: min(44dvh, 360px);
            min-height: 230px;
            border-radius: 18px;
          }

          .entry-viewer-thumbs {
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 6px;
          }

          .entry-viewer-thumb {
            border-radius: 12px;
          }

          .entry-viewer-panel {
            gap: 10px;
            padding: 10px;
            border-radius: 20px;
          }

          .entry-viewer-title-card,
          .entry-viewer-description-card {
            padding: 12px;
            border-radius: 17px;
          }

          .entry-viewer-title {
            font-size: 24px;
          }

          .entry-viewer-author {
            padding: 10px;
            border-radius: 18px;
          }

          .entry-viewer-author-avatar {
            width: 46px;
            height: 46px;
            flex-basis: 46px;
          }

          .entry-viewer-info-grid {
            gap: 8px;
          }

          .entry-viewer-info-card {
            padding: 10px 11px;
            border-radius: 16px;
          }

          .entry-viewer-info-open-hint {
            top: 8px;
            right: 9px;
            padding: 2px 7px;
            font-size: 9px;
          }

          .entry-viewer-info-button .entry-viewer-value {
            padding-right: 65px;
          }

          .entry-viewer-value,
          .entry-viewer-info-card strong,
          .entry-viewer-info-button strong {
            font-size: 13px;
          }

          .entry-viewer-description {
            font-size: 14px;
            line-height: 1.56;
          }

          .entry-viewer-actions {
            justify-content: flex-start;
          }

          .entry-viewer-action:not(.entry-viewer-action--icon) {
            min-height: 40px;
            padding: 9px 12px;
          }
        }
      `}</style>

      <article className="entry-viewer" onClick={(event) => event.stopPropagation()}>
        <header className="entry-viewer-header">
          <span className="entry-viewer-header-title">{sourceLabel}</span>
          <button className="entry-viewer-close" type="button" onClick={closeDetails} aria-label="Закрыть">×</button>
        </header>

        <div className="entry-viewer-scroll">
          <div className="entry-viewer-content">
            <div className="entry-viewer-media-block">
              {media.length > 0 ? (
                <>
                  <button className="entry-viewer-hero" type="button" onClick={() => openFullscreen(0)} aria-label="Открыть фото на весь экран">
                    {media[0].mediaType === "video" ? (
                      <video src={getSafeAppFileUrl(media[0].url)} preload="metadata" muted playsInline />
                    ) : (
                      <img src={getSafeAppFileUrl(media[0].url)} alt={entry.title || "Фото записи"} loading="lazy" decoding="async" />
                    )}
                    {media.length > 1 && <span className="entry-viewer-counter">1 / {media.length}</span>}
                  </button>

                  {media.length > 1 && (
                    <div className="entry-viewer-thumbs">
                      {media.slice(0, 5).map((item, index) => {
                        const isVideo = item.mediaType === "video";
                        const safeUrl = getSafeAppFileUrl(item.url);
                        const hiddenCount = media.length - 5;

                        return (
                          <button
                            key={item.id}
                            className="entry-viewer-thumb"
                            type="button"
                            onClick={() => openFullscreen(index)}
                            aria-label={`Открыть медиа ${index + 1}`}
                          >
                            {isVideo ? (
                              <video src={safeUrl} preload="metadata" muted playsInline />
                            ) : (
                              <img src={safeUrl} alt="Миниатюра записи" loading="lazy" decoding="async" />
                            )}
                            {index === 4 && hiddenCount > 0 && <span className="entry-viewer-thumb-more">+{hiddenCount}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="entry-viewer-no-media">Фото не добавлено</div>
              )}
            </div>

            <section className="entry-viewer-panel">
              <div className="entry-viewer-title-card">
                <span className="entry-viewer-kicker">Название записи</span>
                <h2 className="entry-viewer-title">{entry.title || "Запись о рыбалке"}</h2>
              </div>

              {showAuthor && (
                <button
                  type="button"
                  className={["entry-viewer-author", canOpenAuthor ? "entry-viewer-author-button" : ""].filter(Boolean).join(" ")}
                  onClick={handleOpenAuthor}
                  disabled={!canOpenAuthor}
                  title={canOpenAuthor ? "Открыть профиль автора" : undefined}
                >
                  <div className="entry-viewer-author-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt={authorName} loading="lazy" decoding="async" /> : <span>{getInitials(authorName)}</span>}
                  </div>
                  <div className="entry-viewer-author-text">
                    <strong>{authorName}</strong>
                    {publishedDate && <span>Опубликовано {publishedDate}</span>}
                  </div>
                </button>
              )}

              <div className="entry-viewer-description-card">
                <span className="entry-viewer-description-label">Описание</span>
                {entry.description ? (
                  <ExpandableValue className="entry-viewer-description" value={entry.description} limit={520} />
                ) : (
                  <ExpandableValue className="entry-viewer-description" value="" empty="Описание не заполнено." limit={520} muted />
                )}
              </div>

              <div className="entry-viewer-info-grid">
                <InfoCard label="Время рыбалки">
                  <div className="entry-viewer-value">📅 {getFishingRange(entry)}</div>
                </InfoCard>

                <InfoCard
                  label="Место"
                  asButton={canOpenMap}
                  onClick={() => handleAction(onOpenMap)}
                  title={canOpenMap ? "Открыть место на карте" : undefined}
                >
                  <div className="entry-viewer-value">📍 {entry.locationName || "Не указано"}</div>
                </InfoCard>

                <InfoCard label="Улов">
                  <div className="entry-viewer-value">🐟 {getCatchLabel(entry)}</div>
                </InfoCard>

                <InfoCard label="Наживка">
                  <ExpandableValue className="entry-viewer-value" value={entry.bait ? `🪱 ${entry.bait}` : ""} empty="Не указана" limit={130} />
                </InfoCard>

                {entry.weatherSummary && (
                  <InfoCard
                    label="Погода"
                    wide
                    asButton={canOpenWeather}
                    onClick={() => handleAction(onOpenWeather)}
                    title={canOpenWeather ? "Открыть прогноз на дату рыбалки" : undefined}
                  >
                    <div className="entry-viewer-value">🌤 {entry.weatherSummary}</div>
                  </InfoCard>
                )}
              </div>

              <div className="entry-viewer-actions">
                {showFeedAction && canOpenFeed && (
                  <ActionButton primary onClick={() => handleAction(onOpenFeed)}>Открыть в ленте</ActionButton>
                )}
                {showShareAction && canShare && (
                  <ActionButton iconOnly onClick={() => handleAction(onShare)} title="Поделиться в чат">
                    <RepostIcon />
                  </ActionButton>
                )}
                {isAdmin && typeof onAdminDelete === "function" && (
                  <ActionButton danger onClick={() => handleAction(onAdminDelete)}>Удалить</ActionButton>
                )}
              </div>
            </section>
          </div>
        </div>
      </article>

      {fullscreenViewer && (
        <MediaLightbox viewer={fullscreenViewer} onClose={() => setFullscreenViewer(null)} />
      )}
    </div>
  );

  return createPortal(node, document.body);
}
