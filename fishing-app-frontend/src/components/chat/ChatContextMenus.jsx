function getMenuPosition(x, y, width = 230, height = 170) {
  if (typeof window === "undefined") {
    return { left: x, top: y };
  }

  const padding = 12;
  const safeLeft = Math.min(
    Math.max(padding, x),
    Math.max(padding, window.innerWidth - width - padding)
  );
  const safeTop = Math.min(
    Math.max(padding, y),
    Math.max(padding, window.innerHeight - height - padding)
  );

  return { left: safeLeft, top: safeTop };
}

function menuStyle(position, minWidth = 220) {
  return {
    position: "fixed",
    left: position.left,
    top: position.top,
    background: "#12182b",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
    overflow: "hidden",
    zIndex: 120,
    minWidth: `${minWidth}px`,
    maxWidth: "calc(100vw - 24px)",
  };
}

export default function ChatContextMenus({
  contextMenu,
  chatItemMenu,
  startReply,
  handleDeleteMessage,
  canDeleteMessageForAll,
  user,
  handleDeletePrivateChatForMe,
  handleDeletePrivateChatForAll,
  handleDeleteGroupChatForMe,
  handleDeleteGroupChatFromList,
  handleLeaveGroupChat,
  handleTransferOwnershipAndLeave,
  handleToggleChatMuted,
  handleOpenChatSettings,
}) {
  const messageMenuPosition = contextMenu
    ? getMenuPosition(contextMenu.x, contextMenu.y, 230, canDeleteMessageForAll ? 150 : 105)
    : null;

  const chatMenuPosition = chatItemMenu
    ? getMenuPosition(
        chatItemMenu.x,
        chatItemMenu.y,
        250,
        chatItemMenu.chat?.type === "Group" ? 240 : 180
      )
    : null;

  const menuButtonStyle = {
    width: "100%",
    padding: "12px 14px",
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
  };

  return (
    <>
      {contextMenu && messageMenuPosition && (
        <div
          style={menuStyle(messageMenuPosition, 210)}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.message.isDeletedForAll && (
            <button
              type="button"
              onClick={() => startReply(contextMenu.message)}
              style={menuButtonStyle}
            >
              Ответить
            </button>
          )}

          <button
            type="button"
            onClick={() => handleDeleteMessage(contextMenu.message, false)}
            style={{
              ...menuButtonStyle,
              borderTop: !contextMenu.message.isDeletedForAll
                ? "1px solid rgba(255,255,255,0.08)"
                : "none",
            }}
          >
            Удалить у себя
          </button>

          {canDeleteMessageForAll && (
            <button
              type="button"
              onClick={() => handleDeleteMessage(contextMenu.message, true)}
              style={{
                ...menuButtonStyle,
                color: "#ff8f8f",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              Удалить у всех
            </button>
          )}
        </div>
      )}

      {chatItemMenu && chatItemMenu.chat?.type === "Private" && chatMenuPosition && (
        <div
          style={menuStyle(chatMenuPosition, 220)}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleToggleChatMuted?.(chatItemMenu.chat)}
            style={menuButtonStyle}
          >
            {chatItemMenu.chat?.isMuted ? "Включить уведомления" : "Отключить уведомления"}
          </button>

          <button
            type="button"
            onClick={() => handleDeletePrivateChatForMe(chatItemMenu.chat)}
            style={{
              ...menuButtonStyle,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Удалить у себя
          </button>

          <button
            type="button"
            onClick={() => handleDeletePrivateChatForAll(chatItemMenu.chat)}
            style={{
              ...menuButtonStyle,
              color: "#ff8f8f",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Удалить у всех
          </button>
        </div>
      )}

      {chatItemMenu && chatItemMenu.chat?.type === "Group" && chatMenuPosition && (
        <div
          style={menuStyle(chatMenuPosition, 220)}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleOpenChatSettings?.(chatItemMenu.chat)}
            style={menuButtonStyle}
          >
            Настройки чата
          </button>

          <button
            type="button"
            onClick={() => handleToggleChatMuted?.(chatItemMenu.chat)}
            style={{
              ...menuButtonStyle,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {chatItemMenu.chat?.isMuted || chatItemMenu.isMuted ? "Включить уведомления" : "Отключить уведомления"}
          </button>

          {chatItemMenu.canOnlyDeleteForMe ? (
            <button
              type="button"
              onClick={() => handleDeleteGroupChatForMe(chatItemMenu.chat)}
              style={menuButtonStyle}
            >
              Удалить у себя
            </button>
          ) : chatItemMenu.isOwner ? (
            <>
              {Array.isArray(chatItemMenu.participants) &&
                chatItemMenu.participants.some((x) => x.userId !== user?.id) && (
                  <button
                    type="button"
                    onClick={() => handleTransferOwnershipAndLeave(chatItemMenu.chat)}
                    style={menuButtonStyle}
                  >
                    Передать права и выйти
                  </button>
                )}

              <button
                type="button"
                onClick={() => handleDeleteGroupChatFromList(chatItemMenu.chat)}
                style={{
                  ...menuButtonStyle,
                  color: "#ff8f8f",
                  borderTop:
                    Array.isArray(chatItemMenu.participants) &&
                    chatItemMenu.participants.some((x) => x.userId !== user?.id)
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "none",
                }}
              >
                Удалить чат
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleLeaveGroupChat(chatItemMenu.chat)}
              style={menuButtonStyle}
            >
              Выйти из чата
            </button>
          )}
        </div>
      )}
    </>
  );
}
