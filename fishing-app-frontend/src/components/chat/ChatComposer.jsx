import { QUICK_EMOJIS, shortenText } from "../../utils/chatHelpers";
import { getSafePreviewUrl } from "../../utils/safeUrl.js";

function PaperclipIcon() {
  return (
    <svg
      className="chat-composer-icon-svg chat-composer-icon-svg--clip"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.6 12.6 13.9 7.3a2.8 2.8 0 0 1 4 4l-7.1 7.1a4.8 4.8 0 0 1-6.8-6.8l8-8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8.7 15.4 7.05-7.05"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg
      className="chat-composer-icon-svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M8.8 14.1c.75 1.25 1.82 1.9 3.2 1.9s2.45-.65 3.2-1.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.2 9.7h.02M14.8 9.7h.02" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className="chat-composer-icon-svg chat-composer-icon-svg--send"
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.6 12 19.4 5.2 16.8 19 12.4 14.4 8.1 17.8 9.3 13.4 4.6 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ChatComposer({
  selectedChat,
  groupCanSend,
  loadingGroupDetails,
  groupSystemMessage,
  replyTo,
  setReplyTo,
  pendingFiles,
  removePendingFile,
  attachmentInputRef,
  handleAttachmentSelect,
  textareaRef,
  currentDraft,
  updateCurrentDraft,
  handleKeyDown,
  handleComposerPaste,
  showEmojiPicker,
  setShowEmojiPicker,
  insertEmoji,
  isConnectionReady,
  handleSendMessage,
}) {
  const composerDisabled = selectedChat?.type === "Group" && !groupCanSend;
  const sendDisabled =
    !isConnectionReady ||
    (!currentDraft.trim() && pendingFiles.length === 0) ||
    composerDisabled;

  return (
    <form
      onSubmit={handleSendMessage}
      className="chat-composer-form"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "12px 14px 14px",
        display: "grid",
        gap: "10px",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <style>{`
        .chat-composer-icon-button {
          width: 42px;
          height: 42px;
          min-width: 42px;
          min-height: 42px;
          padding: 0;
          border-radius: 999px;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(226, 232, 240, 0.8);
          background: transparent;
          cursor: pointer;
          line-height: 0;
          transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }

        .chat-composer-icon-button:hover:not(:disabled) {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.07);
          transform: translateY(-1px);
        }

        .chat-composer-icon-button:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .chat-composer-icon-button--send {
          color: #dbeafe;
          background: rgba(37, 99, 235, 0.18);
        }

        .chat-composer-icon-button--send:not(:disabled) {
          color: #ffffff;
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          box-shadow: 0 8px 22px rgba(37, 99, 235, 0.28);
        }

        .chat-composer-icon-svg {
          display: block;
          width: 22px;
          height: 22px;
          margin: 0;
          flex: 0 0 auto;
          pointer-events: none;
        }

        .chat-composer-icon-svg--clip {
          transform: none;
        }

        .chat-composer-icon-svg--send {
          width: 23px;
          height: 23px;
          transform: translateX(1px);
        }

        .chat-composer-shell {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto auto;
          align-items: end;
          gap: 6px;
          min-height: 56px;
          padding: 6px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.76);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }

        .chat-composer-textarea {
          width: 100%;
          min-height: 42px;
          max-height: 170px;
          padding: 11px 6px;
          border: 0;
          border-radius: 16px;
          resize: none;
          color: #e5e7eb;
          background: transparent;
          outline: none;
          line-height: 1.45;
          box-sizing: border-box;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .chat-composer-textarea::placeholder {
          color: rgba(226, 232, 240, 0.44);
        }

        .chat-emoji-grid button {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 11px;
          border: 1px solid rgba(255,255,255,0.06);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.055);
          cursor: pointer;
          font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
          font-size: 18px;
          line-height: 1;
        }

        .chat-emoji-grid button:hover {
          background: rgba(94, 234, 212, 0.13);
          border-color: rgba(94, 234, 212, 0.24);
        }

        @media (max-width: 640px) {
          .chat-composer-form {
            padding: 10px 10px 12px !important;
          }

          .chat-composer-shell {
            gap: 2px;
            border-radius: 22px;
          }

          .chat-composer-icon-button {
            width: 40px;
            height: 40px;
            min-width: 40px;
            min-height: 40px;
          }

          .chat-composer-help {
            display: none !important;
          }
        }
      `}</style>

      {replyTo && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.05)",
            borderLeft: "3px solid #2563eb",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>
              Ответ {replyTo.userName}
            </div>
            <div className="muted-text" style={{ fontSize: "13px" }}>
              {shortenText(replyTo.text, 100)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setReplyTo(null)}
            style={{
              width: "30px",
              height: "30px",
              border: "none",
              borderRadius: "10px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Отменить ответ"
          >
            ×
          </button>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: "10px",
            gridTemplateColumns:
              pendingFiles.length === 1
                ? "minmax(0, 420px)"
                : "repeat(auto-fit, minmax(170px, 220px))",
            justifyContent: "start",
            alignItems: "start",
          }}
        >
          {pendingFiles.map((file) => {
            const isImage = file.previewType === "image";
            const isVideo = file.previewType === "video";
            const safePreviewUrl = getSafePreviewUrl(file.previewUrl);
            const isSingle = pendingFiles.length === 1;

            return (
              <div
                key={file.localId}
                style={{
                  width: "100%",
                  maxWidth: isSingle ? "420px" : "220px",
                  padding: "10px",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gap: "8px",
                  boxSizing: "border-box",
                }}
              >
                {(isImage || isVideo) && (
                  <div
                    style={{
                      width: "100%",
                      height: isSingle ? "220px" : "150px",
                      borderRadius: "12px",
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      overflow: "hidden",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {isImage && safePreviewUrl && (
                      <img
                        src={safePreviewUrl}
                        alt={file.file.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    )}

                    {isVideo && safePreviewUrl && (
                      <video
                        src={safePreviewUrl}
                        controls={isSingle}
                        muted={!isSingle}
                        playsInline
                        preload="metadata"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    )}
                  </div>
                )}

                {!isImage && !isVideo && (
                  <div
                    style={{
                      minHeight: "74px",
                      borderRadius: "12px",
                      background: "rgba(0,0,0,0.18)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "30px",
                    }}
                  >
                    📎
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={file.file.name}
                  >
                    {file.file.name}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removePendingFile(file.localId)}
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    cursor: "pointer",
                    borderRadius: "10px",
                    padding: "8px 10px",
                  }}
                >
                  Убрать
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="chat-composer-shell">
        <input
          ref={attachmentInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
        />

        <button
          type="button"
          className="chat-composer-icon-button"
          onClick={() => attachmentInputRef.current?.click()}
          disabled={composerDisabled}
          title="Прикрепить файлы"
        >
          <PaperclipIcon />
        </button>

        <textarea
          ref={textareaRef}
          className="chat-scrollbar chat-composer-textarea"
          placeholder={
            composerDisabled
              ? (loadingGroupDetails ? "Загрузка..." : groupSystemMessage || "Отправка сообщений недоступна")
              : "Сообщение"
          }
          disabled={composerDisabled}
          value={currentDraft}
          onChange={(e) => updateCurrentDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handleComposerPaste}
          rows={1}
          style={{ opacity: composerDisabled ? 0.7 : 1 }}
        />

        <div style={{ position: "relative", lineHeight: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="chat-composer-icon-button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Эмодзи"
          >
            <SmileIcon />
          </button>

          {showEmojiPicker && (
            <div
              className="chat-emoji-grid"
              style={{
                position: "absolute",
                right: 0,
                bottom: "50px",
                background: "#12182b",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "16px",
                padding: "10px",
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "8px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                zIndex: 20,
              }}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="chat-composer-icon-button chat-composer-icon-button--send"
          disabled={sendDisabled}
          title="Отправить"
        >
          <SendIcon />
        </button>
      </div>

      <div className="chat-composer-help muted-text" style={{ fontSize: "13px", paddingLeft: "8px" }}>
        Enter — отправить, Shift + Enter — новая строка
      </div>
    </form>
  );
}
