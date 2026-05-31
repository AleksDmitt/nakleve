import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSafeAppFileUrl, getSafePreviewUrl } from "../utils/safeUrl.js";

function inferMediaType(item) {
  const explicitType = String(item?.mediaType || item?.type || item?.attachmentType || "").toLowerCase();
  if (explicitType.includes("video")) return "video";
  if (explicitType.includes("image") || explicitType.includes("photo")) return "image";

  const rawUrl = String(item?.safeUrl || item?.url || item?.fileUrl || item?.photoUrl || "");
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(rawUrl) ? "video" : "image";
}

function resolveMediaUrl(item) {
  const rawUrl = item?.safeUrl || item?.url || item?.fileUrl || item?.photoUrl || "";
  if (!rawUrl) return "";

  if (String(rawUrl).startsWith("blob:")) {
    return getSafePreviewUrl(rawUrl, "");
  }

  return getSafeAppFileUrl(rawUrl, "");
}

function normalizeMediaList(media) {
  if (!Array.isArray(media)) return [];

  return media
    .map((item, index) => {
      const url = resolveMediaUrl(item);
      if (!url) return null;

      return {
        id: item?.id || item?.url || item?.safeUrl || `media-${index}`,
        url,
        mediaType: inferMediaType(item),
      };
    })
    .filter(Boolean);
}

export default function MediaLightbox({ viewer, onClose }) {
  const media = useMemo(() => normalizeMediaList(viewer?.media), [viewer?.media]);
  const [activeIndex, setActiveIndex] = useState(viewer?.initialIndex || 0);
  const touchStartRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const nextIndex = Number.isFinite(viewer?.initialIndex) ? viewer.initialIndex : 0;
    setActiveIndex(Math.min(Math.max(0, nextIndex), Math.max(0, media.length - 1)));
  }, [viewer?.initialIndex, media.length]);

  useEffect(() => {
    if (!viewer || media.length === 0) return undefined;

    function stopMediaViewerHotkey(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        stopMediaViewerHotkey(event);
        onClose?.();
        return;
      }

      if (event.key === "ArrowLeft" && media.length > 1) {
        stopMediaViewerHotkey(event);
        setActiveIndex((current) => (current - 1 + media.length) % media.length);
        return;
      }

      if (event.key === "ArrowRight" && media.length > 1) {
        stopMediaViewerHotkey(event);
        setActiveIndex((current) => (current + 1) % media.length);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    document.documentElement.classList.add("media-lightbox-open");
    document.body.classList.add("media-lightbox-open");
    closeButtonRef.current?.focus?.();

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.documentElement.classList.remove("media-lightbox-open");
      document.body.classList.remove("media-lightbox-open");
    };
  }, [media.length, onClose, viewer]);

  if (!viewer || media.length === 0) return null;

  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const isVideo = active?.mediaType === "video";

  function goPrevious(event) {
    event?.stopPropagation();
    if (media.length <= 1) return;
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  }

  function goNext(event) {
    event?.stopPropagation();
    if (media.length <= 1) return;
    setActiveIndex((current) => (current + 1) % media.length);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: event.timeStamp,
    };
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches?.[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (!touch || !start || media.length <= 1) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const duration = event.timeStamp - start.time;

    if (duration > 900 || Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy) * 1.25) return;

    if (dx < 0) {
      goNext(event);
    } else {
      goPrevious(event);
    }
  }

  const node = (
    <div className="media-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр медиа" onClick={(event) => event.stopPropagation()}>
      <style>{`
        html.media-lightbox-open,
        body.media-lightbox-open {
          overflow: hidden;
          touch-action: none;
        }

        .media-lightbox {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          min-height: 100dvh;
          color: #f8fafc;
          background:
            radial-gradient(circle at 18% 0%, rgba(34, 197, 94, 0.12), transparent 30%),
            radial-gradient(circle at 82% 100%, rgba(14, 165, 233, 0.12), transparent 28%),
            rgba(2, 6, 23, 0.97);
          backdrop-filter: blur(14px);
        }

        .media-lightbox__topbar {
          position: relative;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: max(14px, env(safe-area-inset-top)) 18px 12px;
          pointer-events: none;
        }

        .media-lightbox__counter {
          min-width: 58px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          color: rgba(248, 250, 252, 0.86);
          background: rgba(15, 23, 42, 0.58);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24);
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
          backdrop-filter: blur(10px);
          pointer-events: auto;
        }

        .media-lightbox__close {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.64);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
          cursor: pointer;
          backdrop-filter: blur(10px);
          pointer-events: auto;
          transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
        }

        .media-lightbox__close:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.24);
          background: rgba(30, 41, 59, 0.74);
        }

        .media-lightbox__close svg {
          width: 20px;
          height: 20px;
          display: block;
        }

        .media-lightbox__stage {
          position: relative;
          min-width: 0;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 74px 22px;
          overflow: hidden;
          touch-action: pan-y;
        }

        .media-lightbox__media {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          display: block;
          object-fit: contain;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.24);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
          user-select: none;
        }

        video.media-lightbox__media {
          width: min(100%, 1120px);
          height: min(100%, 72dvh);
        }

        .media-lightbox__nav {
          position: absolute;
          top: 50%;
          z-index: 3;
          width: 46px;
          height: 58px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.58);
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.28);
          cursor: pointer;
          transform: translateY(-50%);
          backdrop-filter: blur(10px);
          transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
        }

        .media-lightbox__nav:hover {
          transform: translateY(-50%) scale(1.03);
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(30, 41, 59, 0.72);
        }

        .media-lightbox__nav svg {
          width: 26px;
          height: 26px;
          display: block;
        }

        .media-lightbox__nav--prev {
          left: 18px;
        }

        .media-lightbox__nav--next {
          right: 18px;
        }

        .media-lightbox__thumbs {
          position: relative;
          z-index: 3;
          display: flex;
          gap: 8px;
          max-width: min(100%, 980px);
          margin: 0 auto;
          padding: 10px 18px max(16px, env(safe-area-inset-bottom));
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          scrollbar-color: rgba(94, 234, 212, 0.64) rgba(15, 23, 42, 0.38);
        }

        .media-lightbox__thumbs::-webkit-scrollbar {
          height: 8px;
        }

        .media-lightbox__thumbs::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.38);
          border-radius: 999px;
        }

        .media-lightbox__thumbs::-webkit-scrollbar-thumb {
          background: linear-gradient(90deg, rgba(94, 234, 212, 0.62), rgba(103, 232, 249, 0.62));
          border-radius: 999px;
        }

        .media-lightbox__thumb {
          width: 54px;
          height: 54px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          padding: 0;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          overflow: hidden;
          color: #e0f2fe;
          background: rgba(15, 23, 42, 0.54);
          cursor: pointer;
          opacity: 0.72;
          transition: opacity 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
        }

        .media-lightbox__thumb:hover,
        .media-lightbox__thumb.is-active {
          opacity: 1;
          border-color: rgba(94, 234, 212, 0.82);
          transform: translateY(-1px);
        }

        .media-lightbox__thumb img,
        .media-lightbox__thumb video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .media-lightbox__video-icon {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(103, 232, 249, 0.16);
        }

        @media (max-width: 760px) {
          .media-lightbox {
            background: #020617;
          }

          .media-lightbox__topbar {
            padding: max(10px, env(safe-area-inset-top)) 12px 8px;
          }

          .media-lightbox__counter {
            min-width: 48px;
            padding: 7px 10px;
            font-size: 12px;
          }

          .media-lightbox__close {
            width: 40px;
            height: 40px;
          }

          .media-lightbox__stage {
            padding: 4px 0 14px;
          }

          .media-lightbox__media {
            max-width: 100%;
            max-height: 100%;
            border-radius: 0;
            box-shadow: none;
          }

          video.media-lightbox__media {
            width: 100%;
            height: auto;
            max-height: 100%;
          }

          .media-lightbox__nav {
            display: none;
          }

          .media-lightbox__thumbs {
            padding: 8px 12px max(12px, env(safe-area-inset-bottom));
          }

          .media-lightbox__thumb {
            width: 46px;
            height: 46px;
            border-radius: 12px;
          }
        }
      `}</style>

      <div className="media-lightbox__topbar">
        <span className="media-lightbox__counter">
          {media.length > 1 ? `${activeIndex + 1} / ${media.length}` : "1 / 1"}
        </span>

        <button ref={closeButtonRef} type="button" className="media-lightbox__close" onClick={onClose} aria-label="Закрыть">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="media-lightbox__stage"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {media.length > 1 && (
          <button type="button" className="media-lightbox__nav media-lightbox__nav--prev" onClick={goPrevious} aria-label="Предыдущее медиа">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {isVideo ? (
          <video key={active.url} className="media-lightbox__media" src={active.url} controls playsInline preload="metadata" />
        ) : (
          <img key={active.url} className="media-lightbox__media" src={active.url} alt="Медиа" draggable="false" />
        )}

        {media.length > 1 && (
          <button type="button" className="media-lightbox__nav media-lightbox__nav--next" onClick={goNext} aria-label="Следующее медиа">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {media.length > 1 && (
        <div className="media-lightbox__thumbs" aria-label="Миниатюры медиа">
          {media.map((item, index) => (
            <button
              key={item.id || item.url}
              type="button"
              className={`media-lightbox__thumb${index === activeIndex ? " is-active" : ""}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Открыть медиа ${index + 1}`}
            >
              {item.mediaType === "video" ? (
                <span className="media-lightbox__video-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
                    <path d="M9 7.5v9l7-4.5-7-4.5Z" fill="currentColor" />
                  </svg>
                </span>
              ) : (
                <img src={item.url} alt="" loading="lazy" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
