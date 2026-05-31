import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MediaLightbox from "../MediaLightbox";
import {
  formatFileSize,
  formatMessageTime,
  getInitials,
  shortenText,
} from "../../utils/chatHelpers";
import {
  getSafeAppFileUrl,
  getSafeImageUrl,
  getSafePreviewUrl,
  getSafeOptimizedImageUrl,
} from "../../utils/safeUrl.js";

function formatFishingEntryDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getSharedCatchLabel(entry) {
  const parts = [];
  if (entry?.catchType) parts.push(entry.catchType);
  if (entry?.catchWeight != null) parts.push(`${entry.catchWeight} кг`);
  return parts.length > 0 ? parts.join(" · ") : "Улов не указан";
}


const MESSAGE_COLLAPSE_LIMIT = 720;

function getMessageHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "#";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function splitLinkedText(text) {
  const value = String(text || "");
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    let urlText = match[0];
    let trailing = "";

    while (/[.,!?;:)\]]$/.test(urlText)) {
      trailing = urlText.slice(-1) + trailing;
      urlText = urlText.slice(0, -1);
    }

    if (urlText) {
      parts.push({ type: "link", value: urlText, href: getMessageHref(urlText) });
    }

    if (trailing) {
      parts.push({ type: "text", value: trailing });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts;
}

function ChatLinkedText({ text }) {
  return splitLinkedText(text).map((part, index) => {
    if (part.type !== "link") {
      return <span key={`text-${index}`}>{part.value}</span>;
    }

    return (
      <a
        key={`link-${index}`}
        className="chat-message-link"
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {part.value}
      </a>
    );
  });
}

function CollapsibleMessageText({ messageId, text, isExpanded, onToggle }) {
  const value = String(text || "");
  const shouldCollapse = value.length > MESSAGE_COLLAPSE_LIMIT;
  const visibleText = shouldCollapse && !isExpanded
    ? `${value.slice(0, MESSAGE_COLLAPSE_LIMIT).trimEnd()}...`
    : value;

  return (
    <div className="chat-message-text">
      <ChatLinkedText text={visibleText} />
      {shouldCollapse && (
        <button
          type="button"
          className="chat-message-more-button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(messageId);
          }}
        >
          {isExpanded ? "свернуть" : "далее"}
        </button>
      )}
    </div>
  );
}

function normalizeSharedEntryMedia(entry) {
  const media = Array.isArray(entry?.media) ? entry.media : [];
  const normalized = media
    .map((item, index) => ({
      id: item.id || item.url || `shared-media-${index}`,
      url: item.url || item.fileUrl || item.photoUrl,
      mediaType: String(item.mediaType || item.type || "image").toLowerCase().startsWith("video") ? "video" : "image",
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
    }))
    .filter((item) => item.url)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (normalized.length === 0 && entry?.photoUrl) {
    normalized.push({
      id: `shared-photo-${entry.photoUrl}`,
      url: entry.photoUrl,
      mediaType: "image",
      sortOrder: 0,
    });
  }

  return normalized;
}

function SharedFishingEntryDetailsModal({ entry, onClose, onOpenMedia }) {
  if (!entry) return null;

  const media = normalizeSharedEntryMedia(entry);
  const date = entry.fishingStartedAt || entry.fishingDate;

  return (
    <div className="chat-shared-entry-backdrop" onClick={onClose}>
      <article className="chat-shared-entry-modal" onClick={(event) => event.stopPropagation()}>
        <header className="chat-shared-entry-header">
          <div>
            <p>Запись из чата</p>
            <h2>{entry.title || "Рыбалка без названия"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        {media.length > 0 && (
          <div className="chat-shared-entry-media-grid">
            {media.slice(0, 4).map((item, index) => {
              const safeUrl = getSafeAppFileUrl(item.url);
              const isVideo = item.mediaType === "video";

              return (
                <button
                  key={item.id}
                  type="button"
                  className="chat-shared-entry-media"
                  onClick={() => onOpenMedia(media, index)}
                >
                  {safeUrl && isVideo ? (
                    <video src={safeUrl} preload="metadata" muted playsInline />
                  ) : (
                    safeUrl && <img src={safeUrl} alt="Медиа записи" loading="lazy" decoding="async" />
                  )}
                  {index === 3 && media.length > 4 && (
                    <span>+{media.length - 4}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="chat-shared-entry-info-grid">
          <div>
            <span>Автор</span>
            <strong>{entry.userName || "Рыбак"}</strong>
          </div>
          <div>
            <span>Дата</span>
            <strong>{formatFishingEntryDate(date)}</strong>
          </div>
          <div>
            <span>Место</span>
            <strong>{entry.locationName || "Не указано"}</strong>
          </div>
          <div>
            <span>Улов</span>
            <strong>{getSharedCatchLabel(entry)}</strong>
          </div>
        </div>

        {entry.weatherSummary && (
          <p className="chat-shared-entry-chip">☁ {entry.weatherSummary}</p>
        )}

        {entry.description && (
          <p className="chat-shared-entry-description">{entry.description}</p>
        )}

        <div className="chat-shared-entry-meta">
          {entry.bait && <span>Наживка: {entry.bait}</span>}
          {entry.visibility === 0 || entry.visibility === "Private" ? <span>Приватная запись</span> : null}
        </div>
      </article>
    </div>
  );
}


function ChatFullscreenMediaViewer({ viewer, onClose }) {
  const [activeIndex, setActiveIndex] = useState(viewer?.initialIndex || 0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    if (!viewer) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => Math.max(0, current - 1));
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) => Math.min((viewer.media?.length || 1) - 1, current + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("chat-fullscreen-open");
    document.documentElement.classList.add("chat-fullscreen-open");

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("chat-fullscreen-open");
      document.documentElement.classList.remove("chat-fullscreen-open");
    };
  }, [onClose, viewer]);

  if (!viewer?.media?.length) return null;

  const media = viewer.media;
  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const safeUrl = active?.safeUrl;
  const isVideo = active?.mediaType === "video";

  function goPrevious(event) {
    event?.stopPropagation();
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  }

  function goNext(event) {
    event?.stopPropagation();
    setActiveIndex((current) => (current + 1) % media.length);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches?.[0];
    const start = touchStartRef.current;

    touchStartRef.current = null;

    if (!touch || !start || media.length <= 1) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) {
      goNext(event);
    } else {
      goPrevious(event);
    }
  }

  return (
    <div className="chat-fullscreen-backdrop" onClick={onClose}>
      <div className="chat-fullscreen-viewer" onClick={(event) => event.stopPropagation()}>
        <div className="chat-fullscreen-topbar">
          <div>
            <strong>Медиа</strong>
            <span>{media.length > 1 ? `${activeIndex + 1} / ${media.length}` : ""}</span>
          </div>

          <button type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div
          className="chat-fullscreen-media-wrap"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {safeUrl && isVideo ? (
            <video className="chat-fullscreen-media" src={safeUrl} controls playsInline preload="metadata" />
          ) : (
            safeUrl && <img className="chat-fullscreen-media" src={safeUrl} alt="Медиа из чата" />
          )}

          {media.length > 1 && (
            <>
              <button type="button" className="chat-fullscreen-nav prev" onClick={goPrevious} aria-label="Предыдущее медиа">
                ‹
              </button>
              <button type="button" className="chat-fullscreen-nav next" onClick={goNext} aria-label="Следующее медиа">
                ›
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const FEED_PAGE_ROUTE_FALLBACK = "/feed";

function getFeedPageRoute() {
  return localStorage.getItem("fishingAppFeedRoute") || FEED_PAGE_ROUTE_FALLBACK;
}

function formatVoiceDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseVoiceWaveform(value) {
  if (Array.isArray(value)) {
    return value.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      }
    } catch {
      // Формат старых сообщений: "12,34,56".
    }

    return value
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x));
  }

  return [];
}

function getVoiceWaveformBars(value) {
  const parsed = parseVoiceWaveform(value);

  if (parsed.length > 0) {
    return parsed.slice(0, 40).map((x) => Math.max(10, Math.min(100, x)));
  }

  return Array.from({ length: 34 }, (_, index) => {
    const wave = Math.sin((index + 1) * 1.65) * 0.5 + 0.5;
    return Math.round(20 + wave * 58);
  });
}

function VoiceMessageAttachment({ attachment, safeFileUrl, isMine, isDisabled }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(attachment.voiceDurationMs || 0);
  const bars = getVoiceWaveformBars(attachment.voiceWaveform);
  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const activeBars = Math.round(progress * bars.length);

  function togglePlayback(event) {
    event.stopPropagation();

    const audio = audioRef.current;
    if (!audio || !safeFileUrl || isDisabled) return;

    if (audio.paused) {
      audio.play().catch(() => {});
      return;
    }

    audio.pause();
  }

  return (
    <div
      style={{
        width: "min(100%, 360px)",
        display: "grid",
        gridTemplateColumns: "42px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "16px",
        color: "#fff",
        background: isMine
          ? "linear-gradient(135deg, rgba(37,99,235,0.38), rgba(20,184,166,0.22))"
          : "rgba(15, 23, 42, 0.72)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <button
        type="button"
        onClick={togglePlayback}
        disabled={!safeFileUrl || isDisabled}
        style={{
          width: "42px",
          height: "42px",
          padding: 0,
          border: 0,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "#052e16",
          background: "linear-gradient(135deg, #86efac, #5eead4)",
          cursor: safeFileUrl && !isDisabled ? "pointer" : "not-allowed",
          fontSize: "16px",
          fontWeight: 1000,
          flexShrink: 0,
        }}
        title={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>

      <div style={{ minWidth: 0, display: "grid", gap: "6px" }}>
        <div
          style={{
            height: "32px",
            display: "flex",
            alignItems: "center",
            gap: "3px",
            overflow: "hidden",
          }}
        >
          {bars.map((bar, index) => (
            <span
              key={`${attachment.id}-bar-${index}`}
              style={{
                width: "3px",
                height: `${Math.max(6, Math.round((bar / 100) * 30))}px`,
                borderRadius: "999px",
                background: index < activeBars
                  ? "rgba(134, 239, 172, 0.95)"
                  : "rgba(226, 232, 240, 0.36)",
                flex: "0 0 3px",
              }}
            />
          ))}
        </div>

        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: "12px", fontWeight: 800 }}>
          Голосовое сообщение
        </div>
      </div>

      <div style={{ color: "rgba(226,232,240,0.84)", fontSize: "12px", fontWeight: 900 }}>
        {formatVoiceDuration(durationMs || attachment.voiceDurationMs)}
      </div>

      {safeFileUrl && (
        <audio
          ref={audioRef}
          src={safeFileUrl}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const nextDuration = Number(event.currentTarget.duration);
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
              setDurationMs(Math.round(nextDuration * 1000));
            }
          }}
          onTimeUpdate={(event) => {
            setCurrentMs(Math.round(Number(event.currentTarget.currentTime || 0) * 1000));
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentMs(0);
          }}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}

export default function ChatMessagesList({
  loadingMessages,
  messages,
  messageItems,
  user,
  hoveredMessageId,
  highlightedMessageId,
  setHoveredMessageId,
  handleTouchStart,
  handleTouchEnd,
  startReply,
  handleContextMenu,
  goToUserProfile,
  onReplyPreviewClick,
  messageRefs,
  messagesEndRef,
  scrollRequest,
  onVisibleReadBoundary,
}) {
  const navigate = useNavigate();
  const touchReplyRef = useRef(null);
  const lastTapReplyRef = useRef(null);
  const [replySwipe, setReplySwipe] = useState({ messageId: null, offset: 0 });
  const [mediaViewer, setMediaViewer] = useState(null);
  const [sharedEntryViewer, setSharedEntryViewer] = useState(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState({});
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessagesBelowCount, setNewMessagesBelowCount] = useState(0);
  const scrollContainerRef = useRef(null);
  const isNearLatestRef = useRef(true);
  const previousLastMessageIdRef = useRef(null);
  const handledScrollRequestKeyRef = useRef(null);
  const readBoundaryTimerRef = useRef(null);
  const lastReportedReadBoundaryIdRef = useRef(null);

  function findLastVisibleMessage() {
    const container = scrollContainerRef.current;
    if (!container || !Array.isArray(messages) || messages.length === 0) return null;

    const containerRect = container.getBoundingClientRect();
    const topLimit = containerRect.top + 18;
    const bottomLimit = containerRect.bottom - 26;
    let candidate = null;

    for (const msg of messages) {
      if (!msg?.id) continue;

      const node = messageRefs.current?.[msg.id];
      if (!node || !node.isConnected) continue;

      const rect = node.getBoundingClientRect();
      const isVisible = rect.bottom > topLimit && rect.top < bottomLimit;
      if (!isVisible) continue;

      const visibleBottom = Math.min(rect.bottom, bottomLimit);
      const visibleTop = Math.max(rect.top, topLimit);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const ratio = rect.height > 0 ? visibleHeight / rect.height : 0;

      if (ratio >= 0.35 || rect.height <= 80) {
        candidate = msg;
      }
    }

    return candidate;
  }

  function reportVisibleReadBoundary() {
    if (loadingMessages || typeof onVisibleReadBoundary !== "function") return;

    const candidate = findLastVisibleMessage();
    if (!candidate?.id) return;
    if (lastReportedReadBoundaryIdRef.current === candidate.id) return;

    lastReportedReadBoundaryIdRef.current = candidate.id;
    onVisibleReadBoundary(candidate);
  }

  function scheduleVisibleReadBoundary(delay = 140) {
    if (typeof window === "undefined") return;

    window.clearTimeout(readBoundaryTimerRef.current);
    readBoundaryTimerRef.current = window.setTimeout(reportVisibleReadBoundary, delay);
  }

  function updateJumpToLatestVisibility() {
    const el = scrollContainerRef.current;
    if (!el) {
      isNearLatestRef.current = true;
      setShowJumpToLatest(false);
      return;
    }

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearLatest = distanceToBottom <= 120;

    isNearLatestRef.current = isNearLatest;
    setShowJumpToLatest(distanceToBottom > 220);

    if (isNearLatest) {
      setNewMessagesBelowCount(0);
    }

    scheduleVisibleReadBoundary(isNearLatest ? 80 : 160);
  }

  function scrollToLatestMessage(options = {}) {
    const { behavior = "smooth" } = options;
    const el = scrollContainerRef.current;

    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    }

    isNearLatestRef.current = true;
    setNewMessagesBelowCount(0);
    window.setTimeout(updateJumpToLatestVisibility, behavior === "smooth" ? 220 : 40);
    window.setTimeout(reportVisibleReadBoundary, behavior === "smooth" ? 260 : 80);
  }

  function jumpToLatestMessage() {
    scrollToLatestMessage({ behavior: "smooth" });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateJumpToLatestVisibility();
      scheduleVisibleReadBoundary(80);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [messages.length, loadingMessages]);

  useEffect(() => {
    lastReportedReadBoundaryIdRef.current = null;
  }, [scrollRequest?.key]);

  useEffect(() => {
    return () => {
      window.clearTimeout(readBoundaryTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!scrollRequest?.key || loadingMessages) return undefined;

    // Важно: первичный скролл при открытии чата должен выполниться только один раз.
    // Раньше эффект зависел от messageItems.length и повторно срабатывал при каждом новом
    // сообщении, из-за чего пользователя кидало вниз/к первому непрочитанному, даже если
    // он спокойно читал историю выше.
    if (handledScrollRequestKeyRef.current === scrollRequest.key) {
      return undefined;
    }

    let cancelled = false;
    let frameId = 0;

    function scrollToRequestedPosition(attempt = 0) {
      if (cancelled) return;

      const container = scrollContainerRef.current;
      if (!container) {
        if (attempt < 16) {
          frameId = window.requestAnimationFrame(() => scrollToRequestedPosition(attempt + 1));
        }
        return;
      }

      if (scrollRequest.mode === "first-unread" && scrollRequest.targetMessageId) {
        const targetNode = messageRefs.current?.[scrollRequest.targetMessageId];

        if (targetNode && targetNode.isConnected) {
          const containerRect = container.getBoundingClientRect();
          const targetRect = targetNode.getBoundingClientRect();
          const topOffset = Math.max(28, Math.min(140, container.clientHeight * 0.22));
          const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - topOffset;

          const finalTop = Math.max(0, nextTop);

          container.scrollTo({
            top: finalTop,
            behavior: "auto",
          });

          const distanceToBottom = container.scrollHeight - finalTop - container.clientHeight;
          const isNearLatest = distanceToBottom <= 120;
          isNearLatestRef.current = isNearLatest;
          setShowJumpToLatest(distanceToBottom > 220);

          handledScrollRequestKeyRef.current = scrollRequest.key;
          previousLastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
          setNewMessagesBelowCount(0);
          window.setTimeout(updateJumpToLatestVisibility, 40);
          window.setTimeout(reportVisibleReadBoundary, 100);
          return;
        }

        if (attempt < 16) {
          frameId = window.requestAnimationFrame(() => scrollToRequestedPosition(attempt + 1));
          return;
        }
      }

      handledScrollRequestKeyRef.current = scrollRequest.key;
      previousLastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
      scrollToLatestMessage({ behavior: "auto" });
    }

    frameId = window.requestAnimationFrame(() => scrollToRequestedPosition());

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [scrollRequest?.key, scrollRequest?.mode, scrollRequest?.targetMessageId, loadingMessages, messageItems.length]);

  useLayoutEffect(() => {
    if (loadingMessages) return;

    const lastMessage = messages[messages.length - 1] || null;
    const lastMessageId = lastMessage?.id ?? null;

    if (!lastMessageId) {
      previousLastMessageIdRef.current = null;
      setNewMessagesBelowCount(0);
      return;
    }

    if (scrollRequest?.key && handledScrollRequestKeyRef.current !== scrollRequest.key) {
      previousLastMessageIdRef.current = lastMessageId;
      setNewMessagesBelowCount(0);
      return;
    }

    const previousLastMessageId = previousLastMessageIdRef.current;
    if (!previousLastMessageId || previousLastMessageId === lastMessageId) {
      previousLastMessageIdRef.current = lastMessageId;
      return;
    }

    const previousIndex = messages.findIndex((msg) => msg.id === previousLastMessageId);
    const appendedMessages = previousIndex >= 0 ? messages.slice(previousIndex + 1) : [lastMessage];

    previousLastMessageIdRef.current = lastMessageId;

    if (appendedMessages.length === 0) return;

    const hasOwnNewMessage = appendedMessages.some((msg) => String(msg.userId || "") === String(user?.id || ""));
    const container = scrollContainerRef.current;
    const distanceToBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight
      : 0;

    // Важно: после добавления нового сообщения scrollHeight уже увеличился.
    // Если считать близость к низу только по текущему distanceToBottom, пользователь,
    // который до прихода сообщения был прямо внизу, может внезапно стать "не внизу"
    // на высоту нового сообщения. Поэтому берем состояние ДО изменения списка из ref.
    const wasNearLatestBeforeAppend = isNearLatestRef.current === true;
    const isStillNearLatestAfterAppend = distanceToBottom <= 96;

    if (hasOwnNewMessage || wasNearLatestBeforeAppend || isStillNearLatestAfterAppend) {
      scrollToLatestMessage({ behavior: "smooth" });
      return;
    }

    const incomingCount = appendedMessages.filter((msg) => String(msg.userId || "") !== String(user?.id || "")).length;

    if (incomingCount > 0) {
      setNewMessagesBelowCount((current) => current + incomingCount);
      setShowJumpToLatest(true);
    }
  }, [messages, loadingMessages, scrollRequest?.key, user?.id]);

  function handleMessageTouchStart(event, msg) {
    const touch = event.touches?.[0];

    if (touch) {
      touchReplyRef.current = {
        messageId: msg.id,
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: event.timeStamp,
      };

      if (!msg.isDeletedForAll) {
        setReplySwipe({ messageId: msg.id, offset: 0 });
      }
    }

    handleTouchStart(event, msg);
  }

  function handleMessageTouchMove(event, msg, isMine) {
    const touch = event.touches?.[0];
    const start = touchReplyRef.current;

    if (!touch || !start || start.messageId !== msg.id || msg.isDeletedForAll) {
      return;
    }

    const dx = touch.clientX - start.startX;
    const dy = touch.clientY - start.startY;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      handleTouchEnd();
      setReplySwipe({ messageId: null, offset: 0 });
      return;
    }

    const direction = isMine ? -1 : 1;
    const directedDx = dx * direction;

    if (directedDx <= 0) {
      setReplySwipe({ messageId: msg.id, offset: 0 });
      return;
    }

    if (directedDx > 8 || Math.abs(dx) > 8) {
      handleTouchEnd();
    }

    setReplySwipe({
      messageId: msg.id,
      offset: Math.min(64, directedDx),
    });
  }

  function handleMessageTouchEnd(event, msg, isMine) {
    const touch = event.changedTouches?.[0];
    const start = touchReplyRef.current;

    handleTouchEnd();

    if (!touch || !start || start.messageId !== msg.id || msg.isDeletedForAll) {
      touchReplyRef.current = null;
      setReplySwipe({ messageId: null, offset: 0 });
      return;
    }

    const dx = touch.clientX - start.startX;
    const dy = touch.clientY - start.startY;
    const duration = event.timeStamp - start.startedAt;
    const direction = isMine ? -1 : 1;
    const directedDx = dx * direction;

    touchReplyRef.current = null;
    setReplySwipe({ messageId: null, offset: 0 });

    if (directedDx >= 56 && Math.abs(dy) <= 48 && duration <= 900) {
      lastTapReplyRef.current = null;
      startReply(msg);
      return;
    }

    const isTap = Math.abs(dx) <= 12 && Math.abs(dy) <= 12 && duration <= 300;

    if (!isTap) {
      return;
    }

    const now = event.timeStamp;
    const previousTap = lastTapReplyRef.current;
    const isDoubleTap =
      previousTap &&
      previousTap.messageId === msg.id &&
      now - previousTap.time <= 360 &&
      Math.abs(touch.clientX - previousTap.x) <= 24 &&
      Math.abs(touch.clientY - previousTap.y) <= 24;

    if (isDoubleTap) {
      lastTapReplyRef.current = null;
      startReply(msg);
      return;
    }

    lastTapReplyRef.current = {
      messageId: msg.id,
      time: now,
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function toggleMessageExpanded(messageId) {
    setExpandedMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

  function openSharedFishingEntry(entry) {
    if (entry) {
      setSharedEntryViewer(entry);
      return;
    }

    if (!entry?.id) return;

    const feedRoute = getFeedPageRoute();
    navigate(`${feedRoute}?entry.id=${entry.id}`);
  }

  function openSharedEntryMedia(media, initialIndex) {
    setMediaViewer({
      title: "Медиа записи",
      media: media.map((item) => ({
        id: item.id,
        safeUrl: getSafeAppFileUrl(item.url),
        mediaType: item.mediaType,
      })),
      initialIndex,
    });
  }

  function openMessageMediaViewer(event, media, initialIndex) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!media?.length) return;

    setMediaViewer({
      title: "Медиа из чата",
      media,
      initialIndex,
    });
  }

  return (
    <>
      <style>{`
        @keyframes chatUploadSpin {
          to {
            transform: rotate(360deg);
          }
        }

        html.chat-fullscreen-open,
        body.chat-fullscreen-open {
          overflow: hidden;
        }

        .chat-media-thumb {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          overflow: hidden;
          position: relative;
          padding: 0;
          border-radius: 14px;
          color: #fff;
          cursor: zoom-in;
        }

        .chat-media-thumb:disabled {
          cursor: default;
        }

        .chat-message-read-mark {
          min-width: 22px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: -0.08em;
          color: rgba(226, 232, 240, 0.58);
          background: rgba(15, 23, 42, 0.32);
        }

        .chat-message-read-mark.read {
          color: #67e8f9;
          background: rgba(103, 232, 249, 0.12);
        }


        .chat-message-text {
          white-space: pre-wrap;
          line-height: 1.4;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .chat-message-link {
          color: rgba(147, 197, 253, 0.92);
          font: inherit;
          font-weight: inherit;
          text-decoration: underline;
          text-decoration-color: rgba(147, 197, 253, 0.34);
          text-underline-offset: 2px;
        }

        .chat-message-link:hover {
          color: rgba(219, 234, 254, 0.98);
          text-decoration-color: rgba(219, 234, 254, 0.56);
        }

        .chat-message-more-button {
          display: inline;
          margin-left: 5px;
          padding: 0;
          border: 0;
          color: rgba(203, 213, 225, 0.76);
          background: transparent;
          font: inherit;
          font-weight: inherit;
          cursor: pointer;
        }

        .chat-message-more-button:hover {
          color: rgba(226, 232, 240, 0.96);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 2px;
        }

        .chat-shared-entry-backdrop {
          position: fixed;
          inset: 0;
          z-index: 230;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(2, 6, 23, 0.82);
          backdrop-filter: blur(10px);
        }

        .chat-shared-entry-modal {
          width: min(100%, 760px);
          max-height: min(92dvh, 820px);
          overflow: auto;
          padding: 18px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 24px;
          color: #e5e7eb;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(12, 18, 30, 0.98));
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
        }

        .chat-shared-entry-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }

        .chat-shared-entry-header p {
          margin: 0 0 6px;
          color: #86efac;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .chat-shared-entry-header h2 {
          margin: 0;
          color: #fff;
          font-size: clamp(22px, 3vw, 30px);
          line-height: 1.14;
        }

        .chat-shared-entry-header button {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 999px;
          color: #fff;
          background: rgba(255, 255, 255, 0.06);
          font-size: 26px;
          line-height: 1;
          cursor: pointer;
        }

        .chat-shared-entry-media-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 14px;
        }

        .chat-shared-entry-media {
          position: relative;
          min-height: 180px;
          padding: 0;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 18px;
          background: rgba(2, 6, 23, 0.4);
          cursor: zoom-in;
        }

        .chat-shared-entry-media img,
        .chat-shared-entry-media video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .chat-shared-entry-media span {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: #fff;
          background: rgba(2, 6, 23, 0.54);
          font-size: 28px;
          font-weight: 1000;
        }

        .chat-shared-entry-info-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }

        .chat-shared-entry-info-grid div {
          display: grid;
          gap: 5px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.045);
        }

        .chat-shared-entry-info-grid span,
        .chat-shared-entry-meta {
          color: rgba(203, 213, 225, 0.72);
          font-size: 12px;
          font-weight: 800;
        }

        .chat-shared-entry-info-grid strong {
          color: #f8fafc;
          font-size: 14px;
          line-height: 1.28;
        }

        .chat-shared-entry-chip {
          width: fit-content;
          max-width: 100%;
          margin: 0 0 12px;
          padding: 8px 10px;
          border-radius: 999px;
          color: #dbeafe;
          background: rgba(37, 99, 235, 0.16);
          font-size: 13px;
          font-weight: 800;
        }

        .chat-shared-entry-description {
          margin: 0 0 12px;
          color: rgba(226, 232, 240, 0.86);
          line-height: 1.58;
          white-space: pre-wrap;
        }

        .chat-shared-entry-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chat-shared-entry-meta span {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.055);
        }

        .chat-messages-shell {
          position: relative;
          min-height: 0;
          height: 100%;
          max-height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .chat-jump-to-latest {
          position: absolute;
          left: 50%;
          right: auto;
          bottom: 18px;
          z-index: 8;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 0;
          border: 1px solid rgba(103, 232, 249, 0.28);
          border-radius: 999px;
          color: #dffcff;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 18, 32, 0.94));
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255,255,255,0.04) inset;
          cursor: pointer;
          transform: translateX(-50%);
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }

        .chat-jump-to-latest:hover {
          transform: translateX(-50%) translateY(-2px);
          border-color: rgba(103, 232, 249, 0.48);
          background: linear-gradient(180deg, rgba(20, 32, 54, 0.98), rgba(15, 23, 42, 0.98));
        }

        .chat-jump-to-latest svg {
          width: 22px;
          height: 22px;
          display: block;
          flex-shrink: 0;
          transform: none;
        }

        .chat-jump-to-latest__badge {
          position: absolute;
          top: -7px;
          right: -7px;
          min-width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
          border-radius: 999px;
          color: #052e1a;
          background: linear-gradient(135deg, #86efac, #5eead4);
          border: 2px solid rgba(15, 23, 42, 0.96);
          font-size: 11px;
          font-weight: 950;
          line-height: 1;
          box-shadow: 0 8px 22px rgba(34, 197, 94, 0.26);
        }

        .chat-media-thumb img,
        .chat-media-thumb video {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .chat-fullscreen-backdrop {
          position: fixed;
          inset: 0;
          z-index: 220;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(2, 6, 23, 0.92);
          backdrop-filter: blur(10px);
        }

        .chat-fullscreen-viewer {
          position: relative;
          width: min(100%, 1120px);
          height: min(100%, 86dvh);
          display: grid;
          grid-template-rows: auto 1fr;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 24px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.92);
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
        }

        .chat-fullscreen-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 16px;
          color: #e5e7eb;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        .chat-fullscreen-topbar div {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .chat-fullscreen-topbar strong,
        .chat-fullscreen-topbar span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-fullscreen-topbar strong {
          font-size: 15px;
        }

        .chat-fullscreen-topbar span {
          min-height: 18px;
          color: rgba(226, 232, 240, 0.72);
          font-size: 13px;
        }

        .chat-fullscreen-topbar button,
        .chat-fullscreen-nav {
          border: none;
          color: #fff;
          background: rgba(15, 23, 42, 0.72);
          cursor: pointer;
        }

        .chat-fullscreen-topbar button {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          font-size: 26px;
          line-height: 1;
          flex-shrink: 0;
        }

        .chat-fullscreen-media-wrap {
          position: relative;
          min-height: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .chat-fullscreen-media {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }

        .chat-fullscreen-nav {
          position: absolute;
          top: 50%;
          width: 44px;
          height: 58px;
          transform: translateY(-50%);
          border-radius: 16px;
          font-size: 42px;
          line-height: 1;
        }

        .chat-fullscreen-nav.prev {
          left: 14px;
        }

        .chat-fullscreen-nav.next {
          right: 14px;
        }

        @media (max-width: 640px) {
          .chat-fullscreen-backdrop {
            padding: 0;
          }

          .chat-fullscreen-viewer {
            width: 100%;
            height: 100dvh;
            border-radius: 0;
            border: none;
          }

          .chat-fullscreen-nav {
            width: 38px;
            height: 52px;
            font-size: 36px;
          }

          .chat-jump-to-latest {
            left: 50%;
            right: auto;
            bottom: 14px;
            width: 42px;
            height: 42px;
          }
        }
      `}</style>
    <div className="chat-messages-shell">
      <div
        ref={scrollContainerRef}
        className="chat-scrollbar"
        onScroll={updateJumpToLatestVisibility}
        style={{
          flex: "1 1 auto",
          height: "100%",
          maxHeight: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          overflowAnchor: "none",
          padding: "18px 20px",
          background:
            "radial-gradient(circle at top, rgba(37,99,235,0.07), transparent 35%), linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)",
        }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {loadingMessages ? (
          <p className="muted-text">Загрузка сообщений...</p>
        ) : messages.length === 0 ? (
          <p className="muted-text">Сообщений пока нет</p>
        ) : (
          messageItems.map((item) => {
            if (item.type === "divider") {
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    width: "100%",
                    margin: "6px 0 2px 0",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px 12px",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.8)",
                      whiteSpace: "nowrap",
                      lineHeight: 1.2,
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              );
            }

            const msg = item;
            const safeUserAvatarUrl = getSafeOptimizedImageUrl(msg.userAvatarPreviewUrl, msg.userAvatarUrl);
            const safeSharedFishingPhotoUrl = getSafeImageUrl(msg.sharedFishingEntry?.photoUrl);
            const isMine = user?.id === msg.userId;
            const isReadByOthers = Boolean(msg.isReadByOthers);
            const showReplyButton = hoveredMessageId === msg.id;
            const isHighlighted = highlightedMessageId === msg.id;
            const swipeDirection = isMine ? -1 : 1;
            const isReplySwiping = replySwipe.messageId === msg.id && replySwipe.offset > 0;

            return (
              <div
                key={msg.id}
                ref={(node) => {
                  if (node) messageRefs.current[msg.id] = node;
                }}
                onDoubleClick={() => {
                  if (!msg.isDeletedForAll) startReply(msg);
                }}
                onContextMenu={(e) => handleContextMenu(e, msg)}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                onTouchStart={(e) => handleMessageTouchStart(e, msg)}
                onTouchMove={(e) => handleMessageTouchMove(e, msg, isMine)}
                onTouchEnd={(e) => handleMessageTouchEnd(e, msg, isMine)}
                onTouchCancel={() => {
                  touchReplyRef.current = null;
                  lastTapReplyRef.current = null;
                  setReplySwipe({ messageId: null, offset: 0 });
                  handleTouchEnd();
                }}
                style={{
                  display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  width: "100%",
                  transition: isReplySwiping ? "none" : "0.25s ease",
                  transform: isReplySwiping
                    ? `translateX(${replySwipe.offset * swipeDirection}px)`
                    : "translateX(0)",
                  borderRadius: "18px",
                  background: isHighlighted ? "rgba(255,255,255,0.08)" : "transparent",
                  boxShadow: isHighlighted
                    ? "0 0 0 1px rgba(255,255,255,0.08), 0 0 18px rgba(37,99,235,0.22)"
                    : "none",
                  padding: isHighlighted ? "6px 8px" : "0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMine ? "row-reverse" : "row",
                    alignItems: "flex-end",
                    gap: "10px",
                    maxWidth: "78%",
                    minWidth: 0,
                    position: "relative",
                  }}
                >
                  {isReplySwiping && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        [isMine ? "right" : "left"]: "-42px",
                        width: "30px",
                        height: "30px",
                        transform: "translateY(-50%)",
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        color: "#bfdbfe",
                        background: "rgba(37,99,235,0.18)",
                        border: "1px solid rgba(96,165,250,0.34)",
                        pointerEvents: "none",
                        opacity: Math.min(1, replySwipe.offset / 56),
                      }}
                    >
                      ↩
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => goToUserProfile(msg.userId)}
                    style={{
                      padding: 0,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    title="Открыть профиль"
                  >
                    {safeUserAvatarUrl ? (
                      <img
                        src={safeUserAvatarUrl}
                        alt={msg.userName}
                        style={{
                          width: "38px",
                          height: "38px",
                          objectFit: "cover",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          background: "#334155",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 700,
                        }}
                      >
                        {getInitials(msg.userName)}
                      </div>
                    )}
                  </button>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isMine ? "flex-end" : "flex-start",
                      gap: "4px",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: isMine ? "row-reverse" : "row",
                        alignItems: "flex-end",
                        gap: "6px",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          background: isMine ? "#2563eb" : "rgba(255,255,255,0.06)",
                          border: isMine
                            ? "1px solid rgba(37,99,235,0.4)"
                            : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "18px",
                          padding: "10px 12px",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          whiteSpace: "pre-wrap",
                          minWidth: "120px",
                          maxWidth: "680px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => goToUserProfile(msg.userId)}
                          style={{
                            padding: 0,
                            background: "transparent",
                            border: "none",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 700,
                            marginBottom: "4px",
                            fontSize: "13px",
                            opacity: 0.95,
                          }}
                          title="Открыть профиль"
                        >
                          {msg.userName}
                        </button>

                        {msg.replyToMessageId && (
                          <button
                            type="button"
                            onClick={() => onReplyPreviewClick(msg.replyToMessageId)}
                            style={{
                              marginBottom: "8px",
                              padding: "8px 10px",
                              borderRadius: "12px",
                              background: "rgba(0,0,0,0.18)",
                              borderLeft: "3px solid rgba(255,255,255,0.45)",
                              width: "100%",
                              textAlign: "left",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                            title="Перейти к сообщению"
                          >
                            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "2px" }}>
                              {msg.replyToUserName || "Сообщение"}
                            </div>
                            <div style={{ fontSize: "12px", opacity: 0.88 }}>
                              {shortenText(msg.replyToText, 90)}
                            </div>
                          </button>
                        )}

                        {!msg.isDeletedForAll && msg.attachments?.length > 0 && (
                          <div
                            style={{
                              display: "grid",
                              gap: "8px",
                              gridTemplateColumns:
                                msg.attachments.length === 1
                                  ? "minmax(0, 360px)"
                                  : "repeat(2, minmax(0, 170px))",
                              justifyContent: isMine ? "end" : "start",
                              marginBottom: msg.text ? "8px" : 0,
                            }}
                          >
                            {msg.attachments.map((attachment) => {
                              const isPendingAttachment = Boolean(attachment.isUploading);
                              const isFailedAttachment = Boolean(attachment.isUploadError);
                              const safeFileUrl = isPendingAttachment
                                ? getSafePreviewUrl(attachment.fileUrl)
                                : getSafeAppFileUrl(attachment.fileUrl);

                              const isSingleAttachment = msg.attachments.length === 1;
                              const messageMedia = msg.attachments
                                .filter((item) => item.attachmentType === "Image" || item.attachmentType === "Video")
                                .map((item) => {
                                  const isItemPending = Boolean(item.isUploading);
                                  const itemSafeUrl = isItemPending
                                    ? getSafePreviewUrl(item.fileUrl)
                                    : getSafeAppFileUrl(item.fileUrl);

                                  return {
                                    id: item.id,
                                    fileName: item.fileName,
                                    safeUrl: itemSafeUrl,
                                    mediaType: item.attachmentType === "Video" ? "video" : "image",
                                    canOpen: !isItemPending && !item.isUploadError && Boolean(itemSafeUrl),
                                  };
                                })
                                .filter((item) => item.canOpen);
                              const mediaIndex = messageMedia.findIndex((item) => item.id === attachment.id);

                              function UploadOverlay() {
                                if (!isPendingAttachment && !isFailedAttachment) return null;

                                return (
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      display: "grid",
                                      placeItems: "center",
                                      padding: "14px",
                                      background: isFailedAttachment
                                        ? "rgba(127, 29, 29, 0.58)"
                                        : "rgba(15, 23, 42, 0.46)",
                                      backdropFilter: "blur(2px)",
                                      color: "#fff",
                                      textAlign: "center",
                                      pointerEvents: "none",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "grid",
                                        justifyItems: "center",
                                        gap: "8px",
                                      }}
                                    >
                                      {!isFailedAttachment && (
                                        <span
                                          style={{
                                            width: "28px",
                                            height: "28px",
                                            borderRadius: "50%",
                                            border: "3px solid rgba(255,255,255,0.32)",
                                            borderTopColor: "#67e8f9",
                                            animation: "chatUploadSpin 0.75s linear infinite",
                                          }}
                                        />
                                      )}

                                      <span
                                        style={{
                                          padding: "7px 10px",
                                          borderRadius: "999px",
                                          background: "rgba(2,6,23,0.58)",
                                          fontSize: "12px",
                                          fontWeight: 900,
                                        }}
                                      >
                                        {isFailedAttachment ? "Ошибка загрузки" : "Загрузка..."}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              if (attachment.attachmentType === "Image") {
                                return (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    className="chat-media-thumb"
                                    disabled={isPendingAttachment || isFailedAttachment || !safeFileUrl || mediaIndex < 0}
                                    onClick={(event) => openMessageMediaViewer(event, messageMedia, mediaIndex)}
                                    onDoubleClick={(event) => event.stopPropagation()}
                                    title="Открыть фото на весь экран"
                                    style={{
                                      width: "100%",
                                      height: isSingleAttachment ? "260px" : "150px",
                                      background: "rgba(0,0,0,0.22)",
                                      border: isFailedAttachment
                                        ? "1px solid rgba(248,113,113,0.42)"
                                        : "1px solid rgba(255,255,255,0.08)",
                                    }}
                                  >
                                    {safeFileUrl ? (
                                      <img
                                        src={safeFileUrl}
                                        alt={attachment.fileName}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ) : (
                                      <div style={{ fontSize: "34px" }}>🖼️</div>
                                    )}

                                    <UploadOverlay />
                                  </button>
                                );
                              }

                              if (attachment.attachmentType === "Video") {
                                return (
                                  <div
                                    key={attachment.id}
                                    style={{
                                      width: "100%",
                                      height: isSingleAttachment ? "260px" : "150px",
                                      overflow: "hidden",
                                      position: "relative",
                                      borderRadius: "14px",
                                      background: "rgba(0,0,0,0.22)",
                                      border: isFailedAttachment
                                        ? "1px solid rgba(248,113,113,0.42)"
                                        : "1px solid rgba(255,255,255,0.08)",
                                      display: "grid",
                                      placeItems: "center",
                                    }}
                                  >
                                    {safeFileUrl ? (
                                      <video
                                        controls={!isPendingAttachment}
                                        src={safeFileUrl}
                                        preload="metadata"
                                        playsInline
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "contain",
                                          display: "block",
                                        }}
                                      />
                                    ) : (
                                      <div style={{ fontSize: "34px" }}>🎬</div>
                                    )}

                                    <UploadOverlay />
                                  </div>
                                );
                              }

                              if (attachment.isVoiceMessage) {
                                return (
                                  <div
                                    key={attachment.id}
                                    style={{
                                      position: "relative",
                                      width: "100%",
                                      maxWidth: "360px",
                                      borderRadius: "16px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <VoiceMessageAttachment
                                      attachment={attachment}
                                      safeFileUrl={safeFileUrl}
                                      isMine={isMine}
                                      isDisabled={isPendingAttachment || isFailedAttachment}
                                    />
                                    <UploadOverlay />
                                  </div>
                                );
                              }

                              if (attachment.attachmentType === "Audio") {
                                return (
                                  <div
                                    key={attachment.id}
                                    style={{
                                      position: "relative",
                                      width: "100%",
                                      maxWidth: "360px",
                                      borderRadius: "14px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {safeFileUrl && (
                                      <audio
                                        controls={!isPendingAttachment}
                                        src={safeFileUrl}
                                        style={{ width: "100%" }}
                                      />
                                    )}
                                    <UploadOverlay />
                                  </div>
                                );
                              }

                              return (
                                <a
                                  key={attachment.id}
                                  href={safeFileUrl || "#"}
                                  target={isPendingAttachment ? undefined : "_blank"}
                                  rel={isPendingAttachment ? undefined : "noopener noreferrer"}
                                  onClick={(event) => {
                                    if (isPendingAttachment || !safeFileUrl) {
                                      event.preventDefault();
                                    }
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    minWidth: 0,
                                    position: "relative",
                                    padding: "10px 12px",
                                    borderRadius: "12px",
                                    overflow: "hidden",
                                    textDecoration: "none",
                                    color: "#fff",
                                    background: "rgba(0,0,0,0.18)",
                                    border: isFailedAttachment
                                      ? "1px solid rgba(248,113,113,0.42)"
                                      : "1px solid rgba(255,255,255,0.08)",
                                  }}
                                >
                                  <div style={{ fontSize: "22px", flexShrink: 0 }}>📄</div>
                                  <div style={{ minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontSize: "13px",
                                        fontWeight: 700,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {attachment.fileName}
                                    </div>
                                    <div style={{ fontSize: "12px", opacity: 0.8 }}>
                                      {formatFileSize(attachment.size)}
                                    </div>
                                  </div>

                                  <UploadOverlay />
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {!msg.isDeletedForAll && msg.sharedFishingEntry && (
                          <button
                            type="button"
                            onClick={() => openSharedFishingEntry(msg.sharedFishingEntry)}
                            style={{
                              width: "100%",
                              maxWidth: "360px",
                              marginBottom: msg.text ? "8px" : 0,
                              padding: 0,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "16px",
                              overflow: "hidden",
                              background: "rgba(15,23,42,0.72)",
                              color: "#fff",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                            title="Открыть запись"
                          >
                            {safeSharedFishingPhotoUrl && (
                              <img
                                src={safeSharedFishingPhotoUrl}
                                alt={msg.sharedFishingEntry.title || "Запись из ленты"}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  maxHeight: "180px",
                                  objectFit: "cover",
                                }}
                              />
                            )}

                            <div style={{ padding: "12px" }}>
                              <div
                                style={{
                                  display: "inline-flex",
                                  marginBottom: "8px",
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  background: "rgba(34,197,94,0.16)",
                                  color: "#bbf7d0",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                }}
                              >
                                🎣 Запись из ленты
                              </div>

                              <div style={{ fontWeight: 900, fontSize: "15px", marginBottom: "5px" }}>
                                {msg.sharedFishingEntry.title || "Рыбалка без названия"}
                              </div>

                              <div style={{ fontSize: "12px", opacity: 0.82, lineHeight: 1.45 }}>
                                <div>Автор: {msg.sharedFishingEntry.userName || "Рыбак"}</div>
                                <div>Место: {msg.sharedFishingEntry.locationName || "Не указано"}</div>
                                <div>Улов: {getSharedCatchLabel(msg.sharedFishingEntry)}</div>
                                <div>Дата: {formatFishingEntryDate(msg.sharedFishingEntry.fishingStartedAt || msg.sharedFishingEntry.fishingDate)}</div>
                              </div>

                              <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: 800, color: "#bfdbfe" }}>
                                Открыть подробности →
                              </div>
                            </div>
                          </button>
                        )}

                        {msg.text && (
                          <CollapsibleMessageText
                            messageId={msg.id}
                            text={msg.text}
                            isExpanded={Boolean(expandedMessageIds[msg.id])}
                            onToggle={toggleMessageExpanded}
                          />
                        )}
                      </div>

                      {showReplyButton && !msg.isDeletedForAll && (
                        <button
                          type="button"
                          onClick={() => startReply(msg)}
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "#0f1220",
                            color: "#fff",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                          title="Ответить"
                        >
                          ↩
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                        gap: "6px",
                        fontSize: "11px",
                        opacity: 0.72,
                        paddingLeft: isMine ? 0 : "4px",
                        paddingRight: isMine ? "4px" : 0,
                        textAlign: isMine ? "right" : "left",
                        width: "100%",
                      }}
                    >
                      <span>{formatMessageTime(msg.sentAt)}</span>
                      {isMine && !msg.isDeletedForAll && (
                        <span
                          className={`chat-message-read-mark${isReadByOthers ? " read" : ""}`}
                          title={isReadByOthers ? "Прочитано" : "Не прочитано"}
                          aria-label={isReadByOthers ? "Прочитано" : "Не прочитано"}
                        >
                          {isReadByOthers ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>
      </div>

      {(showJumpToLatest || newMessagesBelowCount > 0) && (
        <button
          type="button"
          className="chat-jump-to-latest"
          onClick={jumpToLatestMessage}
          aria-label="Перейти к последним сообщениям"
          title="К последним сообщениям"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path
              d="M5.8 7.8 10 12l4.2-4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {newMessagesBelowCount > 0 && (
            <span className="chat-jump-to-latest__badge">
              {newMessagesBelowCount > 99 ? "99+" : newMessagesBelowCount}
            </span>
          )}
        </button>
      )}
    </div>

      {sharedEntryViewer && (
        <SharedFishingEntryDetailsModal
          entry={sharedEntryViewer}
          onClose={() => setSharedEntryViewer(null)}
          onOpenMedia={openSharedEntryMedia}
        />
      )}

      {mediaViewer && (
        <MediaLightbox viewer={mediaViewer} onClose={() => setMediaViewer(null)} />
      )}
    </>
  );
}
