import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

function MicIcon() {
  return (
    <svg className="chat-composer-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14.5a3.1 3.1 0 0 0 3.1-3.1V6.6a3.1 3.1 0 1 0-6.2 0v4.8A3.1 3.1 0 0 0 12 14.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M5.9 10.7a6.1 6.1 0 0 0 12.2 0M12 16.9v3.2M8.8 20.1h6.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="chat-composer-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
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
  handleVoiceRecorded,
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
  onTypingActivity,
  onTypingStopped,
}) {
  const composerDisabled = selectedChat?.type === "Group" && !groupCanSend;
  const chatId = selectedChat?.id || null;
  const [localDraft, setLocalDraft] = useState(currentDraft || "");
  const localDraftRef = useRef(currentDraft || "");
  const syncTimerRef = useRef(null);
  const lastChatIdRef = useRef(chatId);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef(null);

  const sendDisabled =
    !isConnectionReady ||
    isRecordingVoice ||
    (!localDraft.trim() && pendingFiles.length === 0) ||
    composerDisabled;

  function resizeTextarea() {
    const el = textareaRef?.current;
    if (!el) return;

    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function focusTextareaSoon() {
    window.requestAnimationFrame(() => {
      textareaRef?.current?.focus({ preventScroll: true });
      resizeTextarea();
    });
  }

  function syncDraftNow(value = localDraftRef.current) {
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    updateCurrentDraft(value);
  }

  function scheduleDraftSync(value) {
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      updateCurrentDraft(value);
    }, 220);
  }

  function setDraftValue(value, options = {}) {
    const { syncNow = false } = options;
    localDraftRef.current = value;
    setLocalDraft(value);

    if (syncNow) {
      syncDraftNow(value);
      return;
    }

    scheduleDraftSync(value);
  }

  useEffect(() => {
    return () => {
      window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (lastChatIdRef.current !== chatId) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      lastChatIdRef.current = chatId;
      const nextDraft = currentDraft || "";
      localDraftRef.current = nextDraft;
      setLocalDraft(nextDraft);
      return;
    }

    // Внешний сброс черновика после успешной отправки должен сразу очищать локальное поле.
    if ((currentDraft || "") === "" && localDraftRef.current !== "") {
      localDraftRef.current = "";
      setLocalDraft("");
    }
  }, [chatId, currentDraft]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [localDraft, replyTo, chatId, pendingFiles.length]);

  function formatVoiceDuration(ms) {
    const totalSeconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getSupportedVoiceMimeType() {
    if (typeof MediaRecorder === "undefined") return "";

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function getVoiceFileExtension(mimeType) {
    const value = String(mimeType || "").toLowerCase();
    if (value.includes("mp4")) return "m4a";
    if (value.includes("ogg")) return "ogg";
    if (value.includes("mpeg")) return "mp3";
    if (value.includes("wav")) return "wav";
    return "webm";
  }

  function cleanupRecordingStream() {
    recordingStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function stopRecordingTimer() {
    window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function buildFallbackWaveform(seed = 0) {
    return Array.from({ length: 34 }, (_, index) => {
      const value = Math.sin((index + 1) * 1.7 + seed) * 0.5 + 0.5;
      return Math.max(12, Math.min(96, Math.round(22 + value * 64)));
    });
  }

  async function buildVoiceWaveform(blob) {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return buildFallbackWaveform(blob.size || 0);

      const buffer = await blob.arrayBuffer();
      const audioContext = new AudioContextCtor();
      const decoded = await audioContext.decodeAudioData(buffer.slice(0));
      const channelData = decoded.getChannelData(0);
      const barsCount = 34;
      const blockSize = Math.max(1, Math.floor(channelData.length / barsCount));
      const bars = [];

      for (let i = 0; i < barsCount; i += 1) {
        let sum = 0;
        const start = i * blockSize;
        const end = Math.min(channelData.length, start + blockSize);

        for (let j = start; j < end; j += 1) {
          sum += Math.abs(channelData[j]);
        }

        const average = sum / Math.max(1, end - start);
        bars.push(Math.max(10, Math.min(100, Math.round(average * 360))));
      }

      await audioContext.close?.();
      return bars;
    } catch {
      return buildFallbackWaveform(blob.size || 0);
    }
  }

  async function startVoiceRecording() {
    if (composerDisabled || isRecordingVoice) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Браузер не поддерживает запись голосовых сообщений.");
      return;
    }

    try {
      setRecordingError("");
      onTypingStopped?.();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedVoiceMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingMs(0);
      setIsRecordingVoice(true);

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.start(250);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingMs(Date.now() - recordingStartedAtRef.current);
      }, 250);
    } catch (err) {
      console.error(err);
      cleanupRecordingStream();
      stopRecordingTimer();
      setIsRecordingVoice(false);
      setRecordingError("Не удалось получить доступ к микрофону.");
    }
  }

  async function stopVoiceRecording(options = {}) {
    const { save = true } = options;
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      cleanupRecordingStream();
      stopRecordingTimer();
      setIsRecordingVoice(false);
      return;
    }

    await new Promise((resolve) => {
      recorder.onstop = async () => {
        try {
          const durationMs = Date.now() - recordingStartedAtRef.current;
          const mimeType = recorder.mimeType || getSupportedVoiceMimeType() || "audio/webm";
          const blob = new Blob(recordingChunksRef.current, { type: mimeType });

          if (save && blob.size > 0 && durationMs >= 700) {
            const extension = getVoiceFileExtension(mimeType);
            const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
            const waveform = await buildVoiceWaveform(blob);

            handleVoiceRecorded?.({
              file,
              durationMs,
              waveform,
            });
          } else if (save && durationMs < 700) {
            setRecordingError("Голосовое сообщение слишком короткое.");
          }
        } finally {
          recordingChunksRef.current = [];
          mediaRecorderRef.current = null;
          cleanupRecordingStream();
          stopRecordingTimer();
          setIsRecordingVoice(false);
          setRecordingMs(0);
          resolve();
        }
      };

      recorder.stop();
    });
  }

  function handleVoiceButtonClick() {
    if (isRecordingVoice) {
      stopVoiceRecording({ save: true });
      return;
    }

    startVoiceRecording();
  }

  function cancelVoiceRecording() {
    stopVoiceRecording({ save: false });
  }

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }

      cleanupRecordingStream();
      stopRecordingTimer();
    };
  }, []);

  async function submitCurrentDraft(event) {
    event?.preventDefault?.();

    if (sendDisabled) return;

    const draftToSend = localDraftRef.current;
    syncDraftNow(draftToSend);
    onTypingStopped?.();

    const sent = await handleSendMessage(event, draftToSend);

    if (sent) {
      setDraftValue("", { syncNow: true });
    }

    focusTextareaSoon();
  }

  function handleTextareaChange(event) {
    const nextValue = event.target.value;

    if (nextValue !== localDraftRef.current) {
      onTypingActivity?.();
    }

    setDraftValue(nextValue);
  }

  function handleTextareaKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitCurrentDraft(event);
      return;
    }

    handleKeyDown?.(event);
  }

  function keepComposerFocused(event) {
    if (composerDisabled) return;
    event.preventDefault();
  }

  function handleEmojiClick(emoji) {
    onTypingActivity?.();
    setDraftValue(`${localDraftRef.current}${emoji}`);
    setShowEmojiPicker(false);
    insertEmoji?.(emoji, { skipDraftUpdate: true });
    focusTextareaSoon();
  }

  return (
    <form
      onSubmit={submitCurrentDraft}
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
          grid-template-columns: auto auto minmax(0, 1fr) auto auto;
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

        .chat-voice-recorder {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid rgba(248, 113, 113, 0.24);
          border-radius: 16px;
          background: rgba(127, 29, 29, 0.18);
          color: #fff;
        }

        .chat-voice-recorder__status {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13px;
          font-weight: 900;
        }

        .chat-voice-recorder__dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #f87171;
          box-shadow: 0 0 0 6px rgba(248, 113, 113, 0.12);
        }

        .chat-voice-recorder__actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .chat-voice-recorder__button {
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          color: #fff;
          background: rgba(255,255,255,0.08);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .chat-voice-recorder__button--save {
          color: #052e16;
          border-color: rgba(134, 239, 172, 0.56);
          background: linear-gradient(135deg, #86efac, #5eead4);
        }

        .chat-composer-icon-button--recording {
          color: #fecaca;
          background: rgba(127, 29, 29, 0.32);
        }

        .chat-pending-voice {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          min-height: 74px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(20, 184, 166, 0.1);
          border: 1px solid rgba(94, 234, 212, 0.16);
        }

        @media (max-width: 640px) {
          .chat-composer-form {
            padding: 10px 10px 12px !important;
          }

          .chat-composer-shell {
            grid-template-columns: 38px 38px minmax(0, 1fr) 38px 38px;
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
            const isVoice = Boolean(file.isVoiceMessage);
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
                {isVoice && (
                  <div className="chat-pending-voice">
                    <div style={{ width: "42px", height: "42px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#052e16", background: "linear-gradient(135deg, #86efac, #5eead4)", fontSize: "20px" }}>🎙️</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#f8fafc", fontSize: "14px", fontWeight: 1000 }}>Голосовое сообщение</div>
                      <div style={{ color: "rgba(203,213,225,0.78)", fontSize: "13px" }}>{formatVoiceDuration(file.voiceDurationMs)}</div>
                    </div>
                  </div>
                )}

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

                {!isVoice && !isImage && !isVideo && (
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

      {recordingError && (
        <div style={{ color: "#fecaca", fontSize: "13px", paddingLeft: "8px" }}>
          {recordingError}
        </div>
      )}

      {isRecordingVoice && (
        <div className="chat-voice-recorder">
          <div className="chat-voice-recorder__status">
            <span className="chat-voice-recorder__dot" />
            <span>Запись голосового · {formatVoiceDuration(recordingMs)}</span>
          </div>

          <div className="chat-voice-recorder__actions">
            <button
              type="button"
              className="chat-voice-recorder__button"
              onPointerDown={keepComposerFocused}
              onClick={cancelVoiceRecording}
            >
              Отмена
            </button>
            <button
              type="button"
              className="chat-voice-recorder__button chat-voice-recorder__button--save"
              onPointerDown={keepComposerFocused}
              onClick={() => stopVoiceRecording({ save: true })}
            >
              Готово
            </button>
          </div>
        </div>
      )}

      <div className="chat-composer-shell">
        <input
          ref={attachmentInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a,.aac,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
        />

        <button
          type="button"
          className="chat-composer-icon-button"
          onPointerDown={keepComposerFocused}
          onClick={() => attachmentInputRef.current?.click()}
          disabled={composerDisabled || isRecordingVoice}
          title="Прикрепить файлы"
        >
          <PaperclipIcon />
        </button>

        <button
          type="button"
          className={`chat-composer-icon-button ${isRecordingVoice ? "chat-composer-icon-button--recording" : ""}`}
          onPointerDown={keepComposerFocused}
          onClick={handleVoiceButtonClick}
          disabled={composerDisabled}
          title={isRecordingVoice ? "Остановить запись" : "Записать голосовое"}
        >
          {isRecordingVoice ? <StopIcon /> : <MicIcon />}
        </button>

        <textarea
          ref={textareaRef}
          className="chat-scrollbar chat-composer-textarea"
          placeholder={
            isRecordingVoice
              ? "Идет запись голосового..."
              : composerDisabled
                ? (loadingGroupDetails ? "Загрузка..." : groupSystemMessage || "Отправка сообщений недоступна")
                : "Сообщение"
          }
          disabled={composerDisabled}
          value={localDraft}
          onChange={handleTextareaChange}
          onKeyDown={handleTextareaKeyDown}
          onPaste={handleComposerPaste}
          rows={1}
          style={{ opacity: composerDisabled ? 0.7 : 1 }}
        />

        <div style={{ position: "relative", lineHeight: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="chat-composer-icon-button"
            onPointerDown={keepComposerFocused}
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
                  onPointerDown={keepComposerFocused}
                  onClick={() => handleEmojiClick(emoji)}
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
          onPointerDown={keepComposerFocused}
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
