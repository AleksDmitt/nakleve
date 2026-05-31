import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../utils/apiClient";
import { ensureChatConnectionStarted } from "../api/chatHub";
import { getChats } from "../api/chatsApi";
import { getIncomingFriendRequests } from "../api/friendsApi";
import { getCompanionRequests } from "../api/companionsApi";
import { getSafeImageUrl } from "../utils/safeUrl.js";
import LegalDocumentsModal from "./LegalDocumentsModal";

const LEGAL_LINKS = [
  { to: "/terms", label: "Пользовательское соглашение" },
  { to: "/privacy-policy", label: "Политика обработки данных" },
  { to: "/personal-data-consent", label: "Согласие на обработку данных" },
  { to: "/personal-data-distribution-consent", label: "Согласие на распространение данных" },
];


const MAX_VISIBLE_TOASTS = 3;
const MAX_RECENT_BELL_NOTIFICATIONS = 10;
const CHAT_BADGE_SEEN_STORAGE_KEY = "fishchatSeenUnreadChatsCount";

function readSeenChatsBadgeCount() {
  if (typeof window === "undefined") return 0;

  const value = Number(window.sessionStorage.getItem(CHAT_BADGE_SEEN_STORAGE_KEY));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function writeSeenChatsBadgeCount(value) {
  if (typeof window === "undefined") return;

  const safeValue = Math.max(0, Number(value) || 0);
  window.sessionStorage.setItem(CHAT_BADGE_SEEN_STORAGE_KEY, String(safeValue));
}

function createLocalNotificationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNotificationReasonText(reason) {
  switch (reason) {
    case "friend-request-created":
      return {
        title: "Новая заявка в друзья",
        text: "Проверьте входящие заявки в профиле.",
        to: "/profile",
        accent: "friend",
      };
    case "friend-request-accepted":
      return {
        title: "Заявка принята",
        text: "Пользователь добавил вас в друзья.",
        to: "/profile",
        accent: "friend",
      };
    case "friend-request-declined":
      return {
        title: "Заявка отклонена",
        text: "Статус заявки в друзья обновлен.",
        to: "/profile",
        accent: "friend",
      };
    case "friend-removed":
      return {
        title: "Список друзей обновлен",
        text: "Изменения доступны в профиле.",
        to: "/profile",
        accent: "friend",
      };
    case "companion-response-created":
      return {
        title: "Новый отклик",
        text: "Кто-то откликнулся на ваш поиск напарника.",
        to: "/?view=companions",
        accent: "companion",
      };
    case "companion-response-accepted":
      return {
        title: "Отклик принят",
        text: "Статус поиска напарника обновлен.",
        to: "/?view=companions",
        accent: "companion",
      };
    case "companion-response-rejected":
      return {
        title: "Отклик отклонен",
        text: "Статус поиска напарника обновлен.",
        to: "/?view=companions",
        accent: "companion",
      };
    case "companion-response-cancelled":
    case "companion-response-acceptance-cancelled":
      return {
        title: "Отклик отменен",
        text: "Информация по поиску напарника обновлена.",
        to: "/?view=companions",
        accent: "companion",
      };
    case "companion-request-updated":
    case "companion-request-deleted":
    case "companion-request-closed":
      return {
        title: "Поиск напарника обновлен",
        text: "Изменения доступны на странице поиска напарника.",
        to: "/?view=companions",
        accent: "companion",
      };
    case "fishing-entry-like":
      return {
        title: "Новый лайк",
        text: "Кто-то оценил вашу запись.",
        to: "/",
        accent: "feed",
        isFeedActivity: true,
      };
    case "fishing-entry-comment":
      return {
        title: "Новый комментарий",
        text: "Кто-то написал комментарий к вашей записи.",
        to: "/",
        accent: "feed",
        isFeedActivity: true,
      };
    default:
      return {
        title: "Новое уведомление",
        text: "В приложении появились новые события.",
        to: "/profile",
        accent: "default",
      };
  }
}

function buildOtherNotification(payload) {
  const reason = String(payload?.reason || "");
  const meta = getNotificationReasonText(reason);
  const actorName = payload?.actorName || payload?.userName || null;
  const payloadTitle = payload?.title || payload?.notificationTitle;
  const payloadText = payload?.message || payload?.text || payload?.notificationText;
  const entryId = payload?.entryId || payload?.fishingEntryId;
  const companionRequestId = payload?.requestId || payload?.companionRequestId;

  const to = entryId
    ? `/?entryId=${entryId}`
    : reason.startsWith("companion")
      ? `/?view=companions${companionRequestId ? `&requestId=${companionRequestId}` : ""}`
      : meta.to;

  return {
    id: createLocalNotificationId(),
    kind: "other",
    accent: meta.accent,
    title: payloadTitle || meta.title,
    text: payloadText || (actorName ? `${actorName}: ${meta.text}` : meta.text),
    to,
    reason,
    isFeedActivity: Boolean(meta.isFeedActivity),
    createdAt: new Date().toISOString(),
  };
}

function buildChatNotification(payload, options = {}) {
  const { showMessageText = true } = options;
  const senderName = payload?.senderName || payload?.userName || "Новое сообщение";
  const chatName = payload?.chatName || null;
  const preview = payload?.messagePreview || payload?.text || payload?.message || "";
  const chatId = payload?.chatId;

  const shouldShowPreview = Boolean(showMessageText && preview);
  const textParts = [];

  if (chatName && shouldShowPreview) {
    textParts.push(chatName);
  }

  if (shouldShowPreview) {
    textParts.push(preview);
  }

  return {
    id: createLocalNotificationId(),
    kind: "chat",
    title: senderName,
    text: textParts.length > 0 ? textParts.join(" · ") : "Новое сообщение",
    to: chatId ? `/chats?chatId=${chatId}` : "/chats",
    createdAt: new Date().toISOString(),
  };
}

function AppToast({ notification, onOpen, onClose }) {
  const isChat = notification.kind === "chat";

  return (
    <article className={`app-notification-toast ${isChat ? "app-notification-toast--chat" : "app-notification-toast--bell"}`}>
      <button
        type="button"
        className="app-notification-toast__content"
        onClick={() => onOpen(notification)}
      >
        <span className="app-notification-toast__icon" aria-hidden="true">
          {isChat ? "💬" : "🔔"}
        </span>
        <span className="app-notification-toast__text">
          <strong>{notification.title}</strong>
          <span>{notification.text}</span>
        </span>
      </button>

      <button
        type="button"
        className="app-notification-toast__close"
        onClick={() => onClose(notification.id)}
        aria-label="Скрыть уведомление"
      >
        <span aria-hidden="true" />
      </button>
    </article>
  );
}

function BellIcon() {
  return (
    <svg className="app-header-bell__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 9.8C18 6.4 15.4 4 12 4S6 6.4 6 9.8c0 4.8-2 5.6-2 7.2h16c0-1.6-2-2.4-2-7.2Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 20a2.4 2.4 0 0 0 4.4 0"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LegalFooter() {
  return (
    <footer className="legal-footer">
      <div className="legal-footer__inner">
        <span>© НаКлёве</span>
        <nav className="legal-footer__links" aria-label="Юридические документы">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

function NotificationBadge({ count }) {
  const safeCount = Number(count || 0);

  if (safeCount <= 0) return null;

  return (
    <span
      style={{
        position: "absolute",
        top: "-6px",
        right: "-4px",
        minWidth: safeCount > 9 ? "20px" : "10px",
        height: safeCount > 9 ? "20px" : "10px",
        padding: safeCount > 9 ? "0 5px" : 0,
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        color: "#fff",
        background: "#ef4444",
        border: "2px solid rgba(15, 18, 32, 0.96)",
        fontSize: "11px",
        fontWeight: 900,
        lineHeight: 1,
        pointerEvents: "none",
      }}
    >
      {safeCount > 9 ? "9+" : ""}
    </span>
  );
}

function navLinkStyle(isActive) {
  return {
    flex: "1 1 0",
    minWidth: 0,
    height: "44px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "0 6px",
    borderRadius: "12px",
    textDecoration: "none",
    color: isActive ? "#ffffff" : "#cbd5e1",
    background: isActive ? "#2563eb" : "transparent",
    fontWeight: isActive ? 700 : 500,
    fontSize: "clamp(12px, 2.7vw, 14px)",
    lineHeight: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "background 0.2s ease, color 0.2s ease",
  };
}

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const safeUserAvatarUrl = getSafeImageUrl(user?.avatarUrl);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 760 : false
  );
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [navNotifications, setNavNotifications] = useState({
    chats: 0,
    profile: 0,
  });
  const [toastNotifications, setToastNotifications] = useState([]);
  const [recentBellNotifications, setRecentBellNotifications] = useState([]);
  const [feedActivityUnreadCount, setFeedActivityUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const toastTimersRef = useRef(new Map());
  const toastDedupeRef = useRef(new Map());
  const activeChatIdRef = useRef(null);
  const bellRef = useRef(null);
  const mutedChatIdsRef = useRef(new Set());
  const chatBadgeSuppressedRef = useRef(readSeenChatsBadgeCount() > 0);
  const chatBadgeSeenUnreadCountRef = useRef(readSeenChatsBadgeCount());
  const latestUnreadChatsCountRef = useRef(0);

  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/register";

  const isChatDetailsPage = /^\/chats\/[^/]+\/details\/?$/.test(location.pathname);

  const isChatsPage =
    !isChatDetailsPage &&
    (location.pathname === "/chats" || location.pathname.startsWith("/chats/"));

  const shouldHideBottomNav = isKeyboardOpen || isChatDetailsPage || (isChatsPage && isMobileChatOpen);
  const shouldHideHeader = isChatsPage || isChatDetailsPage;
  const shouldHideLegalFooter = isChatsPage || isChatDetailsPage;


  function isOwnChatNotificationPayload(payload) {
    const currentUserId = user?.id ? String(user.id).toLowerCase() : "";
    const senderUserId = payload?.senderUserId ?? payload?.userId ?? payload?.senderId ?? payload?.fromUserId;

    if (!currentUserId || senderUserId == null) {
      return false;
    }

    return String(senderUserId).toLowerCase() === currentUserId;
  }

  function dismissToast(id) {
    const timerId = toastTimersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      toastTimersRef.current.delete(id);
    }

    setToastNotifications((prev) => prev.filter((item) => item.id !== id));
  }

  function pushToast(notification) {
    setToastNotifications((prev) => [notification, ...prev.filter((item) => item.id !== notification.id)].slice(0, MAX_VISIBLE_TOASTS));

    const timerId = window.setTimeout(() => {
      dismissToast(notification.id);
    }, 5200);

    toastTimersRef.current.set(notification.id, timerId);
  }

  function pushBellNotification(notification) {
    setRecentBellNotifications((prev) => [notification, ...prev].slice(0, MAX_RECENT_BELL_NOTIFICATIONS));

    if (notification.isFeedActivity) {
      setFeedActivityUnreadCount((prev) => prev + 1);
    }

    pushToast(notification);
  }

  function openNotification(notification) {
    dismissToast(notification.id);

    if (notification.kind === "other") {
      setBellOpen(false);
    }

    navigate(notification.to || (notification.kind === "chat" ? "/chats" : "/profile"));
  }

  function toggleBell() {
    setBellOpen((prev) => !prev);
    setFeedActivityUnreadCount(0);
  }

  const bellNotificationsCount = Number(navNotifications.profile || 0) + Number(feedActivityUnreadCount || 0);

  const totalNotifications = useMemo(() => {
    const chatCount = isChatsPage ? 0 : Number(navNotifications.chats || 0);
    return chatCount + Number(navNotifications.profile || 0) + Number(feedActivityUnreadCount || 0);
  }, [feedActivityUnreadCount, isChatsPage, navNotifications.chats, navNotifications.profile]);

  useEffect(() => {
    const safeCount = Math.min(totalNotifications, 99);
    document.title = safeCount > 0 ? `НаКлёве • ${safeCount} новых` : "НаКлёве";

    return () => {
      document.title = "НаКлёве";
    };
  }, [totalNotifications]);


  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      toastTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!bellOpen) return undefined;

    function handlePointerDown(event) {
      if (!bellRef.current) return;
      if (bellRef.current.contains(event.target)) return;
      setBellOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [bellOpen]);

  useEffect(() => {
    function updateViewportState() {
      const mobile = window.innerWidth <= 760;
      setIsMobileViewport(mobile);

      const viewport = window.visualViewport;
      if (!viewport) {
        setIsKeyboardOpen(false);
        return;
      }

      const heightDiff = window.innerHeight - viewport.height;
      setIsKeyboardOpen(mobile && heightDiff > 140);
    }

    updateViewportState();
    window.addEventListener("resize", updateViewportState);
    window.visualViewport?.addEventListener("resize", updateViewportState);
    window.visualViewport?.addEventListener("scroll", updateViewportState);

    return () => {
      window.removeEventListener("resize", updateViewportState);
      window.visualViewport?.removeEventListener("resize", updateViewportState);
      window.visualViewport?.removeEventListener("scroll", updateViewportState);
    };
  }, []);

  useEffect(() => {
    function handleMobileChatOpenChange(event) {
      setIsMobileChatOpen(Boolean(event.detail?.isOpen));
    }

    window.addEventListener("fishchat-mobile-chat-open-change", handleMobileChatOpenChange);

    return () => {
      window.removeEventListener("fishchat-mobile-chat-open-change", handleMobileChatOpenChange);
    };
  }, []);

  useEffect(() => {
    if (!isChatsPage) {
      setIsMobileChatOpen(false);
      activeChatIdRef.current = null;
      return;
    }

    // Если пользователь уже открыл страницу чатов, нижний бейдж "Чаты" считаем просмотренным.
    // Непрочитанные внутри списка чатов при этом не сбрасываются.
    chatBadgeSuppressedRef.current = true;
    chatBadgeSeenUnreadCountRef.current = Math.max(
      chatBadgeSeenUnreadCountRef.current,
      latestUnreadChatsCountRef.current
    );
    writeSeenChatsBadgeCount(chatBadgeSeenUnreadCountRef.current);
    setNavNotifications((prev) => ({ ...prev, chats: 0 }));
  }, [isChatsPage]);

  useEffect(() => {
    function handleActiveChatChange(event) {
      const chatId = event.detail?.chatId;
      activeChatIdRef.current = chatId ? String(chatId) : null;
    }

    window.addEventListener("fishchat-active-chat-change", handleActiveChatChange);
    return () => window.removeEventListener("fishchat-active-chat-change", handleActiveChatChange);
  }, []);

  useEffect(() => {
    function handleChatsBadgeSeen(event) {
      const value = Number(event.detail?.unreadCount);
      const unreadCount = Number.isFinite(value) && value >= 0
        ? value
        : latestUnreadChatsCountRef.current;

      latestUnreadChatsCountRef.current = unreadCount;
      chatBadgeSuppressedRef.current = true;
      chatBadgeSeenUnreadCountRef.current = unreadCount;
      writeSeenChatsBadgeCount(unreadCount);
      setNavNotifications((prev) => ({ ...prev, chats: 0 }));
    }

    window.addEventListener("fishchat-chats-badge-seen", handleChatsBadgeSeen);
    return () => window.removeEventListener("fishchat-chats-badge-seen", handleChatsBadgeSeen);
  }, []);

  useEffect(() => {
    setAuthPromptOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNavNotifications({ chats: 0, profile: 0 });
      setToastNotifications([]);
      setRecentBellNotifications([]);
      setFeedActivityUnreadCount(0);
      mutedChatIdsRef.current = new Set();
      chatBadgeSuppressedRef.current = false;
      chatBadgeSeenUnreadCountRef.current = 0;
      latestUnreadChatsCountRef.current = 0;
      writeSeenChatsBadgeCount(0);
      return undefined;
    }

    let cancelled = false;
    let refreshTimeoutId = null;
    let connectionRef = null;

    async function refreshNotifications() {
      try {
        const [chats, incomingFriendRequests, companionRequests] = await Promise.all([
          getChats(),
          getIncomingFriendRequests(),
          getCompanionRequests(),
        ]);

        if (cancelled) return;

        const mutedChatIds = Array.isArray(chats)
          ? new Set(chats.filter((chat) => chat?.isMuted).map((chat) => String(chat.id)))
          : new Set();

        mutedChatIdsRef.current = mutedChatIds;

        const unreadChatsCount = Array.isArray(chats)
          ? chats.reduce((sum, chat) => {
              if (chat?.isMuted) return sum;
              return sum + Number(chat.unreadCount || (chat.hasUnread ? 1 : 0));
            }, 0)
          : 0;

        latestUnreadChatsCountRef.current = unreadChatsCount;

        const storedSeenUnreadCount = readSeenChatsBadgeCount();
        if (storedSeenUnreadCount !== chatBadgeSeenUnreadCountRef.current) {
          chatBadgeSeenUnreadCountRef.current = storedSeenUnreadCount;
          chatBadgeSuppressedRef.current = storedSeenUnreadCount > 0;
        }

        const incomingFriendsCount = Array.isArray(incomingFriendRequests)
          ? incomingFriendRequests.length
          : 0;

        const pendingCompanionResponsesCount = Array.isArray(companionRequests)
          ? companionRequests
              .filter((request) => request.userId === user?.id)
              .reduce((sum, request) => sum + Number(request.pendingResponsesCount || 0), 0)
          : 0;

        if (isChatsPage) {
          chatBadgeSuppressedRef.current = true;
          chatBadgeSeenUnreadCountRef.current = unreadChatsCount;
          writeSeenChatsBadgeCount(unreadChatsCount);
        } else if (unreadChatsCount < chatBadgeSeenUnreadCountRef.current) {
          chatBadgeSeenUnreadCountRef.current = unreadChatsCount;
          writeSeenChatsBadgeCount(unreadChatsCount);
        }

        const unreadChatsAfterSeen = Math.max(0, unreadChatsCount - chatBadgeSeenUnreadCountRef.current);

        setNavNotifications({
          chats: isChatsPage || chatBadgeSuppressedRef.current ? unreadChatsAfterSeen : unreadChatsCount,
          profile: incomingFriendsCount + pendingCompanionResponsesCount,
        });
      } catch (err) {
        console.error("Navigation notifications refresh failed:", err);
      }
    }

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = window.setTimeout(refreshNotifications, 180);
    };

    function showChatToastFromPayload(payload) {
      const notificationChatId = payload?.chatId ? String(payload.chatId) : null;
      if (!notificationChatId) return;

      if (isOwnChatNotificationPayload(payload)) {
        return;
      }

      if (payload?.isMuted || mutedChatIdsRef.current.has(notificationChatId)) {
        return;
      }

      // Если открыт именно этот чат, пуш не нужен: пользователь уже видит сообщение.
      // На странице списка чатов и в других чатах уведомление показываем.
      if (activeChatIdRef.current && activeChatIdRef.current === notificationChatId) return;

      // Нижний бейдж чатов считается от количества сообщений, появившихся после последнего захода в чаты.

      if (user?.chatToastsEnabled === false) return;

      const dedupeKey = payload?.messageId || payload?.id || `${notificationChatId}:${payload?.sentAt || payload?.createdAt || payload?.messagePreview || payload?.text || Date.now()}`;
      const now = Date.now();
      const previousAt = toastDedupeRef.current.get(dedupeKey);
      if (previousAt && now - previousAt < 2500) return;

      toastDedupeRef.current.set(dedupeKey, now);
      for (const [key, value] of toastDedupeRef.current.entries()) {
        if (now - value > 10000) {
          toastDedupeRef.current.delete(key);
        }
      }

      pushToast(
        buildChatNotification(payload, {
          showMessageText: !user?.hideChatMessageTextInNotifications,
        })
      );
    }

    function handleChatNotificationChanged(payload) {
      scheduleRefresh();
      showChatToastFromPayload(payload);
    }

    function handleReceiveMessage(payload) {
      scheduleRefresh();
      showChatToastFromPayload({
        ...payload,
        senderUserId: payload?.senderUserId ?? payload?.userId,
        messageId: payload?.id || payload?.messageId,
        messagePreview: payload?.messagePreview || payload?.text || payload?.message,
        senderName: payload?.senderName || payload?.userName,
      });
    }

    function handleNavigationNotificationChanged(payload) {
      scheduleRefresh();
      pushBellNotification(buildOtherNotification(payload));
    }

    async function startGlobalChatConnection() {
      const token = getToken();
      if (!token) return;

      try {
        const connection = await ensureChatConnectionStarted(token);
        if (cancelled) return;

        connectionRef = connection;

        connection.off("ChatNotificationChanged", handleChatNotificationChanged);
        connection.off("ReceiveMessage", handleReceiveMessage);
        connection.off("NavigationNotificationChanged", handleNavigationNotificationChanged);
        connection.off("FriendNotificationChanged", handleNavigationNotificationChanged);
        connection.off("CompanionNotificationChanged", handleNavigationNotificationChanged);
        connection.off("MessageDeletedForAll", scheduleRefresh);

        connection.on("ChatNotificationChanged", handleChatNotificationChanged);
        connection.on("ReceiveMessage", handleReceiveMessage);
        connection.on("NavigationNotificationChanged", handleNavigationNotificationChanged);
        connection.on("FriendNotificationChanged", handleNavigationNotificationChanged);
        connection.on("CompanionNotificationChanged", handleNavigationNotificationChanged);
        connection.on("MessageDeletedForAll", scheduleRefresh);

        try {
          await connection.invoke("PingPresence");
        } catch {
          // старый backend без PingPresence не должен ломать интерфейс
        }
      } catch (err) {
        console.error("Global chat connection start failed:", err);
      }
    }

    refreshNotifications();
    startGlobalChatConnection();

    const intervalId = window.setInterval(refreshNotifications, 60000);
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener("fishchat-notifications-refresh", refreshNotifications);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(refreshTimeoutId);

      if (connectionRef) {
        connectionRef.off("ChatNotificationChanged", handleChatNotificationChanged);
        connectionRef.off("ReceiveMessage", handleReceiveMessage);
        connectionRef.off("NavigationNotificationChanged", handleNavigationNotificationChanged);
        connectionRef.off("FriendNotificationChanged", handleNavigationNotificationChanged);
        connectionRef.off("CompanionNotificationChanged", handleNavigationNotificationChanged);
        connectionRef.off("MessageDeletedForAll", scheduleRefresh);
      }

      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("fishchat-notifications-refresh", refreshNotifications);
    };
  }, [isAuthenticated, isChatsPage, user?.id, user?.chatToastsEnabled, user?.hideChatMessageTextInNotifications]);

  function handleGuestProtectedNavigation(event) {
    if (isAuthenticated) return;

    event.preventDefault();
    setAuthPromptOpen(true);
  }

  function goToLoginFromPrompt() {
    setAuthPromptOpen(false);
    navigate("/login");
  }

  function goToRegisterFromPrompt() {
    setAuthPromptOpen(false);
    navigate("/register");
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        paddingBottom: isAuthPage || shouldHideBottomNav || isChatDetailsPage ? 0 : "90px",
        overflowX: isChatDetailsPage ? "clip" : "hidden",
        overflowY: "visible",
        maxWidth: isChatDetailsPage ? "100%" : undefined,
        boxSizing: "border-box",
      }}
    >
      {!isAuthPage && !shouldHideHeader && (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "rgba(15, 18, 32, 0.92)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="page-container"
            style={{
              paddingTop: "14px",
              paddingBottom: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "22px" }}>НаКлёве</div>

            {isAuthenticated ? (
              <div className="app-header-actions">
                <div className="app-header-bell-wrap" ref={bellRef}>
                  <button
                    type="button"
                    className={`app-header-bell ${bellOpen ? "app-header-bell--active" : ""}`}
                    onClick={toggleBell}
                    title="Уведомления"
                    aria-label="Уведомления"
                  >
                    <BellIcon />
                    <NotificationBadge count={bellNotificationsCount} />
                  </button>

                  {bellOpen && (
                    <div className="app-header-bell-panel">
                      <div className="app-header-bell-panel__head">
                        <strong>Уведомления</strong>
                        {bellNotificationsCount > 0 && <span>{Math.min(bellNotificationsCount, 99)} новых</span>}
                      </div>

                      {navNotifications.profile > 0 && (
                        <button
                          type="button"
                          className="app-header-bell-panel__action"
                          onClick={() => {
                            setBellOpen(false);
                            navigate("/profile");
                          }}
                        >
                          <span>Профиль</span>
                          <small>Есть заявки и отклики, требующие внимания</small>
                        </button>
                      )}

                      {recentBellNotifications.length > 0 ? (
                        <div className="app-header-bell-panel__list">
                          {recentBellNotifications.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              className="app-header-bell-panel__item"
                              onClick={() => openNotification(item)}
                            >
                              <strong>{item.title}</strong>
                              <span>{item.text}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="app-header-bell-panel__empty">Новых уведомлений пока нет.</p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => navigate("/profile")}
                  style={{
                    padding: 0,
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "#334155",
                    border: "2px solid rgba(255,255,255,0.12)",
                    flexShrink: 0,
                  }}
                  title="Профиль"
                >
                  {safeUserAvatarUrl ? (
                    <img
                      src={safeUserAvatarUrl}
                      alt="Профиль"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        color: "#fff",
                      }}
                    >
                      {user?.userName?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    color: "#fff",
                    background: "rgba(255,255,255,0.06)",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Войти
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  style={{
                    border: "none",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    color: "#082f49",
                    background: "linear-gradient(135deg, #67e8f9, #5eead4)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Регистрация
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {isChatsPage ? (
        <main
          style={{
            height: isAuthPage ? "auto" : shouldHideBottomNav ? "100dvh" : "calc(100dvh - 90px)",
            overflow: "hidden",
          }}
        >
          {children}
        </main>
      ) : isChatDetailsPage ? (
        <main className="chat-details-route-main">{children}</main>
      ) : (
        <main className="page-container">{children}</main>
      )}

      {!shouldHideLegalFooter && <LegalFooter />}

      {toastNotifications.length > 0 && (
        <div className="app-notification-toast-stack app-notification-toast-stack--top-right">
          {toastNotifications.map((item) => (
            <AppToast
              key={item.id}
              notification={item}
              onOpen={openNotification}
              onClose={dismissToast}
            />
          ))}
        </div>
      )}

      <LegalDocumentsModal />

      {authPromptOpen && (
        <div
          onMouseDown={() => setAuthPromptOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(2, 6, 23, 0.72)",
            backdropFilter: "blur(10px)",
          }}
        >
          <section
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(100%, 440px)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: "24px",
              padding: "22px",
              background:
                "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 18, 32, 0.98))",
              boxShadow: "0 28px 80px rgba(0, 0, 0, 0.42)",
              color: "#e5e7eb",
            }}
          >
            <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
              <p
                style={{
                  margin: 0,
                  color: "#67e8f9",
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Требуется авторизация
              </p>

              <h2
                style={{
                  margin: 0,
                  color: "#fff",
                  fontSize: "22px",
                  lineHeight: 1.2,
                }}
              >
                Доступ ограничен
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "rgba(226, 232, 240, 0.78)",
                  fontSize: "15px",
                  lineHeight: 1.55,
                }}
              >
                Для доступа к полному функционалу приложения необходимо войти в аккаунт.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setAuthPromptOpen(false)}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.24)",
                  borderRadius: "14px",
                  padding: "11px 16px",
                  color: "#e5e7eb",
                  background: "rgba(255, 255, 255, 0.06)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Остаться
              </button>

              <button
                type="button"
                onClick={goToRegisterFromPrompt}
                style={{
                  border: "1px solid rgba(103, 232, 249, 0.24)",
                  borderRadius: "14px",
                  padding: "11px 16px",
                  color: "#cffafe",
                  background: "rgba(8, 145, 178, 0.18)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Зарегистрироваться
              </button>

              <button
                type="button"
                onClick={goToLoginFromPrompt}
                style={{
                  border: "none",
                  borderRadius: "14px",
                  padding: "11px 18px",
                  color: "#082f49",
                  background: "linear-gradient(135deg, #67e8f9, #5eead4)",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 12px 30px rgba(45, 212, 191, 0.22)",
                }}
              >
                Войти
              </button>
            </div>
          </section>
        </div>
      )}

      {!isAuthPage && !shouldHideBottomNav && (
        <nav
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            background: "rgba(15, 18, 32, 0.96)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="page-container"
            style={{
              paddingTop: "10px",
              paddingBottom: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "8px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "16px",
                padding: "6px",
              }}
            >
              <NavLink to="/" style={({ isActive }) => navLinkStyle(isActive)}>
                Лента
              </NavLink>

              <NavLink
                to="/map-points"
                onClick={handleGuestProtectedNavigation}
                style={({ isActive }) => navLinkStyle(isActive)}
              >
                Карта
              </NavLink>

              <NavLink
                to="/weather"
                onClick={handleGuestProtectedNavigation}
                style={({ isActive }) => navLinkStyle(isActive)}
              >
                Погода
              </NavLink>

              <NavLink
                to="/chats"
                onClick={handleGuestProtectedNavigation}
                style={({ isActive }) => navLinkStyle(isActive)}
              >
                <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  Чаты
                  <NotificationBadge count={navNotifications.chats} />
                </span>
              </NavLink>

              <NavLink
                to="/profile"
                onClick={handleGuestProtectedNavigation}
                style={({ isActive }) => navLinkStyle(isActive)}
              >
                Профиль
              </NavLink>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
