import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicProfile, adminBlockUser, adminUnblockUser, reportUser, blockUser, unblockUser } from "../api/profileApi";
import { createOrGetPersonalChat, getChats, getUserPresence, shareFishingEntryToChat } from "../api/chatsApi";
import { adminDeleteFishingEntry, shareFishingEntry } from "../api/fishingEntriesApi";
import { useAuth } from "../context/AuthContext";
import MediaLightbox from "../components/MediaLightbox";
import FishingEntryDetailsModal from "../components/FishingEntryDetailsModal";
import {
  sendFriendRequest,
  cancelOutgoingFriendRequest,
  removeFriend,
  getFriendshipStatus,
} from "../api/friendsApi";
import "../styles/FeedPage.css";
import "../styles/profile.css";
import { getSafeAppFileUrl, getSafeImageUrl } from "../utils/safeUrl.js";

const ADMIN_BLOCK_REASONS = [
  { value: "nudity", label: "Нагота или материалы сексуального характера" },
  { value: "drugs", label: "Наркотики или запрещённые вещества" },
  { value: "illegal_ads", label: "Реклама запрещённых товаров или услуг" },
  { value: "spam", label: "Спам или массовая реклама" },
  { value: "abuse", label: "Оскорбления, угрозы или травля" },
  { value: "fraud", label: "Мошенничество или попытка обмана" },
  { value: "rules", label: "Нарушение правил сервиса" },
  { value: "other", label: "Другая причина" },
];

function getBlockReasonText(profile) {
  return profile?.blockReasonText || profile?.BlockReasonText || "Нарушение правил сервиса";
}

function getInteractionBlockText(profile) {
  return profile?.interactionBlockText || profile?.InteractionBlockText || "Профиль недоступен.";
}

const SUPPORT_EMAIL = "rassokha.lesha@yandex.ru";

function formatDate(value) {
  if (!value) return "Дата не указана";

  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatPresence(presence) {
  if (!presence) {
    return {
      title: "Статус неизвестен",
      text: "нет данных",
      isOnline: false,
    };
  }

  if (presence.isOnline) {
    return {
      title: "В сети",
      text: "сейчас онлайн",
      isOnline: true,
    };
  }

  const rawLastSeen = presence.lastSeenAtUtc || presence.lastSeenAt;
  if (!rawLastSeen) {
    return {
      title: "Не в сети",
      text: "нет данных",
      isOnline: false,
    };
  }

  const date = new Date(rawLastSeen);
  if (Number.isNaN(date.getTime())) {
    return {
      title: "Не в сети",
      text: "нет данных о последнем посещении",
      isOnline: false,
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffMinutes < 1) {
    return {
      title: "Не в сети",
      text: "был только что",
      isOnline: false,
    };
  }

  if (diffMinutes < 60) {
    return {
      title: "Не в сети",
      text: `был ${diffMinutes} мин. назад`,
      isOnline: false,
    };
  }

  const today = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === today) {
    return {
      title: "Не в сети",
      text: `был сегодня в ${time}`,
      isOnline: false,
    };
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return {
      title: "Не в сети",
      text: `был вчера в ${time}`,
      isOnline: false,
    };
  }

  const dateText = date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
  });

  return {
    title: "Не в сети",
    text: `был ${dateText} в ${time}`,
    isOnline: false,
  };
}

function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() || "U";
}

function getDisplayName(user) {
  if (!user) return "Пользователь";

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  return user.displayName || fullName || user.userName || "Пользователь";
}


function getRestoredEntryDetails(historyKey) {
  if (typeof window === "undefined") return null;
  const state = window.history.state || {};
  if (state.fishingEntryDetailsHistoryKey !== historyKey) return null;
  return state.fishingEntryDetailsEntry || null;
}

function getEntryShareTitle(entry) {
  return `${entry?.title || "Запись о рыбалке"}${entry?.locationName ? ` · ${entry.locationName}` : ""}`;
}

function isSameDay(first, second) {
  if (!first || !second) return false;
  const a = new Date(first);
  const b = new Date(second);

  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatShortDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Дата не указана";

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function formatShortTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFishingRange(startValue, endValue) {
  if (!startValue && !endValue) return "Время не указано";

  if (startValue && !endValue) {
    return `${formatShortDate(startValue)}, ${formatShortTime(startValue)}`;
  }

  if (!startValue && endValue) {
    return `${formatShortDate(endValue)}, до ${formatShortTime(endValue)}`;
  }

  if (isSameDay(startValue, endValue)) {
    return `${formatShortDate(startValue)}, ${formatShortTime(startValue)}–${formatShortTime(endValue)}`;
  }

  return `${formatShortDate(startValue)} ${formatShortTime(startValue)} — ${formatShortDate(endValue)} ${formatShortTime(endValue)}`;
}

function toWeatherDateParam(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Avatar({ userName, avatarUrl, size = "large", onClick }) {
  if (avatarUrl) {
    return (
      <img
        src={getSafeImageUrl(avatarUrl)}
        alt={userName || "Аватар"}
        className={`profile-avatar profile-avatar-${size}`}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      className={`profile-avatar profile-avatar-${size} profile-avatar-placeholder`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {getInitials(userName)}
    </div>
  );
}


function normalizeEntryMedia(entry) {
  const media = Array.isArray(entry?.media) ? entry.media : [];
  const normalized = media
    .filter((item) => item?.url)
    .map((item, index) => ({
      id: item.id || `${item.url}-${index}`,
      url: item.url,
      mediaType: item.mediaType || item.type || (String(item.url).match(/\.(mp4|webm|mov)(\?|$)/i) ? "video" : "image"),
      sortOrder: item.sortOrder ?? index,
    }))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

  if (normalized.length === 0 && entry?.photoUrl) {
    normalized.push({ id: `photo-${entry.photoUrl}`, url: entry.photoUrl, mediaType: "image", sortOrder: 0 });
  }

  return normalized;
}

function EntryMediaGallery({ entry, details = false, alt = "Медиа записи", onOpenFullscreen }) {
  const media = normalizeEntryMedia(entry);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartRef = useRef(null);
  const didSwipeRef = useRef(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [entry?.id, media.length]);

  if (media.length === 0) {
    return (
      <div className={details ? "profile-entry-details-image profile-entry-image-empty" : "profile-entry-image profile-entry-image-empty"}>
        <span>🎣</span>
      </div>
    );
  }

  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const safeActiveUrl = getSafeAppFileUrl(active?.url);
  if (!safeActiveUrl) return null;

  const isVideo = active.mediaType === "video";

  function goPrevious(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  }

  function goNext(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setActiveIndex((current) => (current + 1) % media.length);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;

    didSwipeRef.current = false;
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

    didSwipeRef.current = true;

    if (dx < 0) {
      goNext(event);
    } else {
      goPrevious(event);
    }
  }

  function handleGalleryClick(event) {
    if (didSwipeRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didSwipeRef.current = false;
      return;
    }

    if (details) {
      openFullscreen(event);
    }
  }

  function openFullscreen(event) {
    event?.stopPropagation();
    onOpenFullscreen?.(media, Math.min(activeIndex, media.length - 1));
  }

  return (
    <div
      className={`profile-entry-media-frame profile-gallery-touchable ${details ? "profile-entry-details-image" : ""}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleGalleryClick}
      role={details ? "button" : undefined}
      tabIndex={details ? 0 : undefined}
      title={details ? "Открыть медиа на весь экран" : undefined}
    >
      {isVideo ? (
        <video
          className={details ? "profile-entry-details-media" : "profile-entry-video"}
          src={safeActiveUrl}
          controls={details}
          muted={!details}
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={safeActiveUrl}
          alt={alt}
          className={details ? "profile-entry-details-media" : "profile-entry-image"}
          loading="lazy"
          decoding="async"
        />
      )}

      {media.length > 1 && (
        <>
          <button className="profile-entry-media-nav prev" type="button" onClick={goPrevious} aria-label="Предыдущее медиа">‹</button>
          <button className="profile-entry-media-nav next" type="button" onClick={goNext} aria-label="Следующее медиа">›</button>
          <span className="profile-entry-media-counter">{activeIndex + 1} / {media.length}</span>
          <div className="profile-entry-media-dots" aria-hidden="true">
            {media.map((item, index) => (
              <span key={item.id || item.url} className={`profile-entry-media-dot ${index === activeIndex ? "active" : ""}`} />
            ))}
          </div>
        </>
      )}

      {isVideo && <span className="profile-entry-video-badge">▶ Видео</span>}
    </div>
  );
}

function EntryCard({ entry, isAdmin, onOpenDetails, onOpenWeather, onOpenMap, onOpenFeed, onShare, onAdminDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const fishingStart = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
  const fishingEnd = entry.fishingEndedAt || entry.endTime;
  const hasWeatherPage = entry.latitude != null && entry.longitude != null;
  const hasMapPoint = entry.latitude != null && entry.longitude != null;
  const isPublishedToFeed = entry.isPublishedToFeed ?? true;

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [menuOpen]);

  function stopAndRun(event, callback) {
    event.stopPropagation();
    setMenuOpen(false);
    callback?.(entry);
  }

  return (
    <article
      className={`profile-entry-card profile-entry-card-clickable ${menuOpen ? "profile-entry-card-menu-open" : ""}`}
      onClick={() => onOpenDetails?.(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails?.(entry);
        }
      }}
    >
      <div className="profile-entry-media">
        <EntryMediaGallery entry={entry} alt={entry.title || "Запись о рыбалке"} />

        <div className="profile-entry-overlay-top">
          <span className="profile-entry-overlay-badge">Публичная</span>
          {isPublishedToFeed && (
            <span className="profile-entry-overlay-badge profile-entry-overlay-badge-secondary">
              В ленте
            </span>
          )}
        </div>

      </div>

      {(isPublishedToFeed || onShare || isAdmin) && (
        <div className="profile-entry-menu-wrap" ref={menuRef} onClick={(event) => event.stopPropagation()}>
          <button
            className="profile-entry-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
            aria-label="Действия с записью"
          >
            ⋮
          </button>

          {menuOpen && (
            <div className="profile-entry-menu">
              {isPublishedToFeed && (
                <button onClick={(event) => stopAndRun(event, onOpenFeed)} type="button">
                  Посмотреть в ленте
                </button>
              )}
              {onShare && (
                <button onClick={(event) => stopAndRun(event, onShare)} type="button">
                  Поделиться в чат
                </button>
              )}
              {isAdmin && (
                <button onClick={(event) => stopAndRun(event, onAdminDelete)} type="button">
                  Удалить запись
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="profile-entry-body">
        <div className="profile-entry-topline">
          <span>{formatFishingRange(fishingStart, fishingEnd)}</span>
        </div>

        <h3>{entry.title || "Запись о рыбалке"}</h3>

        <div className="profile-entry-location-row">
          <p className="profile-entry-location">
            {entry.locationName || "Место не указано"}
          </p>
          {hasMapPoint && (
            <button
              className="profile-entry-map-link"
              onClick={(event) => stopAndRun(event, onOpenMap)}
              type="button"
            >
              Посмотреть на карте
            </button>
          )}
        </div>

        {entry.weatherSummary && (
          <button
            className="profile-entry-weather-line profile-entry-weather-button"
            onClick={(event) => stopAndRun(event, onOpenWeather)}
            type="button"
            disabled={!hasWeatherPage}
            title={hasWeatherPage ? "Открыть погоду на дату рыбалки" : "Для прогноза нужны координаты"}
          >
            <span className="profile-entry-weather-icon">☁</span>
            <span>{entry.weatherSummary}</span>
          </button>
        )}

        {entry.description && (
          <p className="profile-entry-description">{entry.description}</p>
        )}

        <div className="profile-entry-meta">
          {entry.catchType && <span>Рыба: {entry.catchType}</span>}
          {entry.catchWeight != null && entry.catchWeight !== "" && <span>Вес: {entry.catchWeight}</span>}
          {entry.bait && <span>Наживка: {entry.bait}</span>}
        </div>
      </div>
    </article>
  );
}

function EntryDetailsModal({ entry, isOpen, isAdmin, onClose, onOpenWeather, onOpenMap, onOpenFeed, onShare, onAdminDelete, authorLabel, authorAvatarUrl, authorUserId, onOpenAuthor }) {
  return (
    <FishingEntryDetailsModal
      entry={entry}
      isOpen={isOpen}
      sourceLabel="Запись пользователя"
      authorLabel={authorLabel}
      authorAvatarUrl={authorAvatarUrl}
      authorUserId={authorUserId}
      onClose={onClose}
      onOpenWeather={onOpenWeather}
      onOpenMap={onOpenMap}
      onOpenFeed={onOpenFeed}
      onOpenAuthor={onOpenAuthor}
      onShare={onShare}
      onAdminDelete={onAdminDelete}
      isAdmin={isAdmin}
      historyKey="user-profile-entry-details"
    />
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="profile-empty-state">
      <div className="profile-empty-icon">🎣</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function AvatarPreviewModal({ isOpen, imageUrl, onClose }) {
  if (!isOpen || !imageUrl) return null;

  return (
    <div className="profile-modal-backdrop profile-avatar-backdrop" onClick={onClose}>
      <button className="profile-modal-close" onClick={onClose} type="button">
        ×
      </button>
      <img
        src={getSafeImageUrl(imageUrl)}
        alt="Аватар"
        className="profile-avatar-preview"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [friendshipStatus, setFriendshipStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockReasonCode, setBlockReasonCode] = useState("rules");
  const [blockReasonText, setBlockReasonText] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReasonCode, setReportReasonCode] = useState("rules");
  const [reportReasonText, setReportReasonText] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [userBlockLoading, setUserBlockLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const profileMenuRef = useRef(null);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [presence, setPresence] = useState(null);
  const [shareModalEntry, setShareModalEntry] = useState(null);
  const [availableChats, setAvailableChats] = useState([]);
  const [loadingShareChats, setLoadingShareChats] = useState(false);
  const [shareChatSearch, setShareChatSearch] = useState("");
  const [shareMessageText, setShareMessageText] = useState("");
  const [selectedShareChatIds, setSelectedShareChatIds] = useState([]);
  const [shareSending, setShareSending] = useState(false);

  function showMessage(text, isError = false) {
    setMessage(text);
    setIsErrorMessage(isError);
  }

  async function loadFriendshipStatus() {
    const status = await getFriendshipStatus(id);
    setFriendshipStatus(status);
  }

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        const data = await getPublicProfile(id);
        setProfile(data);

        if (data?.isBlocked || data?.isInteractionBlocked) {
          setFriendshipStatus(null);
        } else {
          await loadFriendshipStatus();
        }
      } catch (err) {
        console.error(err);
        showMessage(`Не удалось загрузить профиль: ${err.message}`, true);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [id]);

  useEffect(() => {
    if (!id || profile?.isBlocked || profile?.isInteractionBlocked) return undefined;

    let cancelled = false;

    async function loadPresence() {
      try {
        const data = await getUserPresence(id);

        if (!cancelled) {
          setPresence(data);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setPresence(null);
        }
      }
    }

    loadPresence();
    const intervalId = window.setInterval(loadPresence, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [id, profile?.isBlocked, profile?.isInteractionBlocked]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = setTimeout(() => {
      setMessage("");
      setIsErrorMessage(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (profileMenuRef.current?.contains(event.target)) return;
      setProfileMenuOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!shareModalEntry) return undefined;

    async function loadShareChats() {
      try {
        setLoadingShareChats(true);
        setMessage("");
        const data = await getChats();
        setAvailableChats(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        showMessage(`Не удалось загрузить чаты: ${err.message}`, true);
      } finally {
        setLoadingShareChats(false);
      }
    }

    loadShareChats();
  }, [shareModalEntry]);

  useEffect(() => {
    if (selectedEntry) return;
    const restoredEntry = getRestoredEntryDetails("user-profile-entry-details");
    if (restoredEntry?.id) {
      setSelectedEntry(restoredEntry);
    }
  }, [selectedEntry]);

  useEffect(() => {
    if (!shareModalEntry || typeof document === "undefined") return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeShareModal();
      }
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("feed-modal-open");
    document.documentElement.classList.add("feed-modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.classList.remove("feed-modal-open");
      document.documentElement.classList.remove("feed-modal-open");
    };
  }, [shareModalEntry]);

  const filteredShareChats = useMemo(() => {
    const query = shareChatSearch.trim().toLowerCase();
    if (!query) return availableChats;

    return availableChats.filter((chat) =>
      [chat.name, chat.lastMessageText, chat.lastMessageUserName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [availableChats, shareChatSearch]);

  function closeShareModal() {
    setShareModalEntry(null);
    setShareMessageText("");
    setShareChatSearch("");
    setSelectedShareChatIds([]);
  }

  function openShareEntryModal(entry) {
    setShareModalEntry(entry);
    setShareMessageText("");
    setShareChatSearch("");
    setSelectedShareChatIds([]);
  }

  function toggleShareChat(chatId) {
    setSelectedShareChatIds((current) =>
      current.includes(chatId)
        ? current.filter((chatIdInList) => chatIdInList !== chatId)
        : [...current, chatId]
    );
  }

  async function handleSendShareToChats() {
    if (!shareModalEntry?.id || selectedShareChatIds.length === 0) return;

    const selectedChats = availableChats.filter((chat) => selectedShareChatIds.includes(chat.id));
    if (selectedChats.length === 0) return;

    try {
      setShareSending(true);
      setMessage("");
      setIsErrorMessage(false);

      const note = shareMessageText.trim();

      for (const chat of selectedChats) {
        await shareFishingEntryToChat(chat.id, shareModalEntry.id, note || null);
      }

      if (shareModalEntry.visibility !== 0 && shareModalEntry.isPublishedToFeed) {
        try {
          await shareFishingEntry(shareModalEntry.id);
        } catch (err) {
          console.warn("Не удалось обновить счетчик репостов:", err);
        }
      }

      showMessage(
        selectedChats.length === 1
          ? `Запись отправлена в чат «${selectedChats[0]?.name || "Чат"}».`
          : `Запись отправлена в ${selectedChats.length} чата.`
      );
      closeShareModal();
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отправить запись в чат: ${err.message}`, true);
    } finally {
      setShareSending(false);
    }
  }

  async function handleAddFriend() {
    try {
      setActionLoading(true);
      await sendFriendRequest(id);
      await loadFriendshipStatus();
      showMessage("Заявка в друзья отправлена");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отправить заявку: ${err.message}`, true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelRequest() {
    try {
      setActionLoading(true);
      await cancelOutgoingFriendRequest(id);
      await loadFriendshipStatus();
      showMessage("Заявка отменена");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отменить заявку: ${err.message}`, true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveFriend() {
    try {
      setActionLoading(true);
      await removeFriend(id);
      await loadFriendshipStatus();
      showMessage("Друг удалён");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось удалить из друзей: ${err.message}`, true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleOpenPersonalChat() {
    try {
      setChatLoading(true);
      const result = await createOrGetPersonalChat(id);

      if (!result?.chatId) {
        showMessage("Сервер не вернул chatId", true);
        return;
      }

      navigate(`/chats?chatId=${result.chatId}`);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось открыть личный чат: ${err.message}`, true);
    } finally {
      setChatLoading(false);
    }
  }

  function handleOpenWeather(entry) {
    if (entry.latitude == null || entry.longitude == null) {
      showMessage("Для прогноза у записи должны быть координаты.", true);
      return;
    }

    const dateSource = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
    const date = toWeatherDateParam(dateSource) || toWeatherDateParam(new Date());

    const params = new URLSearchParams({
      date,
      lat: entry.latitude,
      lon: entry.longitude,
      placeName: entry.locationName || "Место рыбалки",
    });

    navigate(`/weather?${params.toString()}`);
  }

  function handleOpenEntryMap(entry) {
    if (entry.latitude == null || entry.longitude == null) {
      showMessage("У записи нет координат для открытия на карте.", true);
      return;
    }

    const params = new URLSearchParams({
      lat: entry.latitude,
      lon: entry.longitude,
      name: entry.locationName || entry.title || "Место рыбалки",
      entryId: entry.id,
    });

    navigate(`/map-points?${params.toString()}`);
  }

  function handleOpenEntryInFeed(entry) {
    const isPublishedToFeed = entry?.isPublishedToFeed ?? true;

    if (!isPublishedToFeed) {
      showMessage("Эта запись не опубликована в ленте.", true);
      return;
    }

    navigate(getFeedEntryPath(entry.id));
  }

  function openReportModal() {
    setProfileMenuOpen(false);
    setReportReasonCode("rules");
    setReportReasonText("");
    setReportModalOpen(true);
  }

  async function handleReportUser(event) {
    event.preventDefault();
    if (!profile?.id) return;

    const reasonText = reportReasonText.trim();

    if (reportReasonCode === "other" && !reasonText) {
      showMessage("Укажите текст жалобы.", true);
      return;
    }

    try {
      setReportLoading(true);
      await reportUser(profile.id, {
        reasonCode: reportReasonCode,
        reasonText: reasonText || null,
      });
      setReportModalOpen(false);
      showMessage("Жалоба отправлена. Администрация рассмотрит обращение.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отправить жалобу: ${err.message}`, true);
    } finally {
      setReportLoading(false);
    }
  }

  async function handleUserBlock() {
    if (!profile?.id) return;

    const confirmed = window.confirm("Добавить пользователя в черный список?");
    if (!confirmed) return;

    try {
      setUserBlockLoading(true);
      const result = await blockUser(profile.id);
      setProfile((current) => current
        ? {
            ...current,
            isBlockedByCurrentUser: true,
            hasBlockedCurrentUser: Boolean(result?.hasBlockedCurrentUser || current.hasBlockedCurrentUser),
            isInteractionBlocked: true,
            interactionBlockText: result?.interactionBlockText || "Пользователь находится в черном списке. Профиль и личные сообщения недоступны.",
            avatarUrl: null,
            firstName: null,
            lastName: null,
            region: null,
            about: null,
            entries: [],
          }
        : current);
      setFriendshipStatus(null);
      setProfileMenuOpen(false);
      showMessage("Пользователь добавлен в черный список.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось добавить пользователя в черный список: ${err.message}`, true);
    } finally {
      setUserBlockLoading(false);
    }
  }

  async function handleUserUnblock() {
    if (!profile?.id) return;

    try {
      setUserBlockLoading(true);
      const result = await unblockUser(profile.id);
      setProfile((current) => current
        ? {
            ...current,
            isBlockedByCurrentUser: false,
            hasBlockedCurrentUser: Boolean(result?.hasBlockedCurrentUser),
            isInteractionBlocked: Boolean(result?.isInteractionBlocked),
            interactionBlockText: result?.isInteractionBlocked
              ? "Профиль недоступен. Пользователь ограничил взаимодействие с вами."
              : null,
          }
        : current);
      setProfileMenuOpen(false);
      showMessage("Пользователь удалён из черного списка.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось удалить пользователя из черного списка: ${err.message}`, true);
    } finally {
      setUserBlockLoading(false);
    }
  }

  async function handleAdminDeleteEntry(entry) {
    if (!entry?.id) return;

    const confirmed = window.confirm("Удалить эту запись как администратор? Действие нельзя отменить.");
    if (!confirmed) return;

    try {
      setAdminActionLoading(true);
      await adminDeleteFishingEntry(entry.id);
      setProfile((current) => current
        ? {
            ...current,
            entries: (current.entries || []).filter((item) => item.id !== entry.id),
          }
        : current);
      setSelectedEntry((current) => current?.id === entry.id ? null : current);
      showMessage("Запись удалена администратором.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось удалить запись: ${err.message}`, true);
    } finally {
      setAdminActionLoading(false);
    }
  }

  function openBlockUserModal() {
    setBlockReasonCode("rules");
    setBlockReasonText("");
    setBlockModalOpen(true);
  }

  async function handleAdminUnblockUser() {
    if (!profile?.id) return;

    const confirmed = window.confirm("Разблокировать этого пользователя?");
    if (!confirmed) return;

    try {
      setAdminActionLoading(true);
      const result = await adminUnblockUser(profile.id);

      setProfile((current) => current
        ? {
            ...current,
            isBlocked: Boolean(result?.isBlocked),
            blockReasonCode: null,
            blockReasonText: null,
            blockedAtUtc: null,
          }
        : current);
      showMessage("Пользователь разблокирован.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось разблокировать пользователя: ${err.message}`, true);
    } finally {
      setAdminActionLoading(false);
    }
  }

  async function handleAdminBlockUser(event) {
    event.preventDefault();
    if (!profile?.id) return;

    const reasonText = blockReasonText.trim();

    if (blockReasonCode === "other" && !reasonText) {
      showMessage("Укажите текст причины блокировки.", true);
      return;
    }

    try {
      setAdminActionLoading(true);
      const result = await adminBlockUser(profile.id, {
        reasonCode: blockReasonCode,
        reasonText: reasonText || null,
      });

      setProfile((current) => current
        ? {
            ...current,
            isBlocked: Boolean(result?.isBlocked),
            blockReasonCode: result?.blockReasonCode || blockReasonCode,
            blockReasonText: result?.blockReasonText || reasonText,
            blockedAtUtc: result?.blockedAtUtc || new Date().toISOString(),
          }
        : current);
      setBlockModalOpen(false);
      showMessage("Пользователь заблокирован.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось заблокировать пользователя: ${err.message}`, true);
    } finally {
      setAdminActionLoading(false);
    }
  }

  function handleAdminToggleBlockUser() {
    if (!profile?.id) return;

    if (profile.isBlocked) {
      handleAdminUnblockUser();
      return;
    }

    openBlockUserModal();
  }

  function renderFriendButton() {
    if (profile?.isInteractionBlocked) return null;
    if (!friendshipStatus) return null;

    if (friendshipStatus.isFriend) {
      return (
        <button
          className="button-danger"
          onClick={handleRemoveFriend}
          disabled={actionLoading}
          type="button"
        >
          {actionLoading ? "Обработка..." : "Удалить из друзей"}
        </button>
      );
    }

    if (friendshipStatus.isOutgoingRequest) {
      return (
        <button
          className="button-secondary"
          onClick={handleCancelRequest}
          disabled={actionLoading}
          type="button"
        >
          {actionLoading ? "Обработка..." : "Заявка отправлена"}
        </button>
      );
    }

    if (friendshipStatus.isIncomingRequest) {
      return (
        <button className="button-secondary" disabled type="button">
          Вам отправлена заявка
        </button>
      );
    }

    return (
      <button onClick={handleAddFriend} disabled={actionLoading} type="button">
        {actionLoading ? "Отправка..." : "Добавить в друзья"}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="page-container">
        <p className="muted-text">Загрузка...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <p className="error-text">{message || "Профиль не найден"}</p>
      </div>
    );
  }

  const entries = profile.entries || [];
  const isAdmin = Boolean(user?.isAdmin || user?.IsAdmin);

  if (profile.isBlocked && !isAdmin) {
    return (
      <div className="page-container profile-page">
        <section className="profile-hero card">
          <div className="profile-cover">
            <div className="profile-cover-badge">Профиль ограничен</div>
          </div>

          <div className="profile-main">
            <div className="profile-avatar profile-avatar-large profile-avatar-placeholder" aria-hidden="true">
              !
            </div>

            <div className="profile-info">
              <p className="profile-kicker">Публичный профиль</p>
              <h1>Аккаунт заблокирован</h1>
              <p className="profile-region">Доступ к профилю временно ограничен.</p>
              <p className="profile-about">
                Публикации, фото профиля и действия пользователя скрыты.
              </p>
            </div>
          </div>
        </section>

        <section className="profile-content-card card">
          <div className="profile-section-header">
            <div>
              <p className="profile-kicker">Статус аккаунта</p>
              <h2 className="section-title">Аккаунт заблокирован</h2>
            </div>
          </div>

          <EmptyState
            title="Профиль недоступен"
            text="Доступ к профилю ограничен администрацией сервиса. Публикации и действия пользователя скрыты."
          />
        </section>
      </div>
    );
  }

  if (profile.isInteractionBlocked && !isAdmin) {
    return (
      <div className="page-container profile-page">
        <section className="profile-hero card">
          <div className="profile-cover">
            <div className="profile-cover-badge">Профиль недоступен</div>
          </div>

          <div className="profile-main">
            <Avatar userName="П" avatarUrl={null} size="large" />
            <div className="profile-info">
              <p className="profile-kicker">Ограничение доступа</p>
              <h1>Профиль недоступен</h1>
              <p className="profile-username">@{profile.userName}</p>
              <p className="profile-about">{getInteractionBlockText(profile)}</p>
            </div>
          </div>

          <div className="profile-actions">
            {profile.isBlockedByCurrentUser && (
              <button
                className="button-secondary"
                onClick={handleUserUnblock}
                disabled={userBlockLoading}
                type="button"
              >
                {userBlockLoading ? "Обработка..." : "Убрать из черного списка"}
              </button>
            )}
          </div>
        </section>

        {message && (
          <p className={isErrorMessage ? "error-text profile-message" : "success-text profile-message"}>
            {message}
          </p>
        )}

        <section className="profile-content-card card">
          <EmptyState
            title="Записи недоступны"
            text="Публикации пользователя скрыты из-за ограничения взаимодействия."
          />
        </section>
      </div>
    );
  }

  const presenceStatus = formatPresence(presence);

  return (
    <div className="page-container profile-page">
      <section className="profile-hero card">
        <div className="profile-cover">
          <div className="profile-cover-badge">Профиль рыбака</div>
        </div>

        <div className="profile-main">
          <Avatar
            userName={getDisplayName(profile)}
            avatarUrl={profile.avatarUrl}
            size="large"
            onClick={profile.avatarUrl ? () => setIsAvatarOpen(true) : undefined}
          />

          <div className="profile-info">
            <p className="profile-kicker">Публичный профиль</p>
            <h1>{getDisplayName(profile)}</h1>
            <p className="profile-username">@{profile.userName}</p>
            {profile.isBlocked && (
              <div style={{ margin: "6px 0 0" }}>
                <p className="error-text" style={{ margin: 0, fontWeight: 800 }}>Пользователь заблокирован</p>
                <p className="muted-text" style={{ margin: "4px 0 0" }}>Причина: {getBlockReasonText(profile)}</p>
              </div>
            )}
            <p className="profile-region">{profile.region || "Регион не указан"}</p>
            <p className="profile-about">
              {profile.about || "Пользователь пока ничего не рассказал о себе."}
            </p>
          </div>
        </div>

        <div className="profile-stats profile-public-stats">
          <div className="profile-stat profile-stat-static profile-public-stat">
            <strong>{entries.length}</strong>
            <span>{entries.length === 1 ? "публикация" : "публикаций"}</span>
          </div>
          <div className={`profile-stat profile-stat-static profile-presence-stat profile-public-presence ${presenceStatus.isOnline ? "is-online" : "is-offline"}`}>
            <strong>
              <span className="profile-presence-dot" aria-hidden="true" />
              {presenceStatus.title}
            </strong>
            <span>{presenceStatus.text}</span>
          </div>
        </div>

        <div className="profile-actions profile-public-actions">
          {renderFriendButton()}
          <button
            className="button-secondary"
            onClick={handleOpenPersonalChat}
            disabled={chatLoading || profile.isBlocked || profile.isInteractionBlocked}
            type="button"
          >
            {chatLoading ? "Открываем..." : "Написать"}
          </button>
          <div className="profile-public-menu-dropdown" ref={profileMenuRef}>
            <button
              className="button-secondary profile-public-menu-button"
              type="button"
              onClick={() => setProfileMenuOpen((value) => !value)}
              aria-label="Действия с профилем"
            >
              ⋯
            </button>
            {profileMenuOpen && (
              <div className="profile-public-menu">
                <button className="button-secondary" type="button" onClick={openReportModal}>
                  Пожаловаться
                </button>
                {profile.isBlockedByCurrentUser ? (
                  <button className="button-secondary" type="button" onClick={handleUserUnblock} disabled={userBlockLoading}>
                    {userBlockLoading ? "Обработка..." : "Убрать из черного списка"}
                  </button>
                ) : (
                  <button className="button-danger" type="button" onClick={handleUserBlock} disabled={userBlockLoading}>
                    {userBlockLoading ? "Обработка..." : "Добавить в черный список"}
                  </button>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <button
              className={profile.isBlocked ? "button-secondary" : "button-danger"}
              onClick={handleAdminToggleBlockUser}
              disabled={adminActionLoading}
              type="button"
            >
              {adminActionLoading
                ? "Обработка..."
                : profile.isBlocked
                  ? "Разблокировать"
                  : "Заблокировать"}
            </button>
          )}
        </div>
      </section>

      {message && (
        <p className={isErrorMessage ? "error-text profile-message" : "success-text profile-message"}>
          {message}
        </p>
      )}

      <section className="profile-content-card card">
        <div className="profile-tabs">
          <button
            className={`profile-tab ${activeTab === "posts" ? "active" : ""}`}
            onClick={() => setActiveTab("posts")}
            type="button"
          >
            Записи
          </button>
          <button
            className={`profile-tab ${activeTab === "info" ? "active" : ""}`}
            onClick={() => setActiveTab("info")}
            type="button"
          >
            Информация
          </button>
        </div>

        {activeTab === "posts" && (
          <>
            <div className="profile-section-header profile-public-section-header">
              <div>
                <h2 className="section-title">Записи пользователя</h2>
              </div>
            </div>

            {entries.length === 0 ? (
              <EmptyState
                title="Публичных записей пока нет"
                text="Когда пользователь опубликует отчёты о рыбалке, они появятся здесь."
              />
            ) : (
              <div className="profile-entry-grid">
                {entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isAdmin={isAdmin}
                    onOpenDetails={setSelectedEntry}
                    onOpenWeather={handleOpenWeather}
                    onOpenMap={handleOpenEntryMap}
                    onOpenFeed={handleOpenEntryInFeed}
                    onShare={openShareEntryModal}
                    onAdminDelete={handleAdminDeleteEntry}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "info" && (
          <div className="profile-info-grid">
            <div className="profile-info-item">
              <span>Имя</span>
              <strong>{profile.firstName || "Не указано"}</strong>
            </div>

            <div className="profile-info-item">
              <span>Фамилия</span>
              <strong>{profile.lastName || "Не указана"}</strong>
            </div>

            <div className="profile-info-item">
              <span>Имя пользователя</span>
              <strong>@{profile.userName}</strong>
            </div>

            <div className="profile-info-item">
              <span>Регион</span>
              <strong>{profile.region || "Не указан"}</strong>
            </div>

            {profile.createdAt && (
              <div className="profile-info-item">
                <span>Дата регистрации</span>
                <strong>{formatDate(profile.createdAt)}</strong>
              </div>
            )}

            <div className="profile-info-item profile-info-item-wide">
              <span>О себе</span>
              <strong>{profile.about || "Описание пока не заполнено"}</strong>
            </div>
          </div>
        )}
      </section>

      {shareModalEntry && (
        <div className="feed-share-modal-backdrop profile-feed-share-modal-backdrop" onClick={closeShareModal}>
          <div className="feed-share-modal" onClick={(event) => event.stopPropagation()}>
            <div className="feed-share-modal-header">
              <div>
                <h3>Поделиться в чат</h3>
                <p>{getEntryShareTitle(shareModalEntry)}</p>
              </div>

              <button
                type="button"
                className="feed-share-close"
                onClick={closeShareModal}
                aria-label="Закрыть"
              >
                <span className="feed-share-close-icon" aria-hidden="true">×</span>
              </button>
            </div>

            <textarea
              className="feed-share-message"
              value={shareMessageText}
              onChange={(event) => setShareMessageText(event.target.value)}
              maxLength={1000}
              placeholder="Сообщение к записи, необязательно"
            />

            <input
              className="feed-input feed-share-search"
              value={shareChatSearch}
              onChange={(event) => setShareChatSearch(event.target.value)}
              placeholder="Найти чат"
            />

            <div className="feed-share-chat-list">
              {loadingShareChats ? (
                <div className="feed-empty-comments">Загружаем чаты...</div>
              ) : filteredShareChats.length === 0 ? (
                <div className="feed-empty-comments">Чаты не найдены.</div>
              ) : (
                filteredShareChats.map((chat) => {
                  const isSelected = selectedShareChatIds.includes(chat.id);
                  const safeAvatarUrl = getSafeImageUrl(chat.targetUserAvatarUrl || chat.avatarUrl);

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className={`feed-share-chat ${isSelected ? "selected" : ""}`}
                      disabled={shareSending}
                      onClick={() => toggleShareChat(chat.id)}
                    >
                      <div className="feed-share-chat-avatar">
                        {safeAvatarUrl ? (
                          <img src={safeAvatarUrl} alt={chat.name || "Чат"} loading="lazy" decoding="async" />
                        ) : (
                          <span>{getInitials(chat.name || "Ч")}</span>
                        )}
                      </div>

                      <div className="feed-share-chat-info">
                        <strong>{chat.name || "Чат"}</strong>
                        <span>{chat.type === "Group" ? "Групповой чат" : chat.type === "Private" ? "Личный чат" : "Чат"}</span>
                      </div>

                      <span className="feed-share-check" aria-hidden="true">
                        <span className="feed-share-check-icon">{isSelected ? "✓" : ""}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="feed-share-footer">
              <div className="feed-share-selected-count">
                Выбрано: {selectedShareChatIds.length}
              </div>

              <button
                type="button"
                className="feed-action-button primary feed-share-send-button"
                disabled={selectedShareChatIds.length === 0 || shareSending}
                onClick={handleSendShareToChats}
              >
                {shareSending ? "Отправляем..." : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      )}

      <EntryDetailsModal
        isOpen={Boolean(selectedEntry)}
        entry={selectedEntry}
        isAdmin={isAdmin}
        onClose={() => setSelectedEntry(null)}
        onOpenWeather={handleOpenWeather}
        onOpenMap={handleOpenEntryMap}
        onOpenFeed={handleOpenEntryInFeed}
        authorLabel={getDisplayName(profile)}
        authorAvatarUrl={profile.avatarUrl}
        authorUserId={profile.id || profile.userId || id}
        onOpenAuthor={handleOpenEntryAuthor}
        onShare={openShareEntryModal}
        onAdminDelete={handleAdminDeleteEntry}
      />

      {reportModalOpen && (
        <div className="profile-modal-backdrop" onClick={() => !reportLoading && setReportModalOpen(false)}>
          <form className="profile-modal-card" onSubmit={handleReportUser} onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <p className="profile-kicker">Жалоба</p>
                <h2>Пожаловаться на пользователя</h2>
              </div>
              <button className="button-secondary" type="button" onClick={() => setReportModalOpen(false)} disabled={reportLoading}>
                Закрыть
              </button>
            </div>

            <div className="form-grid">
              <label>
                Причина
                <select value={reportReasonCode} onChange={(event) => setReportReasonCode(event.target.value)}>
                  {ADMIN_BLOCK_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Комментарий
                <textarea
                  value={reportReasonText}
                  onChange={(event) => setReportReasonText(event.target.value)}
                  placeholder={reportReasonCode === "other" ? "Опишите причину жалобы" : "Можно добавить пояснение"}
                  maxLength={1000}
                  rows={4}
                />
              </label>

              <p className="muted-text" style={{ margin: 0 }}>
                Жалоба будет передана администрации для проверки.
              </p>
            </div>

            <div className="button-row" style={{ marginTop: 14 }}>
              <button type="submit" disabled={reportLoading}>
                {reportLoading ? "Отправка..." : "Отправить жалобу"}
              </button>
              <button className="button-secondary" type="button" onClick={() => setReportModalOpen(false)} disabled={reportLoading}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {blockModalOpen && (
        <div className="profile-modal-backdrop" onClick={() => !adminActionLoading && setBlockModalOpen(false)}>
          <form className="profile-modal-card" onSubmit={handleAdminBlockUser} onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <p className="profile-kicker">Администрирование</p>
                <h2>Причина блокировки</h2>
              </div>
              <button className="button-secondary" type="button" onClick={() => setBlockModalOpen(false)} disabled={adminActionLoading}>
                Закрыть
              </button>
            </div>

            <div className="form-grid">
              <label>
                Причина
                <select value={blockReasonCode} onChange={(event) => setBlockReasonCode(event.target.value)}>
                  {ADMIN_BLOCK_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Другая / дополнительный текст блокировки
                <textarea
                  value={blockReasonText}
                  onChange={(event) => setBlockReasonText(event.target.value)}
                  placeholder={blockReasonCode === "other" ? "Опишите причину блокировки" : "Можно добавить пояснение для пользователя"}
                  maxLength={500}
                  rows={4}
                />
              </label>

              <p className="muted-text" style={{ margin: 0 }}>
                Пользователь увидит эту причину на странице своего профиля.
              </p>
            </div>

            <div className="button-row" style={{ marginTop: 14 }}>
              <button className="button-danger" type="submit" disabled={adminActionLoading}>
                {adminActionLoading ? "Блокируем..." : "Заблокировать"}
              </button>
              <button className="button-secondary" type="button" onClick={() => setBlockModalOpen(false)} disabled={adminActionLoading}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      <AvatarPreviewModal
        isOpen={isAvatarOpen}
        imageUrl={profile.avatarUrl}
        onClose={() => setIsAvatarOpen(false)}
      />
    </div>
  );
}
function getFeedEntryPath(entryId) {
  const params = new URLSearchParams({ entryId });

  let feedRoute = "/feed";

  try {
    const savedRoute = localStorage.getItem("fishingAppFeedRoute");
    if (savedRoute && savedRoute.startsWith("/")) {
      feedRoute = savedRoute;
    }
  } catch {
    // localStorage может быть недоступен, тогда используем fallback
  }

  return `${feedRoute}?${params.toString()}`;
}

