import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicProfile } from "../api/profileApi";
import { createOrGetPersonalChat, getUserPresence } from "../api/chatsApi";
import {
  sendFriendRequest,
  cancelOutgoingFriendRequest,
  removeFriend,
  getFriendshipStatus,
} from "../api/friendsApi";
import "../styles/profile.css";
import { getSafeAppFileUrl, getSafeImageUrl } from "../utils/safeUrl.js";

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
      text: "нет данных о последнем посещении",
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

function EntryMediaGallery({ entry, details = false, alt = "Медиа записи" }) {
  const media = normalizeEntryMedia(entry);
  const [activeIndex, setActiveIndex] = useState(0);

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
  const isVideo = active.mediaType === "video";

  function goPrevious(event) {
    event?.stopPropagation();
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  }

  function goNext(event) {
    event?.stopPropagation();
    setActiveIndex((current) => (current + 1) % media.length);
  }

  return (
    <div className={`profile-entry-media-frame ${details ? "profile-entry-details-image" : ""}`}>
      {isVideo ? (
        <video
          className={details ? "profile-entry-details-media" : "profile-entry-video"}
          src={getSafeAppFileUrl(active.url)}
          controls={details}
          muted={!details}
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={getSafeAppFileUrl(active.url)}
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

function EntryCard({ entry, onOpenDetails, onOpenWeather, onOpenMap, onOpenFeed }) {
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
      className="profile-entry-card profile-entry-card-clickable"
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

        {isPublishedToFeed && (
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
                <button onClick={(event) => stopAndRun(event, onOpenFeed)} type="button">
                  Посмотреть в ленте
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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

function EntryDetailsModal({ entry, isOpen, onClose, onOpenWeather, onOpenMap, onOpenFeed }) {
  if (!isOpen || !entry) return null;

  const fishingStart = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
  const fishingEnd = entry.fishingEndedAt || entry.endTime;
  const hasWeatherPage = entry.latitude != null && entry.longitude != null;
  const hasMapPoint = entry.latitude != null && entry.longitude != null;
  const isPublishedToFeed = entry.isPublishedToFeed ?? true;

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <article className="profile-modal-card profile-entry-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="profile-modal-header">
          <div>
            <p className="profile-kicker">Полная запись</p>
            <h2>{entry.title || "Запись о рыбалке"}</h2>
          </div>
          <button className="profile-form-ghost-button" onClick={onClose} type="button">
            Закрыть
          </button>
        </div>

        <EntryMediaGallery entry={entry} details alt={entry.title || "Запись о рыбалке"} />

        <div className="profile-entry-details-content">
          <div className="profile-entry-details-main">
            <span>{formatFishingRange(fishingStart, fishingEnd)}</span>
            <strong>{entry.locationName || "Место не указано"}</strong>
          </div>

          {entry.weatherSummary && (
            <button
              className="profile-entry-weather-line profile-entry-weather-button"
              onClick={() => onOpenWeather(entry)}
              type="button"
              disabled={!hasWeatherPage}
            >
              <span className="profile-entry-weather-icon">☁</span>
              <span>{entry.weatherSummary}</span>
            </button>
          )}

          {entry.description ? (
            <p className="profile-entry-details-description">{entry.description}</p>
          ) : (
            <p className="muted-text">Описание не заполнено.</p>
          )}

          <div className="profile-entry-meta profile-entry-details-meta">
            {entry.catchType && <span>Рыба: {entry.catchType}</span>}
            {entry.catchWeight != null && entry.catchWeight !== "" && <span>Вес: {entry.catchWeight}</span>}
            {entry.bait && <span>Наживка: {entry.bait}</span>}
            <span>Публичная</span>
            {isPublishedToFeed && <span>Опубликована в ленте</span>}
          </div>

          <div className="profile-entry-details-actions">
            {hasMapPoint && (
              <button className="profile-form-ghost-button" onClick={() => onOpenMap(entry)} type="button">
                Посмотреть на карте
              </button>
            )}
            {hasWeatherPage && (
              <button className="profile-form-ghost-button" onClick={() => onOpenWeather(entry)} type="button">
                Погода в этот день
              </button>
            )}
            {isPublishedToFeed && (
              <button className="profile-form-primary-button" onClick={() => onOpenFeed(entry)} type="button">
                Посмотреть в ленте
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
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

  const [profile, setProfile] = useState(null);
  const [friendshipStatus, setFriendshipStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [presence, setPresence] = useState(null);

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
        await loadFriendshipStatus();
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
    if (!id) return undefined;

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
  }, [id]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = setTimeout(() => {
      setMessage("");
      setIsErrorMessage(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [message]);

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

  function renderFriendButton() {
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
            <p className="profile-region">{profile.region || "Регион не указан"}</p>
            <p className="profile-about">
              {profile.about || "Пользователь пока ничего не рассказал о себе."}
            </p>
          </div>
        </div>

        <div className="profile-stats">
          <div className="profile-stat profile-stat-static">
            <strong>{entries.length}</strong>
            <span>публикаций</span>
          </div>
          <div className={`profile-stat profile-stat-static profile-presence-stat ${presenceStatus.isOnline ? "is-online" : "is-offline"}`}>
            <strong>
              <span className="profile-presence-dot" aria-hidden="true" />
              {presenceStatus.title}
            </strong>
            <span>{presenceStatus.text}</span>
          </div>
        </div>

        <div className="profile-actions">
          {renderFriendButton()}
          <button
            className="button-secondary"
            onClick={handleOpenPersonalChat}
            disabled={chatLoading}
            type="button"
          >
            {chatLoading ? "Открываем..." : "Написать"}
          </button>
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
            <div className="profile-section-header">
              <div>
                <p className="profile-kicker">Лента пользователя</p>
                <h2 className="section-title">Публичные записи</h2>
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
                    onOpenDetails={setSelectedEntry}
                    onOpenWeather={handleOpenWeather}
                    onOpenMap={handleOpenEntryMap}
                    onOpenFeed={handleOpenEntryInFeed}
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

      <EntryDetailsModal
        isOpen={Boolean(selectedEntry)}
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onOpenWeather={handleOpenWeather}
        onOpenMap={handleOpenEntryMap}
        onOpenFeed={handleOpenEntryInFeed}
      />

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

