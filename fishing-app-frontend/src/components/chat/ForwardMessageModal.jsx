import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getInitials, shortenText } from "../../utils/chatHelpers";
import { getSafeOptimizedImageUrl } from "../../utils/safeUrl.js";
import "../../styles/chatForwardModal.css";

function getChatFreshnessTime(chat) {
  const candidates = [
    chat?.lastMessageAt,
    chat?.lastMessageSentAt,
    chat?.lastMessageCreatedAt,
    chat?.lastMessageDate,
    chat?.lastMessage?.sentAt,
    chat?.lastMessage?.createdAt,
    chat?.latestMessageAt,
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

function getForwardPreview(message) {
  if (!message) return "";

  const text = String(message.text || "").trim();
  if (text) return shortenText(text, 120);

  if (message.sharedFishingEntry) {
    return message.sharedFishingEntry.title || "Запись из ленты";
  }

  const attachmentsCount = Array.isArray(message.attachments) ? message.attachments.length : 0;
  if (attachmentsCount === 1) {
    const attachment = message.attachments[0];
    if (attachment?.isVoiceMessage) return "Голосовое сообщение";
    if (attachment?.attachmentType === "Image") return "Фото";
    if (attachment?.attachmentType === "Video") return "Видео";
    return attachment?.fileName || "Вложение";
  }

  if (attachmentsCount > 1) return `Вложения: ${attachmentsCount}`;

  return "Сообщение";
}

function getChatSubtitle(chat) {
  if (chat?.lastMessageText) {
    return `${chat.lastMessageUserName ? `${chat.lastMessageUserName}: ` : ""}${shortenText(chat.lastMessageText, 70)}`;
  }

  if (chat?.type === "Group") return "Групповой чат";
  return "Личный чат";
}

export default function ForwardMessageModal({ isOpen, message, messages, chats, currentChatId, onClose, onForward }) {
  const [query, setQuery] = useState("");
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const forwardMessages = useMemo(() => {
    const items = Array.isArray(messages) && messages.length > 0
      ? messages
      : message
        ? [message]
        : [];

    return items.filter((item) => item && !item.isDeletedForAll);
  }, [message, messages]);

  const forwardMessagesKey = useMemo(
    () => forwardMessages.map((item) => item.id).join("|"),
    [forwardMessages]
  );

  useEffect(() => {
    if (!isOpen) return;

    setQuery("");
    setSelectedChatIds([]);
    setSubmitting(false);
    setError("");
  }, [isOpen, forwardMessagesKey]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const visibleChats = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortChatsByFreshness(chats).filter((chat) => {
      if (!chat?.id) return false;

      if (!normalizedQuery) return true;

      const text = [
        chat.name,
        chat.description,
        chat.lastMessageText,
        chat.lastMessageUserName,
        chat.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(normalizedQuery);
    });
  }, [chats, query]);

  if (!isOpen || forwardMessages.length === 0) return null;

  function toggleChat(chatId) {
    setSelectedChatIds((current) => {
      const normalizedId = String(chatId);
      const exists = current.some((id) => String(id) === normalizedId);

      if (exists) {
        return current.filter((id) => String(id) !== normalizedId);
      }

      return [...current, chatId];
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (selectedChatIds.length === 0 || submitting) return;

    try {
      setSubmitting(true);
      setError("");
      await onForward?.(forwardMessages, selectedChatIds);
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Не удалось переслать сообщение");
    } finally {
      setSubmitting(false);
    }
  }

    const previewText = forwardMessages.length === 1
    ? getForwardPreview(forwardMessages[0])
    : `${forwardMessages.length} сообщений`;

  return createPortal(
    <div className="chat-forward-backdrop" onMouseDown={onClose}>
      <form
        className="chat-forward-modal"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="chat-forward-header">
          <div>
            <p className="chat-forward-kicker">Пересылка</p>
            <h2>Выбери чат</h2>
          </div>

          <button type="button" className="chat-forward-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="chat-forward-preview">
          <span>Будет переслано</span>
          <strong>{previewText}</strong>
          {forwardMessages.length > 1 && (
            <small>Сообщения уйдут в том же порядке, как они шли в чате.</small>
          )}
        </div>

        <label className="chat-forward-search">
          <span>Поиск</span>
          <input
            autoFocus
            type="search"
            placeholder="Название чата или последнее сообщение"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {error && <p className="chat-forward-error">{error}</p>}

        <div className="chat-forward-list">
          {visibleChats.length === 0 ? (
            <div className="chat-forward-empty">Чаты не найдены</div>
          ) : (
            visibleChats.map((chat) => {
              const checked = selectedChatIds.some((id) => String(id) === String(chat.id));
              const safeAvatarUrl = getSafeOptimizedImageUrl(chat.targetUserAvatarPreviewUrl, chat.targetUserAvatarUrl || chat.avatarUrl);
              const unreadCount = Number(chat.unreadCount || (chat.hasUnread ? 1 : 0));
              const isCurrent = String(chat.id) === String(currentChatId || "");

              return (
                <button
                  key={chat.id}
                  type="button"
                  className={`chat-forward-chat ${checked ? "is-selected" : ""}`}
                  onClick={() => toggleChat(chat.id)}
                >
                  {safeAvatarUrl ? (
                    <img src={safeAvatarUrl} alt={chat.name || "Чат"} />
                  ) : (
                    <span className="chat-forward-avatar-fallback">{getInitials(chat.name || "C")}</span>
                  )}

                  <span className="chat-forward-chat-main">
                    <span className="chat-forward-chat-title">
                      <strong>{chat.name || "Чат"}</strong>
                      {isCurrent && <em>текущий</em>}
                      {chat.isMuted && <em>без уведомлений</em>}
                    </span>
                    <small>{getChatSubtitle(chat)}</small>
                  </span>

                  {unreadCount > 0 && !checked && (
                    <span className="chat-forward-unread">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  )}

                  <span className="chat-forward-check" aria-hidden="true">
                    {checked ? "✓" : ""}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <footer className="chat-forward-actions">
          <button type="button" className="chat-forward-secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className="chat-forward-primary" disabled={selectedChatIds.length === 0 || submitting}>
            {submitting
              ? "Пересылаю..."
              : selectedChatIds.length > 1
                ? `Переслать в ${selectedChatIds.length} чата`
                : forwardMessages.length > 1
                  ? `Переслать ${forwardMessages.length} сообщений`
                  : "Переслать"}
          </button>
        </footer>
      </form>
    </div>,
    document.body
  );
}
