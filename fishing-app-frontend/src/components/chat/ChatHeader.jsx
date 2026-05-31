import { getSafeImageUrl } from "../../utils/safeUrl.js";
function formatLastSeen(lastSeenAtUtc) {
  if (!lastSeenAtUtc) return "не в сети";

  const date = new Date(lastSeenAtUtc);
  if (Number.isNaN(date.getTime())) return "не в сети";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffMinutes < 1) {
    return "был только что";
  }

  if (diffMinutes < 60) {
    return `был ${diffMinutes} мин. назад`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return `был сегодня в ${time}`;
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return `был вчера в ${time}`;
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  const dateText = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });

  return `был ${dateText} в ${time}`;
}

export default function ChatHeader({
  selectedChat,
  isConnectionReady,
  navigate,
  goToUserProfile,
  setSelectedChat,
  targetUserPresence,
}) {
  const safeTargetAvatarUrl = getSafeImageUrl(selectedChat?.targetUserAvatarUrl);

  const statusText = selectedChat?.type === "Private" && selectedChat?.targetUserId
    ? targetUserPresence?.isOnline
      ? "В сети"
      : formatLastSeen(targetUserPresence?.lastSeenAtUtc || targetUserPresence?.lastSeenAt)
    : null;

  const canOpenAvatar = Boolean(
    selectedChat?.targetUserId ||
    (selectedChat?.type === "Group" && selectedChat?.id)
  );

  function openChatAvatarTarget() {
    if (selectedChat?.targetUserId) {
      goToUserProfile(selectedChat.targetUserId);
      return;
    }

    if (selectedChat?.type === "Group" && selectedChat?.id) {
      navigate(`/chats/${selectedChat.id}/details`);
    }
  }

  const avatarButtonTitle = selectedChat?.targetUserId
    ? "Открыть профиль"
    : selectedChat?.type === "Group"
      ? "Информация о чате"
      : selectedChat?.name || "Чат";

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

      <button
        type="button"
        onClick={canOpenAvatar ? openChatAvatarTarget : undefined}
        disabled={!canOpenAvatar}
        title={avatarButtonTitle}
        style={{
          width: "46px",
          height: "46px",
          padding: 0,
          border: "none",
          borderRadius: "50%",
          background: safeTargetAvatarUrl ? "transparent" : "#334155",
          color: "#fff",
          cursor: canOpenAvatar ? "pointer" : "default",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {safeTargetAvatarUrl ? (
          <img
            src={safeTargetAvatarUrl}
            alt={selectedChat.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
        ) : (
          selectedChat.name?.[0]?.toUpperCase() || "C"
        )}
      </button>

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
          <div className="muted-text" style={{ fontSize: "13px" }}>
            {statusText}
          </div>
        )}
      </div>
    </div>
  );
}
