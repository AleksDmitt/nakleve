import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import MediaLightbox from "../components/MediaLightbox";
import {
  adminDeleteFishingEntry,
  createFishingEntryComment,
  deleteFishingEntryComment,
  getFishingEntryComments,
  getFishingFeed,
  shareFishingEntry,
  toggleFishingEntryLike,
} from "../api/fishingEntriesApi";
import { getChats, shareFishingEntryToChat } from "../api/chatsApi";
import {
  createCompanionResponse,
  getCompanionRequests,
} from "../api/companionsApi";
import { getProfile } from "../api/profileApi";
import "../styles/FeedPage.css";
import {
  getSafeAppFileUrl,
  getSafeImageUrl,
  getSafeOptimizedImageUrl,
  useImageFallback,
} from "../utils/safeUrl.js";

const FEED_FILTERS = {
  NEW: "new",
  POPULAR: "popular",
};

const FEED_VIEWS = {
  POSTS: "posts",
  COMPANIONS: "companions",
};

const COMPANION_RESPONSE_STATUS_LABELS = {
  pending: "Отклик отправлен, ждёт подтверждения",
  accepted: "Вас подтвердили, вы едете",
  rejected: "Отклик отклонён",
  cancelled: "Отклик отменён",
};

const MAP_PAGE_ROUTE = "/map-points";
const WEATHER_PAGE_ROUTE = "/weather";
const COMMENTS_ROOT_LIMIT = 10;
const DESCRIPTION_PREVIEW_LIMIT = 210;
const FEED_PAGE_SIZE = 10;

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateForUrl(value) {
  if (!value) return "";

  if (typeof value === "string") return value.slice(0, 10);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() || "U";
}

function hasCoordinates(entry) {
  return entry?.latitude != null && entry?.longitude != null;
}

function getCatchLabel(entry) {
  const parts = [];

  if (entry.catchType) parts.push(entry.catchType);
  if (entry.catchWeight != null) parts.push(`${entry.catchWeight} кг`);

  return parts.length > 0 ? parts.join(" · ") : "Улов не указан";
}

function getPopularityScore(entry) {
  const likes = Number(entry.likesCount || entry.likeCount || 0);
  const comments = Number(entry.commentsCount || entry.commentCount || 0);
  const shares = Number(entry.sharesCount || entry.shareCount || 0);

  return likes + comments * 2 + shares;
}

function normalizeId(value) {
  return value == null ? "" : String(value).toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function getCurrentUserId(user) {
  return normalizeId(user?.id || user?.userId);
}

function isOpenCompanionRequest(request) {
  return normalizeStatus(request?.status) === "open";
}

function getCompanionSeatsLeft(request) {
  return Math.max(0, Number(request?.seatsCount || 1) - Number(request?.acceptedCount || 0));
}

function getCompanionResponseStatusLabel(status) {
  return COMPANION_RESPONSE_STATUS_LABELS[normalizeStatus(status)] || status || "Отклик отправлен";
}

function getCompanionAuthorName(request) {
  return request?.displayName || request?.authorName || request?.fullName || request?.userName || "Рыбак";
}

function sortCompanionRequests(first, second) {
  const firstDate = new Date(first?.plannedDate || first?.createdAt || 0).getTime() || 0;
  const secondDate = new Date(second?.plannedDate || second?.createdAt || 0).getTime() || 0;
  return firstDate - secondDate;
}

function getCommentId(comment, index) {
  return comment?.id || comment?.commentId || `${comment?.createdAt || "comment"}-${index}`;
}

function normalizeCommentsResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.comments)) return data.comments;
  return [];
}

function normalizeCreatedCommentResponse(data) {
  return data?.comment || data?.createdComment || data;
}

function getCommentTree(comments) {
  const roots = [];
  const repliesByParent = {};

  comments.forEach((comment) => {
    if (comment.parentCommentId) {
      repliesByParent[comment.parentCommentId] = repliesByParent[comment.parentCommentId] || [];
      repliesByParent[comment.parentCommentId].push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots.map((comment) => ({
    ...comment,
    replies: repliesByParent[comment.id] || [],
  }));
}

function getEntryShareTitle(entry) {
  return `${entry.title || "Запись о рыбалке"}${entry.locationName ? ` · ${entry.locationName}` : ""}`;
}

function getDescriptionPreview(description) {
  const text = description?.trim() || "";

  if (text.length <= DESCRIPTION_PREVIEW_LIMIT) {
    return { text, isLong: false };
  }

  const sliced = text.slice(0, DESCRIPTION_PREVIEW_LIMIT);
  const lastSpaceIndex = sliced.lastIndexOf(" ");
  const safeText = lastSpaceIndex > 120 ? sliced.slice(0, lastSpaceIndex) : sliced;

  return {
    text: safeText.trimEnd(),
    isLong: true,
  };
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

function FeedMediaGallery({ entry, details = false, onOpenDetails, onOpenFullscreen }) {
  const media = normalizeEntryMedia(entry);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [entry?.id, media.length]);

  if (media.length === 0) return null;

  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const safeActiveUrl = getSafeAppFileUrl(active?.url);
  if (!safeActiveUrl) return null;

  const isVideo = active.mediaType === "video";

  function goPrevious(event) {
    event.stopPropagation();
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

  function openFullscreen(event) {
    event?.stopPropagation();
    onOpenFullscreen?.(media, Math.min(activeIndex, media.length - 1));
  }

  const mediaNode = isVideo ? (
    <video
      className={details ? "feed-detail-media" : "feed-video"}
      src={safeActiveUrl}
      controls={details}
      muted={!details}
      playsInline
      preload="metadata"
    />
  ) : (
    <img
      className={details ? "feed-detail-media" : "feed-photo"}
      src={safeActiveUrl}
      alt={entry?.title || "Фото рыбалки"}
      loading="lazy"
      decoding="async"
    />
  );

  if (details) {
    return (
      <div
        className="feed-media-gallery feed-detail-gallery feed-gallery-touchable"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={openFullscreen}
        role="button"
        tabIndex={0}
        title="Открыть медиа на весь экран"
      >
        {mediaNode}
        {media.length > 1 && (
          <>
            <button type="button" className="feed-media-nav prev" onClick={goPrevious} aria-label="Предыдущее медиа">‹</button>
            <button type="button" className="feed-media-nav next" onClick={goNext} aria-label="Следующее медиа">›</button>
            <span className="feed-media-counter">{activeIndex + 1} / {media.length}</span>
            <div className="feed-media-dots" aria-hidden="true">
              {media.map((item, index) => (
                <span key={item.id || item.url} className={`feed-media-dot ${index === activeIndex ? "active" : ""}`} />
              ))}
            </div>
          </>
        )}
        {isVideo && <span className="feed-video-badge">▶ Видео</span>}
      </div>
    );
  }

  return (
    <div
      className="feed-photo-wrap feed-media-gallery feed-gallery-touchable"
      onClick={() => onOpenDetails?.(entry)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="button"
      tabIndex={0}
    >
      {mediaNode}
      <div className="feed-photo-gradient">
        <div className="feed-location-pill">📍 {entry.locationName || "Место не указано"}</div>
      </div>
      {media.length > 1 && (
        <>
          <button type="button" className="feed-media-nav prev" onClick={goPrevious} aria-label="Предыдущее медиа">‹</button>
          <button type="button" className="feed-media-nav next" onClick={goNext} aria-label="Следующее медиа">›</button>
          <span className="feed-media-counter">{activeIndex + 1} / {media.length}</span>
          <div className="feed-media-dots" aria-hidden="true">
            {media.map((item, index) => (
              <span key={item.id || item.url} className={`feed-media-dot ${index === activeIndex ? "active" : ""}`} />
            ))}
          </div>
        </>
      )}
      {isVideo && <span className="feed-video-badge">▶ Видео</span>}
    </div>
  );
}


function FeedFullscreenMediaViewer({ viewer, onClose }) {
  const [activeIndex, setActiveIndex] = useState(viewer?.initialIndex || 0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    setActiveIndex(viewer?.initialIndex || 0);
  }, [viewer?.initialIndex, viewer?.media]);

  useEffect(() => {
    if (!viewer) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => Math.max(0, current - 1));
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) => Math.min((viewer.media?.length || 1) - 1, current + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, viewer]);

  if (!viewer?.media?.length) return null;

  const media = viewer.media;
  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const safeUrl = getSafeAppFileUrl(active?.url);
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
    <div className="feed-fullscreen-backdrop" onClick={onClose}>
      <div className="feed-fullscreen-viewer" onClick={(event) => event.stopPropagation()}>
        <div className="feed-fullscreen-topbar">
          <div>
            <strong>Медиа</strong>
            {media.length > 1 && <span>{activeIndex + 1} / {media.length}</span>}
          </div>

          <button type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div
          className="feed-fullscreen-media-wrap"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {safeUrl && isVideo ? (
            <video className="feed-fullscreen-media" src={safeUrl} controls playsInline preload="metadata" />
          ) : (
            safeUrl && <img className="feed-fullscreen-media" src={safeUrl} alt={viewer.title || "Медиа записи"} />
          )}

          {media.length > 1 && (
            <>
              <button type="button" className="feed-fullscreen-nav prev" onClick={goPrevious} aria-label="Предыдущее медиа">
                ‹
              </button>
              <button type="button" className="feed-fullscreen-nav next" onClick={goNext} aria-label="Следующее медиа">
                ›
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export default function FeedPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, authChecked, user: authUser } = useAuth();
  const isGuest = authChecked && !isAuthenticated;
  const isAdmin = Boolean(authUser?.isAdmin || authUser?.IsAdmin);
  const openedEntryFromUrlRef = useRef(null);
  const entryRefs = useRef({});
  const feedLoadMoreRef = useRef(null);
  const isFeedRequestRunningRef = useRef(false);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [activeView, setActiveView] = useState(FEED_VIEWS.POSTS);
  const [currentUser, setCurrentUser] = useState(null);
  const [companionRequests, setCompanionRequests] = useState([]);
  const [companionsLoading, setCompanionsLoading] = useState(false);
  const [companionResponseTexts, setCompanionResponseTexts] = useState({});
  const [feedPage, setFeedPage] = useState(1);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);

  const [activeFilter, setActiveFilter] = useState(FEED_FILTERS.NEW);
  const [regionQuery, setRegionQuery] = useState("");
  const [fishFilter, setFishFilter] = useState("");
  const [debouncedRegionQuery, setDebouncedRegionQuery] = useState("");
  const [expandedEntries, setExpandedEntries] = useState({});
  const [visibleCommentsByEntry, setVisibleCommentsByEntry] = useState({});
  const [expandedReplyGroups, setExpandedReplyGroups] = useState({});
  const [detailEntry, setDetailEntry] = useState(null);
  const [fullscreenViewer, setFullscreenViewer] = useState(null);
  const [openCommentMenuKey, setOpenCommentMenuKey] = useState(null);

  const [commentsByEntry, setCommentsByEntry] = useState({});
  const [commentsLoading, setCommentsLoading] = useState({});
  const [commentTexts, setCommentTexts] = useState({});
  const [replyTargets, setReplyTargets] = useState({});
  const [actionLoading, setActionLoading] = useState({});

  const [shareModalEntry, setShareModalEntry] = useState(null);
  const [availableChats, setAvailableChats] = useState([]);
  const [loadingShareChats, setLoadingShareChats] = useState(false);
  const [shareChatSearch, setShareChatSearch] = useState("");
  const [shareMessageText, setShareMessageText] = useState("");
  const [selectedShareChatIds, setSelectedShareChatIds] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRegionQuery(regionQuery.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [regionQuery]);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      if (!isAuthenticated) {
        setCurrentUser(null);
        return;
      }

      try {
        const profile = await getProfile();
        if (isMounted) setCurrentUser(profile);
      } catch (err) {
        console.error(err);
        if (isMounted) setCurrentUser(null);
      }
    }

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isGuest && activeView !== FEED_VIEWS.POSTS) {
      setActiveView(FEED_VIEWS.POSTS);
    }
  }, [activeView, isGuest]);

  useEffect(() => {
    const view = searchParams.get("view");

    if ((view === "companions" || view === "companion") && !isGuest && activeView !== FEED_VIEWS.COMPANIONS) {
      setActiveView(FEED_VIEWS.COMPANIONS);
    }
  }, [activeView, isGuest, searchParams]);

  const loadFeedPage = useCallback(
    async ({ pageToLoad = 1, replace = false } = {}) => {
      if (isFeedRequestRunningRef.current) return;

      try {
        isFeedRequestRunningRef.current = true;

        if (replace) {
          setLoading(true);
        } else {
          setLoadingMoreFeed(true);
        }

        setMessage("");

        const entryIdFromUrl = searchParams.get("entryId") || "";
        const data = await getFishingFeed({
          page: pageToLoad,
          pageSize: FEED_PAGE_SIZE,
          sort: activeFilter,
          region: debouncedRegionQuery,
          fish: fishFilter,
          entryId: pageToLoad === 1 ? entryIdFromUrl : "",
        });

        const items = Array.isArray(data) ? data : data?.items || [];
        const nextHasMore = Array.isArray(data)
          ? items.length === FEED_PAGE_SIZE
          : Boolean(data?.hasMore);

        setEntries((current) => {
          const source = replace ? [] : current;
          const ids = new Set(source.map((entry) => entry.id));
          const uniqueItems = items.filter((entry) => {
            if (!entry?.id || ids.has(entry.id)) return false;
            ids.add(entry.id);
            return true;
          });

          return [...source, ...uniqueItems];
        });

        setFeedPage(Number(data?.page || pageToLoad));
        setHasMoreFeed(nextHasMore);
      } catch (err) {
        console.error(err);
        setMessage(`Не удалось загрузить ленту: ${err.message}`);
      } finally {
        isFeedRequestRunningRef.current = false;
        setLoading(false);
        setLoadingMoreFeed(false);
      }
    },
    [activeFilter, debouncedRegionQuery, fishFilter, searchParams]
  );

  const loadCompanionRequests = useCallback(async (silent = false) => {
    try {
      if (!silent) setCompanionsLoading(true);
      setMessage("");

      const data = await getCompanionRequests();
      const openRequests = (Array.isArray(data) ? data : [])
        .filter(isOpenCompanionRequest)
        .sort(sortCompanionRequests);

      setCompanionRequests(openRequests);
    } catch (err) {
      console.error(err);
      if (!silent) setMessage(`Не удалось загрузить поиски напарника: ${err.message}`);
    } finally {
      if (!silent) setCompanionsLoading(false);
    }
  }, []);

  useEffect(() => {
    setEntries([]);
    setFeedPage(1);
    setHasMoreFeed(true);
    loadFeedPage({ pageToLoad: 1, replace: true });
  }, [loadFeedPage]);

  useEffect(() => {
    if (activeView !== FEED_VIEWS.COMPANIONS) return undefined;

    loadCompanionRequests(false);

    const intervalId = window.setInterval(() => {
      loadCompanionRequests(true);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [activeView, loadCompanionRequests]);

  useEffect(() => {
    const node = feedLoadMoreRef.current;

    if (!node || loading || loadingMoreFeed || !hasMoreFeed || entries.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const [observerEntry] = observerEntries;

        if (observerEntry.isIntersecting) {
          loadFeedPage({ pageToLoad: feedPage + 1, replace: false });
        }
      },
      { root: null, rootMargin: "900px 0px", threshold: 0.01 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [entries.length, feedPage, hasMoreFeed, loadFeedPage, loading, loadingMoreFeed]);

  useEffect(() => {
    localStorage.setItem("fishingAppFeedRoute", window.location.pathname || "/feed");
  }, []);

  useEffect(() => {
    if (loading) return undefined;

    const entryId = searchParams.get("entryId");
    if (!entryId) return undefined;

    const targetEntry = entries.find((entry) => String(entry.id) === String(entryId));
    const node = entryRefs.current[entryId];

    if (!targetEntry || !node) return undefined;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("feed-card-highlighted");

    if (openedEntryFromUrlRef.current !== entryId) {
      setDetailEntry(targetEntry);
      openedEntryFromUrlRef.current = entryId;
    }

    const timer = setTimeout(() => {
      node.classList.remove("feed-card-highlighted");
    }, 2200);

    return () => clearTimeout(timer);
  }, [loading, searchParams, entries]);

  useEffect(() => {
    if (!shareModalEntry) return;

    async function loadShareChats() {
      try {
        setLoadingShareChats(true);
        setMessage("");
        const data = await getChats();
        setAvailableChats(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setMessage(`Не удалось загрузить чаты: ${err.message}`);
      } finally {
        setLoadingShareChats(false);
      }
    }

    loadShareChats();
  }, [shareModalEntry]);

  useEffect(() => {
    if (!shareModalEntry && !detailEntry) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShareModalEntry(null);
        setShareMessageText("");
        setSelectedShareChatIds([]);
        setDetailEntry(null);
      }
    };

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
  }, [shareModalEntry, detailEntry]);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timer = setTimeout(() => {
      setToastMessage("");
    }, 1800);

    return () => clearTimeout(timer);
  }, [toastMessage]);

  const fishOptions = useMemo(() => {
    const values = entries
      .map((entry) => entry.catchType)
      .filter(Boolean)
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
  }, [entries]);

  const filteredEntries = useMemo(() => entries, [entries]);

  const filteredShareChats = useMemo(() => {
    const query = shareChatSearch.trim().toLowerCase();

    return availableChats.filter((chat) => {
      if (!query) return true;
      return (chat.name || "").toLowerCase().includes(query);
    });
  }, [availableChats, shareChatSearch]);

  function updateEntry(entryId, patch) {
    setEntries((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry))
    );
  }

  function requestAuth() {
    setMessage("Для доступа к функционалу приложения необходимо войти в аккаунт.");
    setToastMessage("Требуется авторизация.");

    return false;
  }

  async function handleToggleLike(entry) {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!entry?.id || actionLoading[`like-${entry.id}`]) return;

    const wasLiked = Boolean(entry.isLikedByCurrentUser);
    const previousLikes = Number(entry.likesCount || 0);

    setActionLoading((current) => ({ ...current, [`like-${entry.id}`]: true }));
    updateEntry(entry.id, {
      isLikedByCurrentUser: !wasLiked,
      likesCount: Math.max(0, previousLikes + (wasLiked ? -1 : 1)),
    });

    try {
      const result = await toggleFishingEntryLike(entry.id);

      updateEntry(entry.id, {
        isLikedByCurrentUser: Boolean(result?.isLiked ?? result?.isLikedByCurrentUser ?? !wasLiked),
        likesCount: Number(result?.likesCount ?? result?.likeCount ?? previousLikes),
      });
    } catch (err) {
      console.error(err);
      updateEntry(entry.id, {
        isLikedByCurrentUser: wasLiked,
        likesCount: previousLikes,
      });
      setMessage(`Не удалось поставить лайк: ${err.message}`);
    } finally {
      setActionLoading((current) => ({ ...current, [`like-${entry.id}`]: false }));
    }
  }

  async function loadComments(entryId, force = false) {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!entryId) return;
    if (!force && commentsByEntry[entryId]) return;

    try {
      setCommentsLoading((current) => ({ ...current, [entryId]: true }));
      const data = await getFishingEntryComments(entryId);
      setCommentsByEntry((current) => ({
        ...current,
        [entryId]: normalizeCommentsResponse(data),
      }));
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось загрузить комментарии: ${err.message}`);
    } finally {
      setCommentsLoading((current) => ({ ...current, [entryId]: false }));
    }
  }

  async function toggleExpanded(entryId) {
    if (isGuest) {
      requestAuth();
      return;
    }

    const nextValue = !expandedEntries[entryId];

    setExpandedEntries((current) => ({
      ...current,
      [entryId]: nextValue,
    }));

    if (nextValue) {
      setVisibleCommentsByEntry((current) => ({
        ...current,
        [entryId]: current[entryId] || COMMENTS_ROOT_LIMIT,
      }));
      await loadComments(entryId);
    }
  }

  function toggleCommentReplies(entryId, commentId) {
    const key = `${entryId}-${commentId}`;

    setExpandedReplyGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function showMoreComments(entryId) {
    setVisibleCommentsByEntry((current) => ({
      ...current,
      [entryId]: (current[entryId] || COMMENTS_ROOT_LIMIT) + COMMENTS_ROOT_LIMIT,
    }));
  }

  async function handleCreateComment(entry) {
    if (isGuest) {
      requestAuth();
      return;
    }

    const entryId = entry.id;
    const text = commentTexts[entryId]?.trim();
    const parentCommentId = replyTargets[entryId]?.id || null;

    if (!text || actionLoading[`comment-${entryId}`]) return;

    try {
      setActionLoading((current) => ({ ...current, [`comment-${entryId}`]: true }));
      const result = await createFishingEntryComment(entryId, text, parentCommentId);
      const createdComment = normalizeCreatedCommentResponse(result);

      setCommentTexts((current) => ({ ...current, [entryId]: "" }));
      setReplyTargets((current) => ({ ...current, [entryId]: null }));

      if (createdComment?.id || createdComment?.commentId) {
        setCommentsByEntry((current) => ({
          ...current,
          [entryId]: [...(current[entryId] || []), createdComment],
        }));
      } else {
        await loadComments(entryId, true);
      }

      updateEntry(entryId, {
        commentsCount:
          Number(result?.commentsCount ?? entry.commentsCount ?? 0) ||
          Number(entry.commentsCount || 0) + 1,
      });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось добавить комментарий: ${err.message}`);
    } finally {
      setActionLoading((current) => ({ ...current, [`comment-${entryId}`]: false }));
    }
  }

  async function handleDeleteComment(entry, commentId) {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!entry?.id || !commentId) return;
    if (!window.confirm("Удалить комментарий?")) return;

    try {
      const result = await deleteFishingEntryComment(entry.id, commentId);
      setCommentsByEntry((current) => ({
        ...current,
        [entry.id]: (current[entry.id] || []).filter(
          (comment) => getCommentId(comment) !== commentId && comment.parentCommentId !== commentId
        ),
      }));
      updateEntry(entry.id, {
        commentsCount: Number(result?.commentsCount ?? Math.max(0, Number(entry.commentsCount || 0) - 1)),
      });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить комментарий: ${err.message}`);
    }
  }

  function openProfile(userId) {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!userId) return;

    const targetUserId = normalizeId(userId);
    const currentUserId = getCurrentUserId(currentUser);

    if (targetUserId && currentUserId && targetUserId === currentUserId) {
      navigate("/profile");
      return;
    }

    navigate(`/users/${userId}`);
  }

  function openMap(entry) {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!hasCoordinates(entry)) return;

    const params = new URLSearchParams({
      lat: String(entry.latitude),
      lon: String(entry.longitude),
      zoom: "16",
      entryId: String(entry.id),
      locationName: entry.locationName || "Место из записи",
    });

    navigate(`${MAP_PAGE_ROUTE}?${params.toString()}`);
  }

  function openWeather(entry) {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!hasCoordinates(entry)) return;

    const params = new URLSearchParams({
      lat: String(entry.latitude),
      lon: String(entry.longitude),
      placeName: entry.locationName || "Место из записи",
    });

    const date = entry.fishingStartedAt || entry.fishingDate;
    const dateForUrl = getDateForUrl(date);

    if (dateForUrl) {
      params.set("date", dateForUrl);
    }

    navigate(`${WEATHER_PAGE_ROUTE}?${params.toString()}`);
  }


  async function handleAdminDeleteEntry(entry) {
    if (!isAdmin || !entry?.id) return;

    const confirmed = window.confirm(`Удалить запись «${entry.title || "без названия"}» из ленты?`);
    if (!confirmed) return;

    try {
      setActionLoading((current) => ({ ...current, [`admin-delete-${entry.id}`]: true }));
      await adminDeleteFishingEntry(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setDetailEntry((current) => (current?.id === entry.id ? null : current));
      setToastMessage("Запись удалена администратором.");
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить запись: ${err.message}`);
    } finally {
      setActionLoading((current) => ({ ...current, [`admin-delete-${entry.id}`]: false }));
    }
  }

  function shareEntry(entry) {
    if (isGuest) {
      requestAuth();
      return;
    }

    setDetailEntry(null);
    setShareModalEntry(entry);
    setShareChatSearch("");
    setShareMessageText("");
    setSelectedShareChatIds([]);
  }

  function toggleShareChat(chatId) {
    setSelectedShareChatIds((current) =>
      current.includes(chatId)
        ? current.filter((id) => id !== chatId)
        : [...current, chatId]
    );
  }

  async function handleSendShareToChats() {
    if (isGuest) {
      requestAuth();
      return;
    }

    if (!shareModalEntry?.id || selectedShareChatIds.length === 0) return;

    const entry = shareModalEntry;
    const previousShares = Number(entry.sharesCount || 0);
    const selectedChats = availableChats.filter((chat) => selectedShareChatIds.includes(chat.id));

    if (selectedChats.length === 0) return;

    try {
      setActionLoading((current) => ({ ...current, [`share-${entry.id}`]: true }));

      const note = shareMessageText.trim();
      let sentCount = 0;

      for (const chat of selectedChats) {
        await shareFishingEntryToChat(chat.id, entry.id, note || null);
        await shareFishingEntry(entry.id);
        sentCount += 1;
      }

      updateEntry(entry.id, {
        sharesCount: previousShares + sentCount,
      });

      setShareModalEntry(null);
      setShareMessageText("");
      setSelectedShareChatIds([]);

      setToastMessage(
        sentCount === 1
          ? `Запись отправлена в чат «${selectedChats[0]?.name || "Чат"}».`
          : `Запись отправлена в ${sentCount} чата.`
      );
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось отправить запись в чат: ${err.message}`);
    } finally {
      setActionLoading((current) => ({ ...current, [`share-${entry.id}`]: false }));
    }
  }

  async function handleCreateCompanionResponse(request) {
    if (isGuest) {
      requestAuth();
      return;
    }

    const requestId = request.id;
    const text = companionResponseTexts[requestId]?.trim() || "";

    if (!requestId || actionLoading[`companion-${requestId}`]) return;

    try {
      setActionLoading((current) => ({ ...current, [`companion-${requestId}`]: true }));
      await createCompanionResponse(requestId, { message: text || null });
      setCompanionResponseTexts((current) => ({ ...current, [requestId]: "" }));
      setToastMessage("Отклик отправлен. Автор поиска должен подтвердить вас.");
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось отправить отклик: ${err.message}`);
    } finally {
      setActionLoading((current) => ({ ...current, [`companion-${requestId}`]: false }));
    }
  }

  function renderCompanionRequestCard(request) {
    const currentUserId = getCurrentUserId(currentUser);
    const isOwner = normalizeId(request.userId) === currentUserId;
    const acceptedCount = Number(request.acceptedCount || 0);
    const seatsCount = Number(request.seatsCount || 1);
    const seatsLeft = getCompanionSeatsLeft(request);
    const hasResponded = Boolean(request.isCurrentUserResponded || request.currentUserResponseStatus);
    const responseStatus = request.currentUserResponseStatus;
    const acceptedResponses = request.acceptedResponses || [];
    const responseText = companionResponseTexts[request.id] || "";
    const loadingKey = `companion-${request.id}`;

    return (
      <article className="feed-card feed-companion-card" key={request.id}>
        <header className="feed-card-header">
          <div className="feed-author">
            <button
              type="button"
              className="feed-avatar-button"
              onClick={() => openProfile(request.userId)}
              title="Открыть профиль"
            >
              <div className="feed-avatar-fallback">{getInitials(getCompanionAuthorName(request))}</div>
            </button>

            <div>
              <button
                type="button"
                className="feed-author-name"
                onClick={() => openProfile(request.userId)}
              >
                {getCompanionAuthorName(request)}
              </button>
              <div className="feed-date">
                <button
                  type="button"
                  className="feed-inline-profile-link"
                  onClick={() => openProfile(request.userId)}
                >
                  @{request.userName || "user"}
                </button>
                <span> · {formatDateTime(request.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="feed-header-actions">
            <span className="feed-companion-status-pill">{acceptedCount}/{seatsCount} едут</span>
            <span className={seatsLeft > 0 ? "feed-companion-status-pill" : "feed-companion-status-pill full"}>
              {seatsLeft > 0 ? `${seatsLeft} свободно` : "Мест нет"}
            </span>
          </div>
        </header>

        <div className="feed-card-body">
          <h2 className="feed-card-title">{request.title}</h2>

          <div className="feed-meta-strip">
            <span>🗓 {formatDateTime(request.plannedDate)}</span>
            <span>🌍 {request.region || "Регион не указан"}</span>
            <span>📍 {request.meetingPoint || "Место встречи не указано"}</span>
          </div>

          {request.description && <p className="feed-description feed-companion-description">{request.description}</p>}

          <div className="feed-companion-stats">
            <span>Откликов: {request.responsesCount || 0}</span>
            <span>Ждут ответа: {request.pendingResponsesCount || 0}</span>
            <span>Подтверждено: {acceptedCount}</span>
          </div>

          {acceptedResponses.length > 0 && (
            <div className="feed-companion-going">
              <strong>Едут:</strong>{" "}
              {acceptedResponses.map((response, index) => (
                <span key={response.id || response.userId || response.userName}>
                  {index > 0 && ", "}
                  <button
                    type="button"
                    className="feed-inline-profile-link"
                    onClick={() => openProfile(response.userId)}
                  >
                    @{response.userName || "user"}
                  </button>
                </span>
              ))}
            </div>
          )}

          {!isOwner && !hasResponded && seatsLeft > 0 && (
            <div className="feed-companion-response-form">
              <input
                className="feed-input"
                value={responseText}
                onChange={(event) => setCompanionResponseTexts((current) => ({ ...current, [request.id]: event.target.value }))}
                placeholder="Сообщение автору — необязательно"
              />
              <button
                className="feed-action-button primary"
                type="button"
                disabled={Boolean(actionLoading[loadingKey])}
                onClick={() => handleCreateCompanionResponse(request)}
              >
                Откликнуться
              </button>
            </div>
          )}

          {!isOwner && hasResponded && (
            <div className="feed-companion-my-status">
              {getCompanionResponseStatusLabel(responseStatus)}
            </div>
          )}

          {isOwner && (
            <div className="feed-companion-my-status">
              Это ваш поиск. Отклики подтверждаются в профиле.
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="feed-page">
      <section className={`feed-toolbar ${activeView === FEED_VIEWS.COMPANIONS ? "feed-toolbar-companions" : ""}`}>
        <div className="feed-tabs feed-view-tabs">
          <button
            type="button"
            className={`feed-tab ${activeView === FEED_VIEWS.POSTS ? "active" : ""}`}
            onClick={() => setActiveView(FEED_VIEWS.POSTS)}
          >
            Записи
          </button>

          <button
            type="button"
            className={`feed-tab ${activeView === FEED_VIEWS.COMPANIONS ? "active" : ""}`}
            onClick={() => {
              if (isGuest) {
                requestAuth();
                return;
              }

              setActiveView(FEED_VIEWS.COMPANIONS);
            }}
          >
            Поиск напарника
          </button>
        </div>

        {activeView === FEED_VIEWS.POSTS ? (
          <>
            <div className="feed-tabs">
              <button
                type="button"
                className={`feed-tab ${activeFilter === FEED_FILTERS.NEW ? "active" : ""}`}
                onClick={() => setActiveFilter(FEED_FILTERS.NEW)}
              >
                Свежие
              </button>

              <button
                type="button"
                className={`feed-tab ${activeFilter === FEED_FILTERS.POPULAR ? "active" : ""}`}
                onClick={() => setActiveFilter(FEED_FILTERS.POPULAR)}
              >
                Популярные
              </button>
            </div>

            <div className="feed-searches">
              <input
                className="feed-input"
                value={regionQuery}
                onChange={(event) => setRegionQuery(event.target.value)}
                placeholder="Регион или место"
              />

              <select
                className="feed-select"
                value={fishFilter}
                onChange={(event) => setFishFilter(event.target.value)}
              >
                <option value="">Любая рыба</option>
                {fishOptions.map((fish) => (
                  <option key={fish} value={fish}>
                    {fish}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="feed-button"
              onClick={() => {
                setRegionQuery("");
                setFishFilter("");
                setActiveFilter(FEED_FILTERS.NEW);
              }}
            >
              Сбросить
            </button>
          </>
        ) : (
          <div className="feed-companion-toolbar-note">
            Управлять поиском напарника можно в профиле.
          </div>
        )}
      </section>

      {isGuest && (
        <section className="feed-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span>Вы просматриваете приложение в гостевом режиме. Для доступа к полному функционалу необходимо войти в аккаунт.</span>
          <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="feed-action-button primary" onClick={() => navigate("/login")}>
              Войти
            </button>
            <button type="button" className="feed-action-button" onClick={() => navigate("/register")}>
              Регистрация
            </button>
          </span>
        </section>
      )}

      {message && <div className="feed-message">{message}</div>}
      {toastMessage && <div className="feed-toast">{toastMessage}</div>}

      {activeView === FEED_VIEWS.POSTS ? (
        <>
      {loading ? (
        <div className="feed-loading-state">
          <div className="feed-loading-content">
            <div className="feed-loading-spinner" />
            <strong>Загружаем ленту</strong>
            <p>Собираем записи рыбаков...</p>
          </div>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="feed-empty">
          <div className="feed-empty-icon">🐟</div>
          <h2>Пока нет подходящих записей</h2>
          <p>Попробуй сбросить фильтры или опубликовать свой отчёт в ленту.</p>
        </div>
      ) : (
        <div className="feed-list">
          {filteredEntries.map((entry) => {
            const isExpanded = Boolean(expandedEntries[entry.id]);
            const isLiked = Boolean(entry.isLikedByCurrentUser);
            const likesCount = Number(entry.likesCount || entry.likeCount || 0);
            const commentsCount = Number(entry.commentsCount || entry.commentCount || 0);
            const sharesCount = Number(entry.sharesCount || entry.shareCount || 0);
            const comments = commentsByEntry[entry.id] || [];
            const commentTree = getCommentTree(comments);
            const visibleCommentTree = commentTree;
            const replyTarget = replyTargets[entry.id];
            const descriptionPreview = getDescriptionPreview(entry.description);
            const safeEntryAvatarUrl = getSafeOptimizedImageUrl(entry.avatarPreviewUrl, entry.avatarUrl);

            return (
              <article
                key={entry.id}
                ref={(node) => {
                  if (node) entryRefs.current[entry.id] = node;
                }}
                className="feed-card"
                data-entry-id={entry.id}
              >
                <header className="feed-card-header">
                  <div className="feed-author">
                    <button
                      type="button"
                      className="feed-avatar-button"
                      onClick={() => openProfile(entry.userId)}
                      title="Открыть профиль"
                    >
                      {safeEntryAvatarUrl ? (
                        <img
                          className="feed-avatar"
                          src={safeEntryAvatarUrl}
                          alt={entry.userName || "Аватар"}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="feed-avatar-fallback">{getInitials(entry.userName)}</div>
                      )}
                    </button>

                    <div>
                      <button
                        type="button"
                        className="feed-author-name"
                        onClick={() => openProfile(entry.userId)}
                      >
                        {entry.userName || "Рыбак"}
                      </button>

                      <div className="feed-date">
                        Опубликовано {formatDateTime(entry.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="feed-header-actions">
                    <button
                      type="button"
                      className="feed-mini-button"
                      onClick={() => openProfile(entry.userId)}
                    >
                      Профиль
                    </button>

                    <button
                      type="button"
                      className="feed-mini-button"
                      onClick={() => shareEntry(entry)}
                    >
                      Поделиться · {sharesCount}
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        className="feed-mini-button feed-admin-button"
                        disabled={Boolean(actionLoading[`admin-delete-${entry.id}`])}
                        onClick={() => handleAdminDeleteEntry(entry)}
                        title="Удалить запрещённую запись из ленты"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </header>

                <FeedMediaGallery entry={entry} onOpenDetails={setDetailEntry} />

                <div className="feed-card-body">
                  <h2 className="feed-card-title">
                    {entry.title || "Рыбалка без названия"}
                  </h2>

                  {entry.description && (
                    <p className="feed-description">
                      <span>{descriptionPreview.text}</span>
                      {descriptionPreview.isLong && (
                        <>
                          <span className="feed-description-dots">... </span>
                          <button
                            type="button"
                            className="feed-read-more-inline"
                            onClick={() => setDetailEntry(entry)}
                          >
                            читать далее
                          </button>
                        </>
                      )}
                    </p>
                  )}

                  <div className="feed-meta-strip">
                    <span title="Дата рыбалки">📅 {formatDateTime(entry.fishingStartedAt || entry.fishingDate)}</span>
                    <button
                      type="button"
                      className="feed-meta-action"
                      title={hasCoordinates(entry) ? "Открыть место на карте" : "Для перехода на карту нужны координаты"}
                      disabled={!hasCoordinates(entry)}
                      onClick={() => openMap(entry)}
                    >
                      📍 {entry.locationName || "Место не указано"}
                    </button>
                    <span title="Улов">🐟 {getCatchLabel(entry)}</span>
                    {entry.bait && <span title="Наживка">🪱 {entry.bait}</span>}
                    {entry.weatherSummary && (
                      <button
                        type="button"
                        className="feed-meta-action"
                        title={hasCoordinates(entry) ? "Открыть прогноз погоды" : "Для прогноза нужны координаты"}
                        disabled={!hasCoordinates(entry)}
                        onClick={() => openWeather(entry)}
                      >
                        🌤 {entry.weatherSummary}
                      </button>
                    )}
                  </div>
                </div>

                <footer className="feed-actions">
                  <div className="feed-social-actions">
                    <button
                      type="button"
                      className={`feed-action-button ${isLiked ? "liked" : ""}`}
                      disabled={Boolean(actionLoading[`like-${entry.id}`])}
                      onClick={() => handleToggleLike(entry)}
                    >
                      {isLiked ? "❤️" : "🤍"} {likesCount}
                    </button>

                    <button
                      type="button"
                      className="feed-action-button"
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      💬 {commentsCount}
                    </button>

                  </div>

                  <div className="feed-navigation-actions">
                    <button
                      type="button"
                      className="feed-action-button primary"
                      disabled={!hasCoordinates(entry)}
                      onClick={() => openMap(entry)}
                    >
                      Карта
                    </button>

                    <button
                      type="button"
                      className="feed-action-button"
                      disabled={!hasCoordinates(entry)}
                      onClick={() => openWeather(entry)}
                    >
                      Прогноз
                    </button>
                  </div>
                </footer>

                {isExpanded && (
                  <section className="feed-comments">
                    <h3 className="feed-comments-title">Комментарии</h3>

                    {replyTarget && (
                      <div className="feed-reply-target">
                        <span>Ответ для <b>{replyTarget.userName || "пользователя"}</b></span>
                        <button
                          type="button"
                          onClick={() => setReplyTargets((current) => ({ ...current, [entry.id]: null }))}
                        >
                          Отменить
                        </button>
                      </div>
                    )}

                    <div className="feed-comment-form">
                      <input
                        className="feed-comment-input"
                        value={commentTexts[entry.id] || ""}
                        onChange={(event) =>
                          setCommentTexts((current) => ({
                            ...current,
                            [entry.id]: event.target.value,
                          }))
                        }
                        placeholder={replyTarget ? "Написать ответ" : "Написать комментарий"}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCreateComment(entry);
                          }
                        }}
                      />

                      <button
                        type="button"
                        className="feed-action-button primary"
                        disabled={Boolean(actionLoading[`comment-${entry.id}`])}
                        onClick={() => handleCreateComment(entry)}
                      >
                        Отправить
                      </button>
                    </div>

                    {commentsLoading[entry.id] ? (
                      <div className="feed-empty-comments">Загружаем комментарии...</div>
                    ) : comments.length === 0 ? (
                      <div className="feed-empty-comments">Комментариев пока нет.</div>
                    ) : (
                      <div className="feed-comments-list">
                        {visibleCommentTree.map((comment, commentIndex) => {
                          const commentId = getCommentId(comment, commentIndex);
                          const repliesKey = `${entry.id}-${commentId}`;
                          const repliesOpen = Boolean(expandedReplyGroups[repliesKey]);
                          const repliesCount = comment.replies?.length || 0;

                          return (
                            <div key={commentId} className="feed-comment-thread">
                              <div className="feed-comment">
                                <div className="feed-comment-header">
                                  <span>
                                    <span className="feed-comment-author">
                                      {comment.userName || "Пользователь"}
                                    </span>{" "}
                                    · {formatDateTime(comment.createdAt)}
                                  </span>

                                  <div className="feed-comment-tools">
                                    <button
                                      type="button"
                                      className="feed-comment-reply"
                                      onClick={() => {
                                        setReplyTargets((current) => ({
                                          ...current,
                                          [entry.id]: { id: commentId, userName: comment.userName },
                                        }));
                                      }}
                                    >
                                      Ответить
                                    </button>

                                    {repliesCount > 0 && (
                                      <button
                                        type="button"
                                        className="feed-replies-toggle"
                                        onClick={() => toggleCommentReplies(entry.id, commentId)}
                                      >
                                        <span>{repliesOpen ? "▾" : "▸"}</span>
                                        Ответы {repliesCount}
                                      </button>
                                    )}

                                    {comment.canEdit && (
                                      <div className="feed-comment-menu-wrap">
                                        <button
                                          type="button"
                                          className="feed-comment-menu-button"
                                          aria-label="Меню комментария"
                                          onClick={() =>
                                            setOpenCommentMenuKey((current) =>
                                              current === `${entry.id}-${commentId}` ? null : `${entry.id}-${commentId}`
                                            )
                                          }
                                        >
                                          ⋯
                                        </button>

                                        {openCommentMenuKey === `${entry.id}-${commentId}` && (
                                          <div className="feed-comment-menu">
                                            <button
                                              type="button"
                                              className="danger"
                                              onClick={() => {
                                                setOpenCommentMenuKey(null);
                                                handleDeleteComment(entry, commentId);
                                              }}
                                            >
                                              Удалить
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <p className="feed-comment-text">{comment.text}</p>
                              </div>

                              {repliesOpen && repliesCount > 0 && (
                                <div className="feed-comment-replies">
                                  {comment.replies.map((reply, replyIndex) => {
                                    const replyId = getCommentId(reply, replyIndex);

                                    return (
                                      <div key={replyId} className="feed-comment feed-comment-answer">
                                        <div className="feed-comment-header">
                                          <span>
                                            <span className="feed-comment-author">
                                              {reply.userName || "Пользователь"}
                                            </span>{" "}
                                            · {formatDateTime(reply.createdAt)}
                                          </span>

                                          {reply.canEdit && (
                                            <div className="feed-comment-menu-wrap">
                                              <button
                                                type="button"
                                                className="feed-comment-menu-button"
                                                aria-label="Меню ответа"
                                                onClick={() =>
                                                  setOpenCommentMenuKey((current) =>
                                                    current === `${entry.id}-${replyId}` ? null : `${entry.id}-${replyId}`
                                                  )
                                                }
                                              >
                                                ⋯
                                              </button>

                                              {openCommentMenuKey === `${entry.id}-${replyId}` && (
                                                <div className="feed-comment-menu">
                                                  <button
                                                    type="button"
                                                    className="danger"
                                                    onClick={() => {
                                                      setOpenCommentMenuKey(null);
                                                      handleDeleteComment(entry, replyId);
                                                    }}
                                                  >
                                                    Удалить
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        <p className="feed-comment-text">
                                          {reply.parentUserName && (
                                            <span className="feed-reply-to">@{reply.parentUserName} </span>
                                          )}
                                          {reply.text}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </article>
            );
          })}

          <div ref={feedLoadMoreRef} className="feed-load-more-sentinel" aria-hidden="true" />

          {loadingMoreFeed && (
            <div className="feed-load-more-state">
              <div className="feed-load-more-spinner" />
              <span>Загружаем ещё записи...</span>
            </div>
          )}

          {!hasMoreFeed && filteredEntries.length > 0 && (
            <div className="feed-end-state">Больше записей пока нет</div>
          )}
        </div>
      )}
        </>
      ) : companionsLoading ? (
        <div className="feed-loading-state">
          <div className="feed-loading-content">
            <div className="feed-loading-spinner" />
            <strong>Загружаем поиски напарника</strong>
            <p>Собираем активные предложения...</p>
          </div>
        </div>
      ) : companionRequests.length === 0 ? (
        <div className="feed-empty">
          <div className="feed-empty-icon">🤝</div>
          <h2>Пока нет активных поисков</h2>
          <p>Когда кто-то создаст поиск напарника, он появится здесь автоматически.</p>
        </div>
      ) : (
        <div className="feed-list feed-companion-list">
          {companionRequests.map((request) => renderCompanionRequestCard(request))}
        </div>
      )}

      {detailEntry && (
        <div className="feed-detail-modal-backdrop" onClick={() => setDetailEntry(null)}>
          <article className="feed-detail-modal" onClick={(event) => event.stopPropagation()}>
            <header className="feed-detail-header">
              <div>
                <p className="feed-detail-kicker">Полная запись</p>
                <h2>{detailEntry.title || "Рыбалка без названия"}</h2>
              </div>

              <button
                type="button"
                className="feed-share-close"
                onClick={() => setDetailEntry(null)}
              >
                <span className="feed-share-close-icon" aria-hidden="true">×</span>
              </button>
            </header>

            <FeedMediaGallery
              entry={detailEntry}
              details
              onOpenFullscreen={(media, initialIndex) =>
                setFullscreenViewer({
                  media,
                  initialIndex,
                  title: detailEntry.title || "Запись о рыбалке",
                })
              }
            />

            <div className="feed-detail-author">
              {getSafeImageUrl(detailEntry.avatarUrl) ? (
                <img src={getSafeImageUrl(detailEntry.avatarUrl)} alt={detailEntry.userName || "Автор"} loading="lazy" decoding="async" />
              ) : (
                <span>{getInitials(detailEntry.userName)}</span>
              )}
              <div>
                <strong>{detailEntry.userName || "Рыбак"}</strong>
                <small>Опубликовано {formatDateTime(detailEntry.createdAt)}</small>
              </div>
            </div>

            <div className="feed-detail-meta">
              <span>📅 {formatDateTime(detailEntry.fishingStartedAt || detailEntry.fishingDate)}</span>
              <button
                type="button"
                className="feed-meta-action"
                disabled={!hasCoordinates(detailEntry)}
                onClick={() => openMap(detailEntry)}
              >
                📍 {detailEntry.locationName || "Место не указано"}
              </button>
              <span>🐟 {getCatchLabel(detailEntry)}</span>
              {detailEntry.bait && <span>🪱 {detailEntry.bait}</span>}
              {detailEntry.weatherSummary && (
                <button
                  type="button"
                  className="feed-meta-action"
                  disabled={!hasCoordinates(detailEntry)}
                  onClick={() => openWeather(detailEntry)}
                >
                  🌤 {detailEntry.weatherSummary}
                </button>
              )}
              {hasCoordinates(detailEntry) && <span>🧭 {detailEntry.latitude}, {detailEntry.longitude}</span>}
            </div>

            {detailEntry.description ? (
              <p className="feed-detail-description">{detailEntry.description}</p>
            ) : (
              <p className="feed-detail-description muted">Описание не указано.</p>
            )}

            <footer className="feed-detail-actions">
              <button
                type="button"
                className="feed-action-button primary"
                disabled={!hasCoordinates(detailEntry)}
                onClick={() => openMap(detailEntry)}
              >
                Карта
              </button>

              <button
                type="button"
                className="feed-action-button"
                disabled={!hasCoordinates(detailEntry)}
                onClick={() => openWeather(detailEntry)}
              >
                Прогноз
              </button>

              <button
                type="button"
                className="feed-action-button"
                onClick={() => shareEntry(detailEntry)}
              >
                Поделиться
              </button>
            </footer>
          </article>
        </div>
      )}

      {fullscreenViewer && (
        <MediaLightbox viewer={fullscreenViewer} onClose={() => setFullscreenViewer(null)} />
      )}

      {shareModalEntry && (
        <div
          className="feed-share-modal-backdrop"
          onClick={() => {
            setShareModalEntry(null);
            setShareMessageText("");
            setSelectedShareChatIds([]);
          }}
        >
          <div className="feed-share-modal" onClick={(event) => event.stopPropagation()}>
            <div className="feed-share-modal-header">
              <div>
                <h3>Поделиться в чат</h3>
                <p>{getEntryShareTitle(shareModalEntry)}</p>
              </div>

              <button
                type="button"
                className="feed-share-close"
                onClick={() => {
                  setShareModalEntry(null);
                  setShareMessageText("");
                  setSelectedShareChatIds([]);
                }}
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

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className={`feed-share-chat ${isSelected ? "selected" : ""}`}
                      disabled={Boolean(actionLoading[`share-${shareModalEntry.id}`])}
                      onClick={() => toggleShareChat(chat.id)}
                    >
                      <div className="feed-share-chat-avatar">
                        {getSafeImageUrl(chat.targetUserAvatarUrl || chat.avatarUrl) ? (
                          <img src={getSafeImageUrl(chat.targetUserAvatarUrl || chat.avatarUrl)} alt={chat.name || "Чат"} loading="lazy" decoding="async" />
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
                disabled={
                  selectedShareChatIds.length === 0 ||
                  Boolean(actionLoading[`share-${shareModalEntry.id}`])
                }
                onClick={handleSendShareToChats}
              >
                {actionLoading[`share-${shareModalEntry.id}`] ? "Отправляем..." : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
