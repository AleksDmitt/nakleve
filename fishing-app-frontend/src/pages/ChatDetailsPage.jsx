import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addChatParticipants,
  deleteGroupChat,
  getChatDetails,
  leaveChat,
  transferChatOwnership,
  removeChatParticipant,
  updateChatParticipantRole,
  updateGroupChat,
  updateChatNotificationSettings,
  uploadChatAvatar,
} from "../api/chatsApi";
import { getFriends, searchUsersByUserName } from "../api/friendsApi";
import AvatarCropEditor from "../components/AvatarCropEditor";
import { useAuth } from "../context/AuthContext";
import { getSafeImageUrl } from "../utils/safeUrl.js";
import "../styles/chatDetails.css";
import "../styles/chatDetailsNotifications.css";

function roleLabel(role) {
  if (role === "Owner") return "Владелец";
  if (role === "Admin") return "Админ";
  return "Участник";
}

function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() || "U";
}

function getDisplayName(person) {
  const fullName = `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
  return person?.displayName || person?.userName || person?.name || fullName || "Пользователь";
}

function getPersonUserId(person) {
  return person?.userId || person?.id || person?.friendUserId || null;
}

function ChatAvatar({ src, name, size = "medium", className = "" }) {
  const safeSrc = src ? getSafeImageUrl(src) : "";
  const classes = `chat-details-avatar chat-details-avatar--${size} ${className}`.trim();

  if (safeSrc) {
    return <img className={classes} src={safeSrc} alt={name || "Аватар"} />;
  }

  return <div className={`${classes} chat-details-avatar--fallback`}>{getInitials(name)}</div>;
}

function ParticipantCard({ participant, actions, onOpenProfile }) {
  return (
    <article className="chat-details-person-card">
      <button
        type="button"
        className="chat-details-person-card__avatar-button"
        onClick={() => onOpenProfile(participant.userId)}
        title="Открыть профиль"
      >
        <ChatAvatar src={participant.avatarUrl} name={participant.userName} size="medium" />
      </button>

      <div className="chat-details-person-card__info">
        <button
          type="button"
          className="chat-details-person-card__name"
          onClick={() => onOpenProfile(participant.userId)}
        >
          {participant.userName || "Пользователь"}
        </button>
        <span>{roleLabel(participant.role)}</span>
        <span>{participant.region || "Регион не указан"}</span>
      </div>

      {actions && <div className="chat-details-person-card__actions">{actions}</div>}
    </article>
  );
}

function AddUserRow({ person, selected, disabled, onToggle }) {
  const userId = getPersonUserId(person);
  const displayName = getDisplayName(person);

  return (
    <label className={`chat-details-user-row ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}>
      <ChatAvatar src={person.avatarUrl} name={displayName} size="small" />

      <span className="chat-details-user-row__info">
        <strong>{displayName}</strong>
        <small>{person.region || person.userName || "Регион не указан"}</small>
      </span>

      <span className="chat-details-checkbox">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled || !userId}
          onChange={() => userId && onToggle(userId)}
        />
        <span />
      </span>
    </label>
  );
}

export default function ChatDetailsPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [editing, setEditing] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mutingChat, setMutingChat] = useState(false);

  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [addingParticipants, setAddingParticipants] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [changingRoleUserId, setChangingRoleUserId] = useState(null);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [transferringOwnershipUserId, setTransferringOwnershipUserId] = useState(null);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropSourceUrl, setAvatarCropSourceUrl] = useState("");
  const [avatarCropFileName, setAvatarCropFileName] = useState("");
  const avatarInputRef = useRef(null);
  const backGuardInstalledRef = useRef(false);
  const closeInProgressRef = useRef(false);

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    avatarUrl: "",
    canMembersInvite: false,
  });

  async function loadDetails() {
    try {
      setLoading(true);
      setMessage("");
      const data = await getChatDetails(chatId);
      setChat(data);
      setEditForm({
        name: data.name || "",
        description: data.description || "",
        avatarUrl: data.avatarUrl || "",
        canMembersInvite: !!data.canMembersInvite,
      });
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось загрузить информацию о чате: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.add("chat-details-document");
    body.classList.add("chat-details-document");

    if (window.scrollX !== 0) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    }

    function keepPageAtLeft() {
      if (window.scrollX !== 0) {
        window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
      }
    }

    window.addEventListener("resize", keepPageAtLeft);
    window.visualViewport?.addEventListener("resize", keepPageAtLeft);

    return () => {
      window.removeEventListener("resize", keepPageAtLeft);
      window.visualViewport?.removeEventListener("resize", keepPageAtLeft);
      root.classList.remove("chat-details-document");
      body.classList.remove("chat-details-document");
    };
  }, []);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  useEffect(() => {
    return () => {
      if (avatarCropSourceUrl) {
        URL.revokeObjectURL(avatarCropSourceUrl);
      }
    };
  }, [avatarCropSourceUrl]);

  const participants = chat?.participants || [];
  const participantIds = useMemo(
    () => new Set(participants.map((participant) => participant.userId)),
    [participants]
  );

  const myParticipant = participants.find((participant) => participant.userId === user?.id);
  const isOwner = myParticipant?.role === "Owner";
  const isAdmin = myParticipant?.role === "Admin";
  const isDeletedByOwner = !!chat?.isDeletedByOwner;
  const currentUserStatus = chat?.currentUserStatus || myParticipant?.status || "Active";

  const canEditChat = !isDeletedByOwner && currentUserStatus === "Active" && (isOwner || isAdmin);
  const canInvite =
    !isDeletedByOwner &&
    currentUserStatus === "Active" &&
    (canEditChat || (myParticipant?.role === "Member" && chat?.canMembersInvite));

  useEffect(() => {
    if (!addModalOpen || !canInvite) return undefined;

    let cancelled = false;

    async function loadFriends() {
      try {
        setLoadingFriends(true);
        const data = await getFriends();
        if (!cancelled) setFriends(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setMessage(`Не удалось загрузить друзей: ${err.message}`);
      } finally {
        if (!cancelled) setLoadingFriends(false);
      }
    }

    loadFriends();

    return () => {
      cancelled = true;
    };
  }, [addModalOpen, canInvite]);

  useEffect(() => {
    if (!addModalOpen) return undefined;

    const normalized = searchText.trim().replace(/^@/, "");
    if (normalized.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const data = await searchUsersByUserName(normalized);
        if (!cancelled) setSearchResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setMessage(`Не удалось выполнить поиск: ${err.message}`);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [addModalOpen, searchText]);

  const availableFriends = useMemo(() => {
    return friends.filter((friend) => {
      const userId = getPersonUserId(friend);
      return userId && !participantIds.has(userId);
    });
  }, [friends, participantIds]);

  const availableSearchResults = useMemo(() => {
    const seenIds = new Set();

    return searchResults.filter((person) => {
      const userId = getPersonUserId(person);
      if (!userId || participantIds.has(userId) || seenIds.has(userId) || userId === user?.id) {
        return false;
      }

      seenIds.add(userId);
      return true;
    });
  }, [participantIds, searchResults, user?.id]);

  const shownAvatarUrl = avatarPreviewUrl || editForm.avatarUrl || chat?.avatarUrl;
  const chatReturnUrl = useMemo(
    () => chatId ? `/chats?chatId=${encodeURIComponent(chatId)}` : "/chats",
    [chatId]
  );

  const navigateBackToChat = useCallback(() => {
    navigate(chatReturnUrl, { replace: true });
  }, [chatReturnUrl, navigate]);

  const closeChatInfoPage = useCallback(() => {
    if (closeInProgressRef.current) return;

    closeInProgressRef.current = true;

    if (
      backGuardInstalledRef.current &&
      typeof window !== "undefined" &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }

    navigateBackToChat();
  }, [navigateBackToChat]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const currentState = window.history.state || {};

    if (!currentState.fishchatChatDetailsGuard) {
      const detailsState = {
        ...currentState,
        fishchatChatDetails: true,
      };

      window.history.replaceState(detailsState, "", window.location.href);
      window.history.pushState(
        {
          ...detailsState,
          fishchatChatDetailsGuard: true,
        },
        "",
        window.location.href
      );
    }

    backGuardInstalledRef.current = true;

    function handleBackFromChatDetails() {
      backGuardInstalledRef.current = false;
      closeInProgressRef.current = true;
      navigateBackToChat();
    }

    window.addEventListener("popstate", handleBackFromChatDetails);

    return () => {
      window.removeEventListener("popstate", handleBackFromChatDetails);
      backGuardInstalledRef.current = false;
    };
  }, [navigateBackToChat]);

  useEffect(() => {
    function handleEscapeClose(event) {
      if (event.key !== "Escape") return;
      closeChatInfoPage();
    }

    window.addEventListener("keydown", handleEscapeClose);

    return () => {
      window.removeEventListener("keydown", handleEscapeClose);
    };
  }, [closeChatInfoPage]);

  function closeAvatarCropEditor() {
    setAvatarCropOpen(false);
    setAvatarCropFileName("");
    setAvatarCropSourceUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return "";
    });
  }

  function openAvatarPicker() {
    avatarInputRef.current?.click();
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setMessage("Для фото чата можно выбрать только изображение.");
      return;
    }

    closeAvatarCropEditor();
    setMessage("");
    setAvatarCropSourceUrl(URL.createObjectURL(file));
    setAvatarCropFileName(file.name || "chat-avatar.jpg");
    setAvatarCropOpen(true);
  }

  function handleAvatarCropApply(croppedFile) {
    setAvatarFile(croppedFile);
    closeAvatarCropEditor();
  }

  function clearAvatar() {
    setAvatarFile(null);
    setAvatarPreviewUrl("");
    setEditForm((prev) => ({ ...prev, avatarUrl: "" }));
    closeAvatarCropEditor();
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  function cancelEditing() {
    if (!chat) return;

    setEditForm({
      name: chat.name || "",
      description: chat.description || "",
      avatarUrl: chat.avatarUrl || "",
      canMembersInvite: !!chat.canMembersInvite,
    });
    setAvatarFile(null);
    setAvatarPreviewUrl("");
    closeAvatarCropEditor();
    setEditing(false);
  }

  function toggleSelectedUser(userId) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  function openAddModal() {
    if (typeof window !== "undefined" && window.scrollX !== 0) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    }

    setSelectedUserIds([]);
    setSearchText("");
    setSearchResults([]);
    setAddModalOpen(true);
  }

  function closeAddModal() {
    if (addingParticipants) return;
    setAddModalOpen(false);
    setSelectedUserIds([]);
    setSearchText("");
    setSearchResults([]);
  }

  async function handleToggleChatMuted() {
    if (!chat?.id) return;

    try {
      setMutingChat(true);
      setMessage("");
      const result = await updateChatNotificationSettings(chat.id, !chat.currentUserIsMuted);
      const isMuted = !!result?.isMuted;
      setChat((current) => current ? { ...current, currentUserIsMuted: isMuted } : current);
      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
      setMessage(isMuted ? "Уведомления чата отключены" : "Уведомления чата включены");
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось изменить уведомления чата: ${err.message}`);
    } finally {
      setMutingChat(false);
    }
  }

  async function handleLeaveChat() {
    if (!window.confirm("Выйти из группового чата?")) return;

    try {
      setLeaving(true);
      setMessage("");
      await leaveChat(chatId);
      navigate("/chats");
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось выйти из чата: ${err.message}`);
    } finally {
      setLeaving(false);
    }
  }

  async function handleDeleteGroupChat() {
    if (!window.confirm("Удалить чат для всех участников? История останется доступной только для чтения.")) return;

    try {
      setDeletingChat(true);
      setMessage("");
      const updated = await deleteGroupChat(chatId);
      setChat(updated);
      setEditing(false);
      setMessage("Чат удалён владельцем.");
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось удалить чат: ${err.message}`);
    } finally {
      setDeletingChat(false);
    }
  }

  async function handleSaveChat() {
    try {
      setSavingChat(true);
      setMessage("");

      let avatarUrl = editForm.avatarUrl || null;
      if (avatarFile) {
        const uploadResult = await uploadChatAvatar(avatarFile);
        avatarUrl = uploadResult.avatarUrl;
      }

      const updated = await updateGroupChat(chatId, {
        name: editForm.name,
        description: editForm.description || null,
        avatarUrl,
        canMembersInvite: editForm.canMembersInvite,
      });

      setChat(updated);
      setEditForm({
        name: updated.name || "",
        description: updated.description || "",
        avatarUrl: updated.avatarUrl || "",
        canMembersInvite: !!updated.canMembersInvite,
      });
      setAvatarFile(null);
      setAvatarPreviewUrl("");
      setEditing(false);
      window.dispatchEvent(new CustomEvent("fishchat-chat-updated", { detail: { chat: updated } }));
      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось обновить чат: ${err.message}`);
    } finally {
      setSavingChat(false);
    }
  }

  async function handleAddParticipants() {
    if (selectedUserIds.length === 0) return;

    try {
      setAddingParticipants(true);
      setMessage("");
      const updated = await addChatParticipants(chatId, selectedUserIds);
      setChat(updated);
      closeAddModal();
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось добавить участников: ${err.message}`);
    } finally {
      setAddingParticipants(false);
    }
  }

  async function handleRemoveParticipant(userId) {
    if (!window.confirm("Исключить участника из чата?")) return;

    try {
      setRemovingUserId(userId);
      setMessage("");
      const updated = await removeChatParticipant(chatId, userId);
      setChat(updated);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось исключить участника: ${err.message}`);
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleToggleAdmin(participant) {
    const nextRole = participant.role === "Admin" ? "Member" : "Admin";

    try {
      setChangingRoleUserId(participant.userId);
      setMessage("");
      const updated = await updateChatParticipantRole(chatId, participant.userId, nextRole);
      setChat(updated);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось изменить роль: ${err.message}`);
    } finally {
      setChangingRoleUserId(null);
    }
  }

  async function handleTransferOwnership(participant) {
    if (!window.confirm(`Передать права владельца пользователю ${participant.userName}?`)) return;

    try {
      setTransferringOwnershipUserId(participant.userId);
      setMessage("");
      const updated = await transferChatOwnership(chatId, participant.userId);
      setChat(updated);
      setMessage(`Права владельца переданы пользователю ${participant.userName}.`);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось передать права владельца: ${err.message}`);
    } finally {
      setTransferringOwnershipUserId(null);
    }
  }

  function goToUserProfile(userId) {
    if (!userId) return;
    navigate(user?.id === userId ? "/profile" : `/users/${userId}`);
  }

  if (loading) {
    return <div className="chat-details-page"><div className="chat-details-loading">Загрузка информации о чате...</div></div>;
  }

  if (!chat) {
    return <div className="chat-details-page"><div className="chat-details-loading">Чат не найден</div></div>;
  }

  return (
    <>
      <AvatarCropEditor
        isOpen={avatarCropOpen}
        imageUrl={avatarCropSourceUrl}
        fileName={avatarCropFileName}
        onClose={closeAvatarCropEditor}
        onApply={handleAvatarCropApply}
        saving={savingChat}
        kicker="Фото чата"
        title="Настрой фото чата"
        hint="Перетащи фото внутри круга и настрой масштаб. Так изображение будет выглядеть в списке чатов и в шапке группы."
        applyLabel="Сохранить фото"
        savingLabel="Сохраняем..."
        imageAlt="Выбранное фото чата"
      />

      {addModalOpen && (
        <div className="chat-details-modal-backdrop" onMouseDown={closeAddModal}>
          <section className="chat-details-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="chat-details-modal__head">
              <div>
                <p className="chat-details-kicker">Приглашения</p>
                <h2>Добавить участника</h2>
                <p>Выбери друга или найди пользователя по имени пользователя.</p>
              </div>
              <button type="button" className="chat-details-icon-button" onClick={closeAddModal} aria-label="Закрыть">×</button>
            </div>

            <label className="chat-details-field">
              <span>Поиск пользователя</span>
              <input
                placeholder="Например: @username"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>

            <div className="chat-details-modal__body">
              {searchText.trim().length >= 2 && (
                <div className="chat-details-add-block">
                  <div className="chat-details-add-block__title">Результаты поиска</div>
                  {searchLoading ? (
                    <p className="chat-details-empty">Ищем пользователя...</p>
                  ) : availableSearchResults.length === 0 ? (
                    <p className="chat-details-empty">Подходящих пользователей не найдено.</p>
                  ) : (
                    <div className="chat-details-user-list">
                      {availableSearchResults.map((person) => {
                        const userId = getPersonUserId(person);
                        return (
                          <AddUserRow
                            key={userId}
                            person={person}
                            selected={selectedUserIds.includes(userId)}
                            onToggle={toggleSelectedUser}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="chat-details-add-block">
                <div className="chat-details-add-block__title">Друзья</div>
                {loadingFriends ? (
                  <p className="chat-details-empty">Загрузка друзей...</p>
                ) : availableFriends.length === 0 ? (
                  <p className="chat-details-empty">Нет друзей, которых можно добавить.</p>
                ) : (
                  <div className="chat-details-user-list">
                    {availableFriends.map((friend) => {
                      const userId = getPersonUserId(friend);
                      return (
                        <AddUserRow
                          key={userId}
                          person={friend}
                          selected={selectedUserIds.includes(userId)}
                          onToggle={toggleSelectedUser}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="chat-details-modal__actions">
              <span>Выбрано: {selectedUserIds.length}</span>
              <button type="button" className="chat-details-button chat-details-button--secondary" onClick={closeAddModal} disabled={addingParticipants}>Отмена</button>
              <button type="button" className="chat-details-button chat-details-button--primary" onClick={handleAddParticipants} disabled={selectedUserIds.length === 0 || addingParticipants}>
                {addingParticipants ? "Добавляем..." : "Добавить"}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="chat-details-page">
        {chat.systemMessage && (
          <div className="chat-details-alert">
            <strong>Системное сообщение</strong>
            <span>{chat.systemMessage}</span>
          </div>
        )}

        <section className="chat-details-hero">
          <div className="chat-details-hero__main">
            <ChatAvatar src={chat.avatarUrl} name={chat.name} size="large" />
            <div className="chat-details-hero__content">
              <p className="chat-details-kicker">Информация о чате</p>
              <h1>{chat.name}</h1>
              <p className="chat-details-description">{chat.description || "Описание чата пока не добавлено."}</p>
              <div className="chat-details-stats">
                <div className="chat-details-stat">
                  <span>Участники</span>
                  <strong>{participants.length}</strong>
                </div>
                <div className="chat-details-stat">
                  <span>Приглашения</span>
                  <strong>{chat.canMembersInvite ? "Разрешены" : "Только админы"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="chat-details-hero__actions">
            <button type="button" className="chat-details-button chat-details-button--secondary" onClick={closeChatInfoPage}>
              Назад в чат
            </button>
            {isOwner && (
              <button type="button" className="chat-details-button chat-details-button--danger" onClick={handleDeleteGroupChat} disabled={deletingChat || isDeletedByOwner}>
                {deletingChat ? "Удаляем..." : isDeletedByOwner ? "Чат удалён" : "Удалить чат"}
              </button>
            )}
            {currentUserStatus === "Active" && (
              <button type="button" className="chat-details-button chat-details-button--secondary" onClick={handleLeaveChat} disabled={leaving || isDeletedByOwner || isOwner} title={isOwner ? "Сначала передайте права владельца другому участнику" : "Выйти из чата"}>
                {leaving ? "Выходим..." : "Выйти"}
              </button>
            )}
          </div>
        </section>

        {message && <div className="chat-details-message">{message}</div>}

        {currentUserStatus === "Active" && !isDeletedByOwner && (
          <section className="chat-details-card">
            <label className={`chat-details-toggle ${chat.currentUserIsMuted ? "is-muted" : ""}`}>
              <input type="checkbox" checked={!!chat.currentUserIsMuted} disabled={mutingChat} onChange={handleToggleChatMuted} />
              <span className="chat-details-toggle__switch" />
              <span className="chat-details-toggle__content">
                <strong>Отключить уведомления</strong>
                <small>Сообщения останутся в чате, но всплывающие уведомления по этой группе не будут приходить.</small>
              </span>
            </label>
          </section>
        )}

        {canEditChat && (
          <section className="chat-details-card">
            <div className="chat-details-section-head">
              <div>
                <p className="chat-details-kicker">Управление</p>
                <h2>Настройки чата</h2>
              </div>
              <button type="button" className="chat-details-button chat-details-button--secondary" onClick={() => editing ? cancelEditing() : setEditing(true)}>
                {editing ? "Отменить" : "Редактировать"}
              </button>
            </div>

            {editing && (
              <div className="chat-details-edit-form">
                <label className="chat-details-field">
                  <span>Название чата</span>
                  <input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Название чата" />
                </label>

                <label className="chat-details-field">
                  <span>Описание</span>
                  <textarea rows={4} value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Кратко опиши тематику группы" />
                </label>

                <div className="chat-details-avatar-editor">
                  <input ref={avatarInputRef} className="chat-details-avatar-editor__input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleAvatarChange} />
                  <ChatAvatar src={shownAvatarUrl} name={editForm.name || chat.name} size="edit" />
                  <div className="chat-details-avatar-editor__content">
                    <div className="chat-details-avatar-editor__title">Фото чата</div>
                    <p>Фото будет отображаться в списке чатов и в шапке группы.</p>
                    <div className="chat-details-avatar-editor__actions">
                      <button type="button" className="chat-details-avatar-editor__button" onClick={openAvatarPicker} disabled={savingChat}>
                        {shownAvatarUrl ? "Заменить фото" : "Добавить фото"}
                      </button>
                      {shownAvatarUrl && <button type="button" className="chat-details-avatar-editor__remove" onClick={clearAvatar} disabled={savingChat}>Удалить</button>}
                    </div>
                  </div>
                </div>

                <label className="chat-details-toggle">
                  <input type="checkbox" checked={editForm.canMembersInvite} onChange={(event) => setEditForm((prev) => ({ ...prev, canMembersInvite: event.target.checked }))} />
                  <span className="chat-details-toggle__switch" />
                  <span className="chat-details-toggle__content">
                    <strong>Участники могут приглашать других</strong>
                    <small>Если выключено, новых участников добавляют только владелец и админы.</small>
                  </span>
                </label>

                <div className="chat-details-actions-row">
                  <button type="button" className="chat-details-button chat-details-button--secondary" onClick={cancelEditing} disabled={savingChat}>Отмена</button>
                  <button type="button" className="chat-details-button chat-details-button--primary" onClick={handleSaveChat} disabled={savingChat || !editForm.name.trim()}>
                    {savingChat ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="chat-details-card">
          <div className="chat-details-section-head chat-details-section-head--participants">
            <div>
              <p className="chat-details-kicker">Состав группы</p>
              <h2>Участники</h2>
            </div>
            <div className="chat-details-section-actions">
              <span className="chat-details-count">{participants.length}</span>
              {canInvite && <button type="button" className="chat-details-button chat-details-button--primary" onClick={openAddModal}>Добавить участника</button>}
            </div>
          </div>

          {participants.length === 0 ? (
            <p className="chat-details-empty">Участников нет.</p>
          ) : (
            <div className="chat-details-participants-list">
              {participants.map((participant) => {
                const canTransferOwnership =
                  !isDeletedByOwner &&
                  isOwner &&
                  participant.role !== "Owner" &&
                  participant.userId !== user?.id;

                const canToggleAdmin =
                  !isDeletedByOwner &&
                  isOwner &&
                  participant.role !== "Owner" &&
                  participant.userId !== user?.id;

                const canRemoveParticipant =
                  !isDeletedByOwner &&
                  ((isOwner && participant.role !== "Owner" && participant.userId !== user?.id) ||
                    (isAdmin && participant.role === "Member" && participant.userId !== user?.id));

                const actions = canTransferOwnership || canToggleAdmin || canRemoveParticipant ? (
                  <>
                    {canTransferOwnership && (
                      <button type="button" className="chat-details-button chat-details-button--secondary chat-details-button--small" onClick={() => handleTransferOwnership(participant)} disabled={transferringOwnershipUserId === participant.userId}>
                        {transferringOwnershipUserId === participant.userId ? "Передаём..." : "Сделать владельцем"}
                      </button>
                    )}
                    {canToggleAdmin && (
                      <button type="button" className="chat-details-button chat-details-button--secondary chat-details-button--small" onClick={() => handleToggleAdmin(participant)} disabled={changingRoleUserId === participant.userId}>
                        {changingRoleUserId === participant.userId ? "Сохраняем..." : participant.role === "Admin" ? "Снять админа" : "Назначить админом"}
                      </button>
                    )}
                    {canRemoveParticipant && (
                      <button type="button" className="chat-details-button chat-details-button--danger chat-details-button--small" onClick={() => handleRemoveParticipant(participant.userId)} disabled={removingUserId === participant.userId}>
                        {removingUserId === participant.userId ? "Исключаем..." : "Исключить"}
                      </button>
                    )}
                  </>
                ) : null;

                return <ParticipantCard key={participant.userId} participant={participant} onOpenProfile={goToUserProfile} actions={actions} />;
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
