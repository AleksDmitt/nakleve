import { getSafeImageUrl } from "../../utils/safeUrl";

function formatLastSeen(lastSeenAtUtc) {
  if (!lastSeenAtUtc) return "Не в сети";

  const date = new Date(lastSeenAtUtc);
  if (Number.isNaN(date.getTime())) return "Не в сети";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) {
    return `Был(а) в сети сегодня в ${time}`;
  }

  const formattedDate = date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `Был(а) в сети ${formattedDate} в ${time}`;
}

function getTypingText(selectedChat, activeTypingUsers) {
  const users = Array.isArray(activeTypingUsers) ? activeTypingUsers : [];

  if (users.length === 0) return null;

  if (selectedChat?.type === "Group") {
    if (users.length === 1) {
      return `${users[0]?.userName || "Пользователь"} печатает...`;
    }

    return users.length <= 3
      ? `${users.length} участника печатают...`
      : "Несколько участников печатают...";
  }

  return "Печатает...";
}

function getVoiceRecordingText(selectedChat, activeVoiceRecordingUsers) {
  const users = Array.isArray(activeVoiceRecordingUsers) ? activeVoiceRecordingUsers : [];

  if (users.length === 0) return null;

  if (selectedChat?.type === "Group") {
    if (users.length === 1) {
      return `${users[0]?.userName || "Пользователь"} записывает голосовое сообщение...`;
    }

    return users.length <= 3
      ? `${users.length} участника записывают голосовое сообщение...`
      : "Несколько участников записывают голосовое сообщение...";
  }

  return "Записывает голосовое сообщение...";
}

export default function ChatHeader({
  selectedChat,
  isConnectionReady,
  navigate,
  goToUserProfile,
  setSelectedChat,
  targetUserPresence,
  activeTypingUsers = [],
  activeVoiceRecordingUsers = [],
}) {
  const isTargetUserBlocked = Boolean(selectedChat?.isTargetUserBlocked || selectedChat?.IsTargetUserBlocked);
  const targetUserBlockedText = selectedChat?.targetUserBlockedText || selectedChat?.TargetUserBlockedText || "Аккаунт пользователя заблокирован";
  const safeTargetAvatarUrl = isTargetUserBlocked
    ? null
    : getSafeImageUrl(selectedChat?.targetUserAvatarUrl || selectedChat?.avatarUrl);
  const typingText = getTypingText(selectedChat, activeTypingUsers);
  const voiceRecordingText = getVoiceRecordingText(selectedChat, activeVoiceRecordingUsers);

  const presenceStatusText = selectedChat?.type === "Private" && selectedChat?.targetUserId
    ? targetUserPresence?.isOnline
      ? "В сети"
      : formatLastSeen(targetUserPresence?.lastSeenAtUtc)
    : null;

  const statusText = isTargetUserBlocked
    ? targetUserBlockedText
    : voiceRecordingText || typingText || presenceStatusText;

  return (
    <div
      style={{
        padding: "14px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "rgba(255,255,255,0.03)",
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={() => setSelectedChat(null)}
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          padding: 0,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          color: "#fff",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          lineHeight: 1,
        }}
        title="Назад"
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            lineHeight: 1,
            fontSize: "18px",
          }}
        >
          ←
        </span>
      </button>

      {safeTargetAvatarUrl ? (
        <button
          type="button"
          onClick={() =>
            selectedChat.targetUserId
              ? goToUserProfile(selectedChat.targetUserId)
              : selectedChat.type === "Group"
                ? navigate(`/chats/${selectedChat.id}/details`)
                : null
          }
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: selectedChat.targetUserId || selectedChat.type === "Group" ? "pointer" : "default",
            flexShrink: 0,
          }}
        >
          <img
            src={safeTargetAvatarUrl}
            alt={selectedChat.name}
            style={{
              width: "46px",
              height: "46px",
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
        </button>
      ) : (
        <div
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "50%",
            background: "#334155",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {selectedChat.name?.[0]?.toUpperCase() || "C"}
        </div>
      )}

      <div style={{ minWidth: 0, overflow: "hidden" }}>
        {selectedChat.targetUserId ? (
          <button
            type="button"
            onClick={() => goToUserProfile(selectedChat.targetUserId)}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#fff",
              fontWeight: 700,
              fontSize: "18px",
              cursor: "pointer",
              maxWidth: "100%",
              minWidth: 0,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={selectedChat.name}
          >
            {selectedChat.name}
          </button>
        ) : selectedChat.type === "Group" ? (
          <button
            type="button"
            onClick={() => navigate(`/chats/${selectedChat.id}/details`)}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#fff",
              fontWeight: 700,
              fontSize: "18px",
              cursor: "pointer",
              maxWidth: "100%",
              minWidth: 0,
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={selectedChat.name}
          >
            {selectedChat.name}
          </button>
        ) : (
          <div
            style={{
              fontWeight: 700,
              fontSize: "18px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={selectedChat.name}
          >
            {selectedChat.name}
          </div>
        )}

        {statusText && (
          <div
            className="muted-text"
            style={{
              fontSize: "13px",
              color: isTargetUserBlocked ? "#fca5a5" : voiceRecordingText || typingText ? "#ffffff" : undefined,
              fontWeight: isTargetUserBlocked || voiceRecordingText || typingText ? 700 : undefined,
            }}
          >
            {statusText}
          </div>
        )}
      </div>
    </div>
  );
}
