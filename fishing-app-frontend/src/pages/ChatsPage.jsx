import { useEffect, useMemo, useRef, useState } from "react";
import {
  getChats,
  getChatMessages,
  sendChatMessage,
  markChatAsRead,
  markChatAsReadUntil,
  deleteChatMessage,
  uploadChatAttachment,
  deletePrivateChatForMe,
  deletePrivateChatForAll,
  getChatDetails,
  getUserPresence,
  leaveChat,
  transferChatOwnership,
  deleteGroupChat,
  deleteGroupChatForMe,
  updateChatNotificationSettings,
} from "../api/chatsApi";
import { ensureChatConnectionStarted } from "../api/chatHub";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getToken } from "../utils/apiClient";
import { useAuth } from "../context/AuthContext";

import ChatSidebar from "../components/chat/ChatSidebar";
import SidebarResizeHandle from "../components/chat/SidebarResizeHandle";
import ChatHeader from "../components/chat/ChatHeader";
import ChatMessagesList from "../components/chat/ChatMessagesList";
import ChatComposer from "../components/chat/ChatComposer";
import ChatContextMenus from "../components/chat/ChatContextMenus";
import CreateGroupChatModal from "../components/chat/CreateGroupChatModal";
import EmptyState from "../components/chat/EmptyState";

import {
  buildMessageItems,
  clampSidebarWidth,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
} from "../utils/chatHelpers";


function getCleanChatName(name) {
  return String(name || "Чат").replace(/^Чат\s+с\s+/i, "").trim() || "Чат";
}

function getChatFreshnessTime(chat) {
  const candidates = [
    chat?.lastMessageAt,
    chat?.lastMessageSentAt,
    chat?.lastMessageCreatedAt,
    chat?.lastMessageDate,
    chat?.lastMessage?.sentAt,
    chat?.lastMessage?.createdAt,
    chat?.latestMessage?.sentAt,
    chat?.latestMessage?.createdAt,
    chat?.sentAt,
    chat?.updatedAt,
    chat?.createdAt,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }

  return 0;
}

function sortChatsByFreshness(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const byTime = getChatFreshnessTime(b) - getChatFreshnessTime(a);
    if (byTime !== 0) return byTime;

    const aUnread = Number(a?.unreadCount || (a?.hasUnread ? 1 : 0));
    const bUnread = Number(b?.unreadCount || (b?.hasUnread ? 1 : 0));
    if (bUnread !== aUnread) return bUnread - aUnread;

    return String(a?.name || "").localeCompare(String(b?.name || ""), "ru");
  });
}

function getVisibleUnreadChatsCount(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, chat) => {
    if (chat?.isMuted) return sum;
    return sum + Number(chat?.unreadCount || (chat?.hasUnread ? 1 : 0));
  }, 0);
}

function mergeChatDetailsIntoListItem(chat, updated) {
  if (!updated?.id || String(chat?.id) !== String(updated.id)) return chat;

  return {
    ...chat,
    name: updated.name ?? chat.name,
    description: updated.description ?? chat.description,
    avatarUrl: updated.avatarUrl ?? chat.avatarUrl,
    targetUserAvatarUrl: updated.avatarUrl ?? chat.targetUserAvatarUrl,
    canMembersInvite: updated.canMembersInvite ?? chat.canMembersInvite,
  };
}

export default function ChatsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isConnectionReady, setIsConnectionReady] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [chatItemMenu, setChatItemMenu] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    typeof window !== "undefined" ? clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH) : SIDEBAR_DEFAULT_WIDTH
  );
  const [chatSearch, setChatSearch] = useState("");
  const [selectedGroupDetails, setSelectedGroupDetails] = useState(null);
  const [loadingGroupDetails, setLoadingGroupDetails] = useState(false);
  const [pendingFilesByChatId, setPendingFilesByChatId] = useState({});
  const [targetUserPresence, setTargetUserPresence] = useState(null);
  const [isMobileChatLayout, setIsMobileChatLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 760 : false
  );
  const [chatScrollRequest, setChatScrollRequest] = useState(null);
  const [typingUsersByChatId, setTypingUsersByChatId] = useState({});

  const currentChatIdRef = useRef(null);
  const urlChatHandledRef = useRef(false);
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});
  const longPressTimerRef = useRef(null);
  const textareaRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const isResizingSidebarRef = useRef(false);
  const pendingScrollModeRef = useRef(null);
  const pendingScrollTargetMessageIdRef = useRef(null);
  const selectedChatRef = useRef(null);
  const chatHistoryPushedRef = useRef(false);
  const handlingChatHistoryBackRef = useRef(false);
  const readBoundaryInProgressRef = useRef(false);
  const lastReadBoundaryMessageIdRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingStartedRef = useRef(false);
  const typingKeepAliveAtRef = useRef(0);
  const currentTypingChatIdRef = useRef(null);
  const typingUserTimersRef = useRef(new Map());

  const currentDraft = selectedChat?.id ? (drafts[selectedChat.id] ?? "") : "";
  const pendingFiles = selectedChat?.id ? (pendingFilesByChatId[selectedChat.id] ?? []) : [];

  const activeTypingUsers = useMemo(() => {
    if (!selectedChat?.id) return [];

    const chatId = String(selectedChat.id);
    const typingUsers = Object.values(typingUsersByChatId[chatId] || {});

    if (typingUsers.length === 0) return [];

    const participantsById = new Map(
      (selectedGroupDetails?.participants || []).map((participant) => [
        String(participant.userId),
        participant,
      ])
    );

    return typingUsers.map((typingUser) => {
      const participant = participantsById.get(String(typingUser.userId));

      return {
        ...typingUser,
        userName: typingUser.userName || participant?.userName || selectedChat.name || "Пользователь",
      };
    });
  }, [selectedChat?.id, selectedChat?.name, selectedGroupDetails?.participants, typingUsersByChatId]);

  function removeTypingUser(chatId, typingUserId) {
    if (!chatId || !typingUserId) return;

    const timerKey = `${chatId}:${typingUserId}`;
    const timerId = typingUserTimersRef.current.get(timerKey);

    if (timerId) {
      window.clearTimeout(timerId);
      typingUserTimersRef.current.delete(timerKey);
    }

    setTypingUsersByChatId((prev) => {
      const currentChatTypingUsers = prev[chatId];
      if (!currentChatTypingUsers?.[typingUserId]) return prev;

      const nextChatTypingUsers = { ...currentChatTypingUsers };
      delete nextChatTypingUsers[typingUserId];

      if (Object.keys(nextChatTypingUsers).length === 0) {
        const next = { ...prev };
        delete next[chatId];
        return next;
      }

      return {
        ...prev,
        [chatId]: nextChatTypingUsers,
      };
    });
  }

  function rememberTypingUser(payload) {
    const chatId = payload?.chatId ? String(payload.chatId) : null;
    const typingUserId = payload?.userId ? String(payload.userId) : null;

    if (!chatId || !typingUserId) return;
    if (typingUserId === String(user?.id || "")) return;

    if (payload?.isTyping === false) {
      removeTypingUser(chatId, typingUserId);
      return;
    }

    setTypingUsersByChatId((prev) => ({
      ...prev,
      [chatId]: {
        ...(prev[chatId] || {}),
        [typingUserId]: {
          userId: typingUserId,
          userName: payload?.userName || null,
          updatedAtUtc: payload?.updatedAtUtc || new Date().toISOString(),
        },
      },
    }));

    const timerKey = `${chatId}:${typingUserId}`;
    const previousTimerId = typingUserTimersRef.current.get(timerKey);
    if (previousTimerId) {
      window.clearTimeout(previousTimerId);
    }

    const timerId = window.setTimeout(() => {
      removeTypingUser(chatId, typingUserId);
    }, 4200);

    typingUserTimersRef.current.set(timerKey, timerId);
  }

  async function sendTypingState(chatId, isTyping) {
    if (!chatId) return;

    const token = getToken();
    if (!token) return;

    try {
      const connection = await ensureChatConnectionStarted(token);
      await connection.invoke("SetTyping", String(chatId), Boolean(isTyping));
    } catch (err) {
      // Если backend еще без SetTyping, чат не должен ломаться.
      console.debug("Chat typing state was not sent:", err);
    }
  }

  function stopTypingNow() {
    window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;

    if (!typingStartedRef.current || !currentTypingChatIdRef.current) {
      return;
    }

    const chatId = currentTypingChatIdRef.current;
    typingStartedRef.current = false;
    currentTypingChatIdRef.current = null;
    typingKeepAliveAtRef.current = 0;

    sendTypingState(chatId, false);
  }

  function handleComposerTypingActivity() {
    if (!selectedChat?.id) return;
    if (selectedChat.type === "Group" && !groupCanSend) return;

    const chatId = String(selectedChat.id);
    const now = Date.now();

    currentTypingChatIdRef.current = chatId;

    if (!typingStartedRef.current || now - typingKeepAliveAtRef.current > 1400) {
      typingStartedRef.current = true;
      typingKeepAliveAtRef.current = now;
      sendTypingState(chatId, true);
    }

    window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      stopTypingNow();
    }, 2100);
  }

  function appendMessageUnique(incomingMessage) {
    if (!incomingMessage?.id) return;

    setMessages((prev) => {
      const exists = prev.some((x) => x.id === incomingMessage.id);
      if (exists) return prev;

      return [...prev, incomingMessage];
    });
  }

  function replaceOptimisticMessageUnique(optimisticId, realMessage) {
    if (!realMessage?.id) return;

    setMessages((prev) => {
      const withoutOptimistic = prev.filter((x) => x.id !== optimisticId);
      const realAlreadyExists = withoutOptimistic.some((x) => x.id === realMessage.id);

      if (realAlreadyExists) {
        return withoutOptimistic;
      }

      return withoutOptimistic.map((x) => x.id === realMessage.id ? realMessage : x).concat(realMessage);
    });
  }

  function updateCurrentDraft(value) {
    if (!selectedChat?.id) return;

    setDrafts((prev) => ({
      ...prev,
      [selectedChat.id]: value,
    }));
  }

  function setPendingFilesForCurrentChat(files) {
    if (!selectedChat?.id) return;

    setPendingFilesByChatId((prev) => ({
      ...prev,
      [selectedChat.id]: files,
    }));
  }

  function autoResizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function focusComposerSoon() {
    window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
      autoResizeTextarea();
    }, 0);
  }

  function closeActiveChat() {
    stopTypingNow();
    setSelectedChat(null);
    setMessages([]);
    setReplyTo(null);
    setContextMenu(null);
    setChatItemMenu(null);
    setShowEmojiPicker(false);
    pendingScrollModeRef.current = null;
    pendingScrollTargetMessageIdRef.current = null;
    setChatScrollRequest(null);
    lastReadBoundaryMessageIdRef.current = null;
  }


  useEffect(() => {
    return () => {
      stopTypingNow();
      typingUserTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      typingUserTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    autoResizeTextarea();
  }, [currentDraft, replyTo, selectedChat?.id]);

  useEffect(() => {
    function handleWindowResize() {
      setSidebarWidth((prev) => clampSidebarWidth(prev));
      setIsMobileChatLayout(window.innerWidth <= 760);
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat?.id]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("fishchat-active-chat-change", {
        detail: { chatId: selectedChat?.id ? String(selectedChat.id) : null },
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent("fishchat-active-chat-change", {
          detail: { chatId: null },
        })
      );
    };
  }, [selectedChat?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function getCurrentUrl() {
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }

    function handlePopState() {
      if (!selectedChatRef.current) return;

      handlingChatHistoryBackRef.current = true;
      chatHistoryPushedRef.current = false;
      closeActiveChat();

      window.setTimeout(() => {
        handlingChatHistoryBackRef.current = false;
      }, 0);
    }

    function handleKeyDown(e) {
      if (e.key !== "Escape") return;
      if (!selectedChatRef.current) return;

      e.preventDefault();
      closeActiveChat();

      if (chatHistoryPushedRef.current && window.history.state?.fishchatChatOpen) {
        const nextState = { ...(window.history.state || {}) };
        delete nextState.fishchatChatOpen;
        window.history.replaceState(nextState, "", getCurrentUrl());
        chatHistoryPushedRef.current = false;
      }
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const state = window.history.state || {};
    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (selectedChat?.id) {
      const nextState = { ...state, fishchatChatOpen: selectedChat.id };

      if (chatHistoryPushedRef.current || state.fishchatChatOpen) {
        window.history.replaceState(nextState, "", url);
      } else {
        window.history.pushState(nextState, "", url);
        chatHistoryPushedRef.current = true;
      }

      return;
    }

    if (handlingChatHistoryBackRef.current) return;

    if (chatHistoryPushedRef.current && state.fishchatChatOpen) {
      const nextState = { ...state };
      delete nextState.fishchatChatOpen;
      window.history.replaceState(nextState, "", url);
      chatHistoryPushedRef.current = false;
    }
  }, [selectedChat?.id]);

  useEffect(() => {
    const isOpen = isMobileChatLayout && Boolean(selectedChat);

    document.body.classList.toggle("fishchat-mobile-chat-open", isOpen);
    window.dispatchEvent(
      new CustomEvent("fishchat-mobile-chat-open-change", {
        detail: { isOpen },
      })
    );

    return () => {
      document.body.classList.remove("fishchat-mobile-chat-open");
      window.dispatchEvent(
        new CustomEvent("fishchat-mobile-chat-open-change", {
          detail: { isOpen: false },
        })
      );
    };
  }, [isMobileChatLayout, selectedChat?.id]);

  function startSidebarResize() {
    isResizingSidebarRef.current = true;
  }

  useEffect(() => {
    function handleMouseMove(e) {
      if (!isResizingSidebarRef.current) return;
      setSidebarWidth(clampSidebarWidth(e.clientX));
      document.body.style.userSelect = "none";
    }

    function handleMouseUp() {
      isResizingSidebarRef.current = false;
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    async function loadSelectedGroupDetails() {
      if (!selectedChat || selectedChat.type !== "Group") {
        setSelectedGroupDetails(null);
        return;
      }

      try {
        setLoadingGroupDetails(true);
        const data = await getChatDetails(selectedChat.id);
        setSelectedGroupDetails(data);
      } catch (err) {
        console.error(err);
        setSelectedGroupDetails(null);
      } finally {
        setLoadingGroupDetails(false);
      }
    }

    loadSelectedGroupDetails();
  }, [selectedChat?.id]);

  useEffect(() => {
    async function loadTargetUserPresence() {
      if (!selectedChat?.targetUserId) {
        setTargetUserPresence(null);
        return;
      }

      try {
        const data = await getUserPresence(selectedChat.targetUserId);
        setTargetUserPresence(data);
      } catch (err) {
        console.error(err);
        setTargetUserPresence(null);
      }
    }

    loadTargetUserPresence();
  }, [selectedChat?.targetUserId]);

  async function loadChats(options = {}) {
    const { showLoader = false } = options;

    try {
      if (showLoader) {
        setLoadingChats(true);
      }

      const data = await getChats();
      const sortedChats = sortChatsByFreshness(data);
      setChats(sortedChats);

      window.dispatchEvent(
        new CustomEvent("fishchat-chats-badge-seen", {
          detail: { unreadCount: getVisibleUnreadChatsCount(sortedChats) },
        })
      );
    } catch (err) {
      setMessage(`Не удалось загрузить чаты: ${err.message}`);
    } finally {
      if (showLoader) {
        setLoadingChats(false);
      }
    }
  }

  async function loadMessages(chatId) {
    try {
      setLoadingMessages(true);
      const data = await getChatMessages(chatId);
      const safeMessages = Array.isArray(data) ? data : [];
      setMessages(safeMessages);
      return safeMessages;
    } catch (err) {
      setMessage(`Не удалось загрузить сообщения: ${err.message}`);
      return [];
    } finally {
      setLoadingMessages(false);
    }
  }

  async function readSelectedChat(chatId) {
    if (!chatId) return;

    try {
      await markChatAsRead(chatId);

      setChats((prev) =>
        sortChatsByFreshness(
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  unreadCount: 0,
                  hasUnread: false,
                }
              : chat
          )
        )
      );

      setSelectedChat((current) =>
        current?.id === chatId
          ? {
              ...current,
              unreadCount: 0,
              hasUnread: false,
            }
          : current
      );

      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
    } catch (err) {
      console.error("Не удалось отметить чат прочитанным:", err);
    }
  }

  async function readSelectedChatUntilMessage(message) {
    if (!selectedChat?.id || !message?.id) return;
    if (readBoundaryInProgressRef.current) return;
    if (lastReadBoundaryMessageIdRef.current === message.id) return;

    readBoundaryInProgressRef.current = true;

    try {
      const result = await markChatAsReadUntil(selectedChat.id, message.id);
      const readAt = result?.readAt ? new Date(result.readAt).getTime() : NaN;

      lastReadBoundaryMessageIdRef.current = message.id;

      if (!Number.isNaN(readAt)) {
        const nextUnreadCount = messages.filter((item) => {
          if (String(item.userId || "") === String(user?.id || "")) return false;
          const sentAt = new Date(item.sentAt).getTime();
          return !Number.isNaN(sentAt) && sentAt > readAt;
        }).length;

        setChats((prev) =>
          sortChatsByFreshness(
            prev.map((chat) =>
              chat.id === selectedChat.id
                ? {
                    ...chat,
                    unreadCount: nextUnreadCount,
                    hasUnread: nextUnreadCount > 0,
                  }
                : chat
            )
          )
        );

        setSelectedChat((current) =>
          current?.id === selectedChat.id
            ? {
                ...current,
                unreadCount: nextUnreadCount,
                hasUnread: nextUnreadCount > 0,
              }
            : current
        );
      }

      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
    } catch (err) {
      console.error("Не удалось обновить позицию прочтения:", err);
    } finally {
      readBoundaryInProgressRef.current = false;
    }
  }

  useEffect(() => {
    loadChats({ showLoader: true });
  }, []);

  useEffect(() => {
    function handleExternalChatUpdated(event) {
      const updated = event.detail?.chat;
      if (!updated?.id) return;

      setChats((prev) =>
        sortChatsByFreshness(
          prev.map((chat) => mergeChatDetailsIntoListItem(chat, updated))
        )
      );

      setSelectedChat((current) => mergeChatDetailsIntoListItem(current, updated));

      setSelectedGroupDetails((current) =>
        current?.id && String(current.id) === String(updated.id)
          ? {
              ...current,
              name: updated.name ?? current.name,
              description: updated.description ?? current.description,
              avatarUrl: updated.avatarUrl ?? current.avatarUrl,
              canMembersInvite: updated.canMembersInvite ?? current.canMembersInvite,
            }
          : current
      );
    }

    window.addEventListener("fishchat-chat-updated", handleExternalChatUpdated);
    return () => window.removeEventListener("fishchat-chat-updated", handleExternalChatUpdated);
  }, []);

  useEffect(() => {
    if (chats.length === 0) return;
    if (urlChatHandledRef.current) return;

    const chatIdFromUrl = searchParams.get("chatId");
    if (!chatIdFromUrl) {
      urlChatHandledRef.current = true;
      return;
    }

    const matchedChat = chats.find((x) => x.id === chatIdFromUrl);
    if (!matchedChat) {
      urlChatHandledRef.current = true;
      return;
    }

    setSelectedChat(matchedChat);
    urlChatHandledRef.current = true;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("chatId");
    setSearchParams(nextParams, { replace: true });
  }, [chats, searchParams, setSearchParams]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let cancelled = false;
    let connection = null;

    const handleReceiveMessage = async (incomingMessage) => {
      const incomingChatId = incomingMessage?.chatId ? String(incomingMessage.chatId) : null;
      const isCurrentChat = incomingChatId && incomingChatId === String(currentChatIdRef.current || "");
      const isOwnMessage = String(incomingMessage?.userId || "").toLowerCase() === String(user?.id || "").toLowerCase();

      if (isCurrentChat) {
        appendMessageUnique(incomingMessage);
      } else if (incomingChatId) {
        setChats((prev) =>
          sortChatsByFreshness(
            prev.map((chat) => {
              if (String(chat.id) !== incomingChatId) return chat;

              const nextUnread = isOwnMessage ? Number(chat.unreadCount || 0) : Number(chat.unreadCount || 0) + 1;

              return {
                ...chat,
                lastMessageText: incomingMessage.text || chat.lastMessageText,
                lastMessageUserName: incomingMessage.userName || chat.lastMessageUserName,
                lastMessageAt: incomingMessage.sentAt || new Date().toISOString(),
                unreadCount: nextUnread,
                hasUnread: nextUnread > 0,
              };
            })
          )
        );
      }

      await loadChats({ showLoader: false });
      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
    };

    const handleMessageDeletedForAll = (payload) => {
      if (!payload?.messageId) return;

      const deletedMessageId = String(payload.messageId);

      setMessages((prev) =>
        prev.map((x) => {
          if (String(x.id) === deletedMessageId) {
            return {
              ...x,
              text: "Сообщение удалено",
              isDeleted: true,
              isDeletedForAll: true,
              attachments: [],
              sharedFishingEntry: null,
              sharedFishingEntryId: null,
            };
          }

          if (String(x.replyToMessageId) === deletedMessageId) {
            return {
              ...x,
              replyToText: "Сообщение удалено",
            };
          }

          return x;
        })
      );

      loadChats({ showLoader: false });
    };

    const handleUserPresenceChanged = (presence) => {
      if (!presence?.userId) return;

      setTargetUserPresence((prev) => {
        if (!selectedChat?.targetUserId) return prev;
        if (selectedChat.targetUserId !== presence.userId) return prev;

        return {
          userId: presence.userId,
          isOnline: presence.isOnline,
          lastSeenAtUtc: presence.lastSeenAtUtc ?? null,
        };
      });
    };

    const handleChatNotificationChanged = async () => {
      await loadChats({ showLoader: false });
    };

    const handleChatUpdated = (updated) => {
      if (!updated?.id) return;

      setChats((prev) =>
        sortChatsByFreshness(prev.map((chat) => mergeChatDetailsIntoListItem(chat, updated)))
      );
      setSelectedChat((current) => mergeChatDetailsIntoListItem(current, updated));
      setSelectedGroupDetails((current) =>
        current?.id && String(current.id) === String(updated.id)
          ? { ...current, ...updated }
          : current
      );
    };

    const handleChatTypingChanged = (payload) => {
      rememberTypingUser(payload);
    };

    const handleChatReadStateChanged = (payload) => {
      const payloadChatId = payload?.chatId ? String(payload.chatId) : null;
      const readerUserId = payload?.userId ? String(payload.userId) : null;
      const readAt = payload?.readAt ? new Date(payload.readAt).getTime() : NaN;

      if (!payloadChatId || payloadChatId !== String(currentChatIdRef.current || "")) return;
      if (!readerUserId || readerUserId === String(user?.id || "")) return;
      if (Number.isNaN(readAt)) return;

      setMessages((prev) =>
        prev.map((msg) => {
          if (String(msg.userId || "") !== String(user?.id || "")) return msg;

          const sentAt = new Date(msg.sentAt).getTime();
          if (Number.isNaN(sentAt) || sentAt > readAt) return msg;
          if (msg.isReadByOthers) return msg;

          return {
            ...msg,
            isReadByOthers: true,
          };
        })
      );
    };

    const handleReconnecting = () => {
      if (!cancelled) setIsConnectionReady(false);
    };

    const handleReconnected = async () => {
      if (cancelled) return;

      setIsConnectionReady(true);

      if (currentChatIdRef.current && connection) {
        try {
          await connection.invoke("JoinChat", currentChatIdRef.current);
        } catch (err) {
          console.error("Rejoin chat error:", err);
        }
      }
    };

    const handleClose = () => {
      if (!cancelled) setIsConnectionReady(false);
    };

    async function initConnection() {
      try {
        connection = await ensureChatConnectionStarted(token);
        if (cancelled) return;

        connection.on("ReceiveMessage", handleReceiveMessage);
        connection.on("MessageDeletedForAll", handleMessageDeletedForAll);
        connection.on("UserPresenceChanged", handleUserPresenceChanged);
        connection.on("ChatNotificationChanged", handleChatNotificationChanged);
        connection.on("ChatUpdated", handleChatUpdated);
        connection.on("ChatReadStateChanged", handleChatReadStateChanged);
        connection.on("ChatTypingChanged", handleChatTypingChanged);
        connection.onreconnecting(handleReconnecting);
        connection.onreconnected(handleReconnected);
        connection.onclose(handleClose);

        setIsConnectionReady(true);
      } catch (err) {
        if (cancelled) return;
        setMessage(`Не удалось подключиться к чату: ${err.message}`);
      }
    }

    initConnection();

    return () => {
      cancelled = true;

      if (connection) {
        connection.off("ReceiveMessage", handleReceiveMessage);
        connection.off("MessageDeletedForAll", handleMessageDeletedForAll);
        connection.off("UserPresenceChanged", handleUserPresenceChanged);
        connection.off("ChatNotificationChanged", handleChatNotificationChanged);
        connection.off("ChatUpdated", handleChatUpdated);
        connection.off("ChatReadStateChanged", handleChatReadStateChanged);
        connection.off("ChatTypingChanged", handleChatTypingChanged);
        connection.onreconnecting(() => {});
        connection.onreconnected(() => {});
        connection.onclose(() => {});
      }
    };
  }, [selectedChat?.targetUserId, user?.id]);

  useEffect(() => {
    async function switchChat() {
      if (!selectedChat?.id) {
        currentChatIdRef.current = null;
        setMessages([]);
        setReplyTo(null);
        pendingScrollModeRef.current = null;
        pendingScrollTargetMessageIdRef.current = null;
        lastReadBoundaryMessageIdRef.current = null;
        return;
      }

      stopTypingNow();

      const nextChatId = selectedChat.id;
      const previousChatId = currentChatIdRef.current;

      if (previousChatId === nextChatId) {
        await loadMessages(nextChatId);
        return;
      }

      currentChatIdRef.current = nextChatId;
      const unreadCountBeforeOpen = Number(selectedChat.unreadCount || 0);
      pendingScrollModeRef.current = unreadCountBeforeOpen > 0 ? "first-unread" : "end";
      pendingScrollTargetMessageIdRef.current = null;
      lastReadBoundaryMessageIdRef.current = null;
      setReplyTo(null);

      try {
        const token = getToken();
        if (!token) return;

        const connection = await ensureChatConnectionStarted(token);
        setIsConnectionReady(true);

        if (previousChatId) {
          try {
            await connection.invoke("LeaveChat", previousChatId);
          } catch (err) {
            console.error("LeaveChat error:", err);
          }
        }

        await connection.invoke("JoinChat", nextChatId);
      } catch (err) {
        console.error("JoinChat error:", err);
      }

      const loadedMessages = await loadMessages(nextChatId);

      const firstUnreadIndex = unreadCountBeforeOpen > 0 && loadedMessages.length > 0
        ? Math.max(0, loadedMessages.length - unreadCountBeforeOpen)
        : -1;
      const firstUnreadMessageId = firstUnreadIndex >= 0
        ? loadedMessages[firstUnreadIndex]?.id ?? null
        : null;

      if (firstUnreadMessageId) {
        pendingScrollTargetMessageIdRef.current = firstUnreadMessageId;
      }

      setChatScrollRequest({
        key: `${nextChatId}-${Date.now()}-${loadedMessages.length}`,
        mode: firstUnreadMessageId ? "first-unread" : "end",
        targetMessageId: firstUnreadMessageId,
      });

      await loadChats({ showLoader: false });
    }

    switchChat();
  }, [selectedChat?.id]);

  // Скролл после открытия чата выполняется внутри ChatMessagesList,
  // где есть прямой доступ к прокручиваемому контейнеру.


  useEffect(() => {
    function handleGlobalClick() {
      setContextMenu(null);
      setChatItemMenu(null);
      setShowEmojiPicker(false);
    }

    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  useEffect(() => {
    if (!highlightedMessageId) return;

    const timer = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1800);

    return () => clearTimeout(timer);
  }, [highlightedMessageId]);

  function createLocalFileId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function buildPendingFile(file, options = {}) {
    const type = file.type || "";
    const isVoiceMessage = Boolean(options.isVoiceMessage);
    const previewType = isVoiceMessage
      ? "audio"
      : type.startsWith("image/")
        ? "image"
        : type.startsWith("video/")
          ? "video"
          : null;

    return {
      localId: createLocalFileId(),
      file,
      previewUrl: previewType ? URL.createObjectURL(file) : null,
      previewType,
      isVoiceMessage,
      voiceDurationMs: Number.isFinite(Number(options.voiceDurationMs)) ? Math.max(0, Math.round(Number(options.voiceDurationMs))) : null,
      voiceWaveform: Array.isArray(options.voiceWaveform) ? options.voiceWaveform.join(",") : (options.voiceWaveform || null),
    };
  }

  function handleAttachmentSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedChat) return;
    if (selectedChat.type === "Group" && !groupCanSend) return;

    setMessage("");

    const prepared = files.map(buildPendingFile);
    setPendingFilesForCurrentChat([...pendingFiles, ...prepared]);

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function handleVoiceRecorded(recording) {
    if (!selectedChat) return;
    if (selectedChat.type === "Group" && !groupCanSend) return;
    if (!recording?.file) return;

    setMessage("");

    const prepared = buildPendingFile(recording.file, {
      isVoiceMessage: true,
      voiceDurationMs: recording.durationMs,
      voiceWaveform: recording.waveform,
    });

    setPendingFilesForCurrentChat([...pendingFiles, prepared]);
    focusComposerSoon();
  }

  function handleComposerPaste(event) {
    if (!selectedChat) return;
    if (selectedChat.type === "Group" && !groupCanSend) return;

    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const pastedFiles = clipboardItems
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file) => file && file.type?.startsWith("image/"));

    if (pastedFiles.length === 0) {
      return;
    }

    event.preventDefault();
    setMessage("");

    const prepared = pastedFiles.map((file, index) => {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const normalizedFile = file.name
        ? file
        : new File([file], `screenshot-${Date.now()}-${index + 1}.${extension}`, { type: file.type || "image/png" });

      return buildPendingFile(normalizedFile);
    });

    setPendingFilesForCurrentChat([...pendingFiles, ...prepared]);
    focusComposerSoon();
  }

  function removePendingFile(localId) {
    const fileToRemove = pendingFiles.find((x) => x.localId === localId);
    if (fileToRemove?.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }

    setPendingFilesForCurrentChat(
      pendingFiles.filter((x) => x.localId !== localId)
    );
  }

  function clearPendingFiles(filesToClear = pendingFiles, options = {}) {
    const { revokeUrls = true } = options;

    if (revokeUrls) {
      filesToClear.forEach((file) => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    }

    setPendingFilesForCurrentChat([]);

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  async function uploadAndSendOptimisticMessage(fileItem, textToSend, replyToMessageId) {
    const optimisticId = `temp-${fileItem.localId}`;

    const optimisticMessage = {
      id: optimisticId,
      chatId: selectedChat.id,
      userId: user?.id,
      userName: user?.userName || "Вы",
      userAvatarUrl: user?.avatarUrl || null,
      text: fileItem === pendingFiles[0] ? textToSend : "",
      sentAt: new Date().toISOString(),
      replyToMessageId,
      replyToUserName: replyTo?.userName ?? null,
      replyToText: replyTo?.text ?? null,
      isDeleted: false,
      isDeletedForAll: false,
      isReadByOthers: false,
      isUploading: true,
      uploadStatusText: "Загрузка файла...",
      attachments: [
        {
          id: fileItem.localId,
          fileName: fileItem.file.name,
          fileUrl: fileItem.previewUrl || "",
          contentType: fileItem.file.type || "application/octet-stream",
          size: fileItem.file.size,
          attachmentType:
            fileItem.isVoiceMessage
              ? "Audio"
              : fileItem.previewType === "image"
                ? "Image"
                : fileItem.previewType === "video"
                  ? "Video"
                  : "Document",
          isVoiceMessage: Boolean(fileItem.isVoiceMessage),
          voiceDurationMs: fileItem.voiceDurationMs || null,
          voiceWaveform: fileItem.voiceWaveform || null,
          isUploading: true,
        },
      ],
    };

    setMessages((prev) => {
      const exists = prev.some((x) => x.id === optimisticId);
      if (exists) return prev;

      return [...prev, optimisticMessage];
    });

    try {
      const uploaded = await uploadChatAttachment(fileItem.file);

      const response = await sendChatMessage(selectedChat.id, {
        text: fileItem === pendingFiles[0] ? textToSend : null,
        replyToMessageId,
        attachments: [
          {
            fileName: uploaded.fileName,
            storedFileName: uploaded.storedFileName,
            fileUrl: uploaded.fileUrl,
            contentType: uploaded.contentType,
            size: uploaded.size,
            attachmentType: uploaded.attachmentType,
            isVoiceMessage: Boolean(fileItem.isVoiceMessage),
            voiceDurationMs: fileItem.voiceDurationMs || null,
            voiceWaveform: fileItem.voiceWaveform || null,
          },
        ],
      });

      replaceOptimisticMessageUnique(optimisticId, response);

      if (fileItem.previewUrl) {
        URL.revokeObjectURL(fileItem.previewUrl);
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticId
            ? {
                ...msg,
                text: fileItem === pendingFiles[0] ? textToSend : "",
                isUploading: false,
                uploadStatusText: "Не удалось загрузить файл",
                attachments: msg.attachments?.map((attachment) => ({
                  ...attachment,
                  isUploading: false,
                  isUploadError: true,
                })),
              }
            : msg
        )
      );

      throw err;
    }
  }

  async function handleSendMessage(e, explicitDraft = null) {
    e?.preventDefault?.();

    const rawDraft = typeof explicitDraft === "string" ? explicitDraft : currentDraft;

    if (!selectedChat) return false;
    if (!rawDraft.trim() && pendingFiles.length === 0) return false;
    if (selectedChat.type === "Group" && !groupCanSend) return false;

    try {
      setMessage("");
      stopTypingNow();
      const textToSend = rawDraft.trim();
      const replyToMessageId = replyTo?.id ?? null;

      if (pendingFiles.length > 0) {
        const filesToSend = [...pendingFiles];

        setDrafts((prev) => ({
          ...prev,
          [selectedChat.id]: "",
        }));
        setReplyTo(null);
        setShowEmojiPicker(false);
        clearPendingFiles(filesToSend, { revokeUrls: false });

        for (const fileItem of filesToSend) {
          await uploadAndSendOptimisticMessage(fileItem, textToSend, replyToMessageId);
        }

        await loadChats({ showLoader: false });
        focusComposerSoon();
        return true;
      }

      const response = await sendChatMessage(selectedChat.id, {
        text: textToSend,
        replyToMessageId,
        attachments: [],
      });

      appendMessageUnique(response);

      setDrafts((prev) => ({
        ...prev,
        [selectedChat.id]: "",
      }));
      setReplyTo(null);
      setShowEmojiPicker(false);

      await loadChats({ showLoader: false });
      focusComposerSoon();
      return true;
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось отправить сообщение: ${err.message}`);
      return false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e, currentDraft);
    }
  }

  function startReply(msg) {
    setReplyTo({
      id: msg.id,
      userName: msg.userName,
      text: msg.sharedFishingEntry
        ? msg.sharedFishingEntry.title || "Запись из ленты"
        : msg.text,
    });
    setContextMenu(null);
    focusComposerSoon();
  }

  function goToUserProfile(userId) {
    if (!userId) return;

    if (user?.id === userId) {
      navigate("/profile");
      return;
    }

    navigate(`/users/${userId}`);
  }

  function scrollToMessage(messageId) {
    const node = messageRefs.current[messageId];
    if (!node) return;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setHighlightedMessageId(messageId);
  }

  function onReplyPreviewClick(replyToMessageId) {
    if (!replyToMessageId) return;
    scrollToMessage(replyToMessageId);
  }

  function openContextMenu({ x, y, messageData }) {
    setContextMenu({
      x,
      y,
      message: messageData,
    });
  }

  function handleContextMenu(e, msg) {
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageData: msg,
    });
  }

  async function openChatItemMenu(e, chat) {
    e.preventDefault();
    setContextMenu(null);

    if (chat.type === "Group") {
      try {
        const details = await getChatDetails(chat.id);

        const currentUserStatus =
          details.currentUserStatus ||
          (chat.lastMessageText === "Вы были исключены из чата"
            ? "Removed"
            : chat.lastMessageText === "Вы вышли из чата"
              ? "Left"
              : null);

        const isDeletedByOwner =
          !!details.isDeletedByOwner ||
          chat.lastMessageText === "Чат удалён владельцем";

        const isOwner =
          details.createdByUserId === user?.id ||
          details.participants?.some(
            (x) => x.userId === user?.id && x.role === "Owner"
          );

        const canOnlyDeleteForMe =
          currentUserStatus === "Removed" ||
          currentUserStatus === "Left" ||
          isDeletedByOwner;

        setChatItemMenu({
          x: e.clientX,
          y: e.clientY,
          chat: { ...chat, isMuted: !!(details.currentUserIsMuted ?? chat.isMuted) },
          isMuted: !!(details.currentUserIsMuted ?? chat.isMuted),
          isOwner,
          currentUserStatus,
          isDeletedByOwner,
          canOnlyDeleteForMe,
          participants: details.participants ?? [],
        });
        return;
      } catch (err) {
        console.error(err);
        setMessage(`Не удалось открыть меню чата: ${err.message}`);
        return;
      }
    }

    setChatItemMenu({
      x: e.clientX,
      y: e.clientY,
      chat,
    });
  }

  async function handleDeletePrivateChatForMe(chat) {
    try {
      setChatItemMenu(null);
      setMessage("");

      await deletePrivateChatForMe(chat.id);

      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setMessages([]);
        setReplyTo(null);
      }

      await loadChats({ showLoader: false });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить чат у себя: ${err.message}`);
    }
  }

  async function handleDeletePrivateChatForAll(chat) {
    const confirmed = window.confirm(
      "Удалить личный чат у всех? Сообщения будут удалены без возможности восстановления."
    );

    if (!confirmed) return;

    try {
      setChatItemMenu(null);
      setMessage("");

      await deletePrivateChatForAll(chat.id);

      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setMessages([]);
        setReplyTo(null);
      }

      await loadChats({ showLoader: false });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить чат у всех: ${err.message}`);
    }
  }

  async function handleDeleteGroupChatForMe(chat) {
    try {
      setChatItemMenu(null);
      setMessage("");

      await deleteGroupChatForMe(chat.id);

      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setMessages([]);
        setReplyTo(null);
        setSelectedGroupDetails(null);
      }

      await loadChats({ showLoader: false });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить чат у себя: ${err.message}`);
    }
  }

  async function handleLeaveGroupChat(chat) {
    const confirmed = window.confirm("Выйти из группового чата?");
    if (!confirmed) return;

    try {
      setChatItemMenu(null);
      setMessage("");
      await leaveChat(chat.id);

      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setMessages([]);
        setReplyTo(null);
        setSelectedGroupDetails(null);
      }

      await loadChats({ showLoader: false });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось выйти из чата: ${err.message}`);
    }
  }

  async function handleTransferOwnershipAndLeave(chat) {
    try {
      setChatItemMenu(null);
      setMessage("");

      const details = await getChatDetails(chat.id);
      const candidates = (details.participants ?? []).filter(
        (x) => x.userId !== user?.id
      );

      if (candidates.length === 0) {
        setMessage("Некому передать права владельца. Сначала добавьте участников.");
        return;
      }

      const list = candidates
        .map((x, index) => `${index + 1}. ${x.userName}${x.role === "Admin" ? " (admin)" : ""}`)
        .join("\n");

      const input = window.prompt(
        `Выберите нового владельца и введите номер:\n\n${list}`
      );

      if (input == null) return;

      const selectedIndex = Number(input);
      if (
        !Number.isInteger(selectedIndex) ||
        selectedIndex < 1 ||
        selectedIndex > candidates.length
      ) {
        setMessage("Некорректный номер участника.");
        return;
      }

      const newOwner = candidates[selectedIndex - 1];

      await transferChatOwnership(chat.id, newOwner.userId);
      await leaveChat(chat.id);

      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setMessages([]);
        setReplyTo(null);
        setSelectedGroupDetails(null);
      }

      await loadChats({ showLoader: false });
      setMessage(`Права переданы пользователю ${newOwner.userName}. Вы вышли из чата.`);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось передать права и выйти: ${err.message}`);
    }
  }

  async function handleDeleteGroupChatFromList(chat) {
    const confirmed = window.confirm(
      "Удалить чат владельцем? У участников останется история только для чтения."
    );
    if (!confirmed) return;

    try {
      setChatItemMenu(null);
      setMessage("");
      await deleteGroupChat(chat.id);

      if (selectedChat?.id === chat.id) {
        const details = await getChatDetails(chat.id);
        setSelectedGroupDetails(details);
      }

      await loadChats({ showLoader: false });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить групповой чат: ${err.message}`);
    }
  }

  async function handleToggleChatMuted(chat) {
    if (!chat?.id) return;

    const nextMuted = !chat.isMuted;

    try {
      setChatItemMenu(null);
      setMessage("");

      const result = await updateChatNotificationSettings(chat.id, nextMuted);
      const isMuted = !!result?.isMuted;

      setChats((prev) =>
        prev.map((item) =>
          item.id === chat.id
            ? { ...item, isMuted }
            : item
        )
      );

      if (selectedChat?.id === chat.id) {
        setSelectedChat((current) => current ? { ...current, isMuted } : current);
      }

      if (selectedGroupDetails?.id === chat.id) {
        setSelectedGroupDetails((current) => current ? { ...current, currentUserIsMuted: isMuted } : current);
      }

      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
      setMessage(isMuted ? "Уведомления чата отключены" : "Уведомления чата включены");
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось изменить уведомления чата: ${err.message}`);
    }
  }

  function handleOpenChatSettings(chat) {
    if (!chat?.id) return;
    setChatItemMenu(null);

    if (chat.type === "Group") {
      navigate(`/chats/${chat.id}/details`);
      return;
    }

    setSelectedChat(chat);
  }

  function handleTouchStart(e, msg) {
    clearTimeout(longPressTimerRef.current);

    const touch = e.touches?.[0];
    if (!touch) return;

    longPressTimerRef.current = setTimeout(() => {
      openContextMenu({
        x: touch.clientX,
        y: touch.clientY,
        messageData: msg,
      });
    }, 850);
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimerRef.current);
  }

  async function handleDeleteMessage(msg, deleteForAll = false) {
    try {
      setContextMenu(null);

      await deleteChatMessage(msg.id, deleteForAll);

      if (deleteForAll) {
        setMessages((prev) =>
          prev.map((x) => {
            if (x.id === msg.id) {
              return {
                ...x,
                text: "Сообщение удалено",
                isDeleted: true,
                isDeletedForAll: true,
                attachments: [],
                sharedFishingEntry: null,
                sharedFishingEntryId: null,
              };
            }

            if (x.replyToMessageId === msg.id) {
              return {
                ...x,
                replyToText: "Сообщение удалено",
              };
            }

            return x;
          })
        );
      } else {
        setMessages((prev) => prev.filter((x) => x.id !== msg.id));
      }

      await loadChats({ showLoader: false });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить сообщение: ${err.message}`);
    }
  }

  function insertEmoji(emoji, options = {}) {
    if (!selectedChat?.id) return;

    if (!options.skipDraftUpdate) {
      setDrafts((prev) => ({
        ...prev,
        [selectedChat.id]: `${prev[selectedChat.id] ?? ""}${emoji}`,
      }));
    }

    setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
      autoResizeTextarea();
    }, 0);
  }

  async function handleGroupCreated(groupChat) {
    setGroupModalOpen(false);
    await loadChats({ showLoader: false });

    const nextChat = {
      id: groupChat.id,
      name: groupChat.name,
      type: groupChat.type,
      targetUserId: null,
      targetUserAvatarUrl: groupChat.avatarUrl || null,
      unreadCount: 0,
      hasUnread: false,
    };

    setSelectedChat(nextChat);
    setMessage("Групповой чат создан");
  }

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return sortChatsByFreshness(chats);

    return sortChatsByFreshness(chats.filter((chat) => {
      const haystack = [chat.name, chat.lastMessageText, chat.lastMessageUserName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    }));
  }, [chatSearch, chats]);

  const messageItems = useMemo(() => buildMessageItems(messages), [messages]);
  const isSidebarCompact = sidebarWidth <= SIDEBAR_COLLAPSED_WIDTH + 8;
  const groupSystemMessage =
    selectedChat?.type === "Group"
      ? selectedGroupDetails?.systemMessage ?? null
      : null;
  const groupCanSend =
    selectedChat?.type === "Group"
      ? !!selectedGroupDetails?.canSendMessages
      : true;

  const canModerateMessages =
    selectedChat?.type === "Group" &&
    selectedGroupDetails?.participants?.some(
      (x) =>
        x.userId === user?.id &&
        (x.role === "Owner" || x.role === "Admin")
    );

  const canDeleteMessageForAll =
    !!contextMenu?.message &&
    !contextMenu.message.isDeletedForAll &&
    (
      user?.id === contextMenu.message.userId ||
      canModerateMessages
    );

  const shouldHideSidebarOnMobile = isMobileChatLayout && Boolean(selectedChat);
  const shouldShowSidebar = !shouldHideSidebarOnMobile;
  const shouldShowResizeHandle = !isMobileChatLayout && shouldShowSidebar;
  const pageGridColumns = shouldHideSidebarOnMobile
    ? "minmax(0, 1fr)"
    : isMobileChatLayout
      ? "minmax(0, 1fr)"
      : `${sidebarWidth}px 10px minmax(0, 1fr)`;

  return (
    <div
      style={{
        height: "100%",
        maxHeight: "100%",
        overflow: "hidden",
        display: "grid",
        minWidth: 0,
        gridTemplateColumns: pageGridColumns,
        gap: 0,
      }}
    >
      <style>{`
        .chat-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(148,163,184,0.45) transparent;
        }

        .chat-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148,163,184,0.32);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .chat-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148,163,184,0.5);
          background-clip: padding-box;
        }
      `}</style>

      {shouldShowSidebar && (
        <ChatSidebar
          user={user}
          navigate={navigate}
          chats={chats}
          filteredChats={filteredChats}
          loadingChats={loadingChats}
          selectedChat={selectedChat}
          chatSearch={chatSearch}
          setChatSearch={setChatSearch}
          isSidebarCompact={isMobileChatLayout ? false : isSidebarCompact}
          message={message}
          setGroupModalOpen={setGroupModalOpen}
          openChatItemMenu={openChatItemMenu}
          setSelectedChat={setSelectedChat}
        />
      )}

      {shouldShowResizeHandle && <SidebarResizeHandle onPointerDown={startSidebarResize} />}

      {(!isMobileChatLayout || selectedChat) && (
        <section
          style={{
            minWidth: 0,
            height: "100%",
            maxHeight: "100%",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            justifyContent: "center",
          }}
        >
        <div
          style={{
            width: "100%",
            maxWidth: "1280px",
            height: "100%",
            maxHeight: "100%",
            minHeight: 0,
          }}
        >
          {!selectedChat ? (
            <div
              className="card"
              style={{
                height: "100%",
                overflow: "hidden",
                borderRadius: "22px",
              }}
            >
              <EmptyState />
            </div>
          ) : (
            <div
              style={{
                height: "100%",
                maxHeight: "100%",
                minHeight: 0,
                display: "grid",
                gridTemplateRows:
                  selectedChat?.type === "Group" && groupSystemMessage
                    ? "72px auto minmax(0, 1fr) auto"
                    : "72px minmax(0, 1fr) auto",
                borderRadius: "22px",
                overflow: "hidden",
                background: "rgba(15, 18, 32, 0.72)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
                position: "relative",
              }}
            >
              <ChatHeader
                selectedChat={selectedChat}
                goToUserProfile={goToUserProfile}
                navigate={navigate}
                isConnectionReady={isConnectionReady}
                setSelectedChat={setSelectedChat}
                targetUserPresence={targetUserPresence}
                activeTypingUsers={activeTypingUsers}
              />

              {selectedChat.type === "Group" && groupSystemMessage && (
                <div
                  style={{
                    margin: "12px 16px 0 16px",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(245,158,11,0.35)",
                    background: "rgba(245,158,11,0.08)",
                    color: "#fff",
                    fontWeight: 600,
                    alignSelf: "start",
                  }}
                >
                  {groupSystemMessage}
                </div>
              )}

              <ChatMessagesList
                loadingMessages={loadingMessages}
                messages={messages}
                messageItems={messageItems}
                messageRefs={messageRefs}
                user={user}
                highlightedMessageId={highlightedMessageId}
                hoveredMessageId={hoveredMessageId}
                setHoveredMessageId={setHoveredMessageId}
                startReply={startReply}
                handleContextMenu={handleContextMenu}
                handleTouchStart={handleTouchStart}
                handleTouchEnd={handleTouchEnd}
                goToUserProfile={goToUserProfile}
                onReplyPreviewClick={onReplyPreviewClick}
                messagesEndRef={messagesEndRef}
                scrollRequest={chatScrollRequest}
                onVisibleReadBoundary={readSelectedChatUntilMessage}
              />

              <ChatComposer
                selectedChat={selectedChat}
                groupCanSend={groupCanSend}
                loadingGroupDetails={loadingGroupDetails}
                groupSystemMessage={groupSystemMessage}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                currentDraft={currentDraft}
                updateCurrentDraft={updateCurrentDraft}
                handleKeyDown={handleKeyDown}
                handleComposerPaste={handleComposerPaste}
                handleSendMessage={handleSendMessage}
                onTypingActivity={handleComposerTypingActivity}
                onTypingStopped={stopTypingNow}
                pendingFiles={pendingFiles}
                handleAttachmentSelect={handleAttachmentSelect}
                handleVoiceRecorded={handleVoiceRecorded}
                removePendingFile={removePendingFile}
                showEmojiPicker={showEmojiPicker}
                setShowEmojiPicker={setShowEmojiPicker}
                insertEmoji={insertEmoji}
                isConnectionReady={isConnectionReady}
                textareaRef={textareaRef}
                attachmentInputRef={attachmentInputRef}
              />


            </div>
          )}
        </div>
        </section>
      )}

      <ChatContextMenus
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        chatItemMenu={chatItemMenu}
        setChatItemMenu={setChatItemMenu}
        user={user}
        startReply={startReply}
        handleDeleteMessage={handleDeleteMessage}
        handleDeletePrivateChatForMe={handleDeletePrivateChatForMe}
        handleDeletePrivateChatForAll={handleDeletePrivateChatForAll}
        handleDeleteGroupChatForMe={handleDeleteGroupChatForMe}
        handleLeaveGroupChat={handleLeaveGroupChat}
        handleTransferOwnershipAndLeave={handleTransferOwnershipAndLeave}
        handleDeleteGroupChatFromList={handleDeleteGroupChatFromList}
        handleToggleChatMuted={handleToggleChatMuted}
        handleOpenChatSettings={handleOpenChatSettings}
        canDeleteMessageForAll={canDeleteMessageForAll}
      />

      <CreateGroupChatModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreated={handleGroupCreated}
      />
    </div>
  );
}
