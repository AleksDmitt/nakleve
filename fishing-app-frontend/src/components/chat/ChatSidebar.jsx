import { useEffect, useRef } from "react";
import { getInitials, shortenText } from "../../utils/chatHelpers";
import { getSafeOptimizedImageUrl } from "../../utils/safeUrl.js";


function getCleanChatName(name) {
  return String(name || "Чат").replace(/^Чат\s+с\s+/i, "").trim() || "Чат";
}

export default function ChatSidebar({
  user,
  navigate,
  chats,
  filteredChats,
  loadingChats,
  selectedChat,
  chatSearch,
  setChatSearch,
  isSidebarCompact,
  message,
  setGroupModalOpen,
  openChatItemMenu,
  setSelectedChat,
}) {
  const chatLongPressTimerRef = useRef(null);

  useEffect(() => {
    return () => window.clearTimeout(chatLongPressTimerRef.current);
  }, []);

  function startChatLongPress(event, chat) {
    window.clearTimeout(chatLongPressTimerRef.current);

    const touch = event.touches?.[0];
    if (!touch) return;

    chatLongPressTimerRef.current = window.setTimeout(() => {
      openChatItemMenu({
        preventDefault() {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      }, chat);
    }, 560);
  }

  function cancelChatLongPress() {
    window.clearTimeout(chatLongPressTimerRef.current);
  }

  const safeUserAvatarUrl = getSafeOptimizedImageUrl(user?.avatarPreviewUrl, user?.avatarUrl);

  return (
    <aside
      className="card chat-sidebar-panel"
      style={{
        minWidth: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        padding: isSidebarCompact ? "10px 8px" : "12px",
        display: "grid",
        gridTemplateRows: "auto auto minmax(0, 1fr)",
        gap: isSidebarCompact ? "8px" : "12px",
        borderRadius: "22px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          type="button"
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
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
              {getInitials(user?.userName)}
            </div>
          )}
        </button>

        {!isSidebarCompact && (
          <>
            <input
              placeholder="Поиск чатов"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              style={{ minWidth: 0 }}
            />
            <button onClick={() => setGroupModalOpen(true)}>+</button>
          </>
        )}
      </div>

      {isSidebarCompact && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button onClick={() => setGroupModalOpen(true)} title="Создать чат">
            +
          </button>
        </div>
      )}

      {!isSidebarCompact && message && (
        <p
          className={/переслан/i.test(String(message)) ? "chat-sidebar-message chat-sidebar-message--success" : "chat-sidebar-message chat-sidebar-message--error"}
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: "14px",
            color: /переслан/i.test(String(message)) ? "#d1fae5" : "#fecaca",
            background: /переслан/i.test(String(message)) ? "rgba(34, 197, 94, 0.13)" : "rgba(127, 29, 29, 0.18)",
            border: /переслан/i.test(String(message)) ? "1px solid rgba(34, 197, 94, 0.28)" : "1px solid rgba(248, 113, 113, 0.32)",
            fontSize: "13px",
            fontWeight: 800,
            lineHeight: 1.35,
          }}
        >
          {message}
        </p>
      )}

      <div
        className="chat-scrollbar chat-sidebar-list"
        style={{
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          minHeight: 0,
          display: isSidebarCompact ? "flex" : "grid",
          flexDirection: isSidebarCompact ? "column" : undefined,
          gap: isSidebarCompact ? "10px" : "8px",
          justifyItems: isSidebarCompact ? undefined : "stretch",
          alignItems: isSidebarCompact ? "center" : undefined,
          alignContent: "start",
          padding: isSidebarCompact ? "2px 0 14px" : "0 4px 14px 0",
          scrollPaddingBottom: isSidebarCompact ? "20px" : "24px",
        }}
      >
        {loadingChats ? (
          <p className="muted-text">Загрузка...</p>
        ) : filteredChats.length === 0 ? (
          <p className="muted-text">{chats.length === 0 ? "Чатов пока нет" : "Ничего не найдено"}</p>
        ) : (
          filteredChats.map((chat) => {
            const isActive = selectedChat?.id === chat.id;
            const unreadCount = Number(chat.unreadCount || 0);
            const safeChatAvatarUrl = getSafeOptimizedImageUrl(chat.targetUserAvatarPreviewUrl, chat.targetUserAvatarUrl);

            return (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                onContextMenu={(e) => openChatItemMenu(e, chat)}
                onTouchStart={(e) => startChatLongPress(e, chat)}
                onTouchEnd={cancelChatLongPress}
                onTouchMove={cancelChatLongPress}
                onTouchCancel={cancelChatLongPress}
                title={chat.isMuted ? `${chat.name} · уведомления отключены` : chat.name}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  textAlign: "left",
                  padding: isSidebarCompact ? "0" : "12px",
                  border: isSidebarCompact
                    ? "none"
                    : isActive
                      ? "1px solid rgba(37,99,235,0.55)"
                      : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: isSidebarCompact ? "0" : "16px",
                  background: isSidebarCompact
                    ? "transparent"
                    : isActive
                      ? "rgba(37,99,235,0.12)"
                      : "rgba(255,255,255,0.03)",
                  color: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: isSidebarCompact ? "center" : "stretch",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  position: "relative",
                  flexShrink: 0,
                  minHeight: isSidebarCompact ? "58px" : "74px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                    justifyContent: isSidebarCompact ? "center" : "flex-start",
                    width: "100%",
                    maxWidth: "100%",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  {safeChatAvatarUrl ? (
                    <img
                      src={safeChatAvatarUrl}
                      alt={chat.name}
                      style={{
                        width: "48px",
                        height: "48px",
                        objectFit: "cover",
                        borderRadius: "50%",
                        flexShrink: 0,
                        boxShadow: isSidebarCompact && isActive
                          ? "0 0 0 2px rgba(37,99,235,0.8)"
                          : "none",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "#334155",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        flexShrink: 0,
                        boxShadow: isSidebarCompact && isActive
                          ? "0 0 0 2px rgba(37,99,235,0.8)"
                          : "none",
                      }}
                    >
                      {getInitials(chat.name || "C")}
                    </div>
                  )}

                  {!isSidebarCompact && (
                    <div style={{ minWidth: 0, flex: 1, display: "grid", gap: "2px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {chat.name}
                        </div>

                        {chat.isMuted && (
                          <span
                            title={unreadCount > 0
                              ? `Уведомления отключены · непрочитанных: ${unreadCount > 99 ? "99+" : unreadCount}`
                              : "Уведомления отключены"}
                            style={{
                              minWidth: unreadCount > 0 ? "42px" : "24px",
                              height: "24px",
                              padding: unreadCount > 0 ? "0 8px" : 0,
                              borderRadius: "999px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "5px",
                              color: unreadCount > 0 ? "#e0f2fe" : "rgba(226,232,240,0.76)",
                              background: unreadCount > 0 ? "rgba(14,165,233,0.16)" : "rgba(148,163,184,0.12)",
                              border: unreadCount > 0 ? "1px solid rgba(125,211,252,0.28)" : "1px solid transparent",
                              fontSize: "12px",
                              fontWeight: 800,
                              lineHeight: 1,
                              flexShrink: 0,
                              boxShadow: unreadCount > 0 ? "0 8px 18px rgba(14,165,233,0.12)" : "none",
                            }}
                          >
                            <span aria-hidden="true" style={{ lineHeight: 1 }}>🔕</span>
                            {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
                          </span>
                        )}

                        {!chat.isMuted && unreadCount > 0 && (
                          <div
                            style={{
                              minWidth: unreadCount > 9 ? "24px" : "20px",
                              height: "20px",
                              padding: "0 6px",
                              borderRadius: "999px",
                              background: "#2563eb",
                              color: "#fff",
                              fontSize: "12px",
                              fontWeight: 700,
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                              boxShadow: "0 4px 12px rgba(37,99,235,0.35)",
                            }}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </div>
                        )}
                      </div>

                      <div
                        className="muted-text"
                        style={{
                          fontSize: "13px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontWeight: unreadCount > 0 ? 600 : 400,
                          color: unreadCount > 0 ? "#fff" : undefined,
                        }}
                      >
                        {chat.lastMessageText
                          ? `${chat.lastMessageUserName ? `${chat.lastMessageUserName}: ` : ""}${shortenText(chat.lastMessageText)}`
                          : "Сообщений пока нет"}
                      </div>
                    </div>
                  )}
                </div>

                {isSidebarCompact && unreadCount > 0 && (
                  <div
                    title={chat.isMuted ? "Уведомления отключены" : undefined}
                    style={{
                      position: "absolute",
                      right: "2px",
                      top: "0px",
                      minWidth: unreadCount > 9 ? "22px" : "18px",
                      height: "18px",
                      padding: "0 5px",
                      borderRadius: "999px",
                      background: chat.isMuted ? "rgba(14,165,233,0.88)" : "#2563eb",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 700,
                      display: "grid",
                      placeItems: "center",
                      boxShadow: chat.isMuted ? "0 4px 12px rgba(14,165,233,0.28)" : "0 4px 12px rgba(37,99,235,0.35)",
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
