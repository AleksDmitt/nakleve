import { useEffect, useMemo, useRef, useState } from "react";
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
import { getFriends } from "../api/friendsApi";
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

function statusLabel(status) {
  if (status === "Removed") return "Исключён";
  if (status === "Left") return "Вышел";
  return "Активен";
}

function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() || "U";
}

function getDisplayName(person) {
  const fullName = `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
  return person?.displayName || fullName || person?.userName || "Пользователь";
}

function ChatAvatar({ src, name, size = "large", className = "" }) {
  const safeSrc = src ? getSafeImageUrl(src) : "";

  if (safeSrc) {
    return (
      <img
        className={`chat-details-avatar chat-details-avatar--${size} ${className}`.trim()}
        src={safeSrc}
        alt={name || "Фото чата"}
      />
    );
  }

  return (
    <div className={`chat-details-avatar chat-details-avatar--${size} chat-details-avatar--fallback ${className}`.trim()}>
      {getInitials(name)}
    </div>
  );
}

function ParticipantCard({
  participant,
  actionArea,
  onOpenProfile,
}) {
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
          {participant.userName}
        </button>
        <div className="chat-details-person-card__meta">{roleLabel(participant.role)}</div>
        <div className="chat-details-person-card__meta">{participant.region || "Регион не указан"}</div>
      </div>

      {actionArea && <div className="chat-details-person-card__actions">{actionArea}</div>}
    </article>
  );
}

export default function ChatDetailsPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [mutingChat, setMutingChat] = useState(false);

  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [addingParticipants, setAddingParticipants] = useState(false);

  const [editing, setEditing] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [changingRoleUserId, setChangingRoleUserId] = useState(null);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [transferringOwnershipUserId, setTransferringOwnershipUserId] = useState(null);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropSourceUrl, setAvatarCropSourceUrl] = useState("");
  const [avatarCropFileName, setAvatarCropFileName] = useState("");
  const avatarInputRef = useRef(null);

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    avatarUrl: "",
    canMembersInvite: false,
  });

  useEffect(() => {
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

    loadDetails();
  }, [chatId]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return;
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

  const myParticipant = chat?.participants?.find((x) => x.userId === user?.id);
  const isOwner = myParticipant?.role === "Owner";
  const isAdmin = myParticipant?.role === "Admin";
  const isDeletedByOwner = !!chat?.isDeletedByOwner;
  const currentUserStatus = chat?.currentUserStatus || myParticipant?.status || "Active";
  const canSendMessages = !!chat?.canSendMessages;

  const canEditChat = !isDeletedByOwner && (isOwner || isAdmin) && currentUserStatus === "Active";
  const canInvite =
    !isDeletedByOwner &&
    (canEditChat || (myParticipant?.role === "Member" && chat?.canMembersInvite && currentUserStatus === "Active"));

  useEffect(() => {
    async function loadFriends() {
      if (!chat || !canInvite) return;

      try {
        setLoadingFriends(true);
        const data = await getFriends();
        setFriends(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setMessage(`Не удалось загрузить друзей: ${err.message}`);
      } finally {
        setLoadingFriends(false);
      }
    }

    loadFriends();
  }, [chat, canInvite]);

  const availableFriends = useMemo(() => {
    if (!chat) return [];

    const participantIds = new Set(chat.participants.map((x) => x.userId));
    return friends.filter((friend) => !participantIds.has(friend.userId));
  }, [friends, chat]);

  const ownershipCandidates = useMemo(() => {
    if (!chat?.participants) return [];

    return chat.participants.filter((participant) => participant.userId !== user?.id);
  }, [chat, user]);

  function closeAvatarCropEditor() {
    setAvatarCropOpen(false);
    setAvatarCropFileName("");
    setAvatarCropSourceUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
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

    const sourceUrl = URL.createObjectURL(file);
    setAvatarCropSourceUrl(sourceUrl);
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
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  }

  function cancelEditing() {
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

  function toggleFriend(userId) {
    setSelectedFriendIds((prev) =>
      prev.includes(userId)
        ? prev.filter((x) => x !== userId)
        : [...prev, userId]
    );
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
    const confirmed = window.confirm("Выйти из группового чата?");
    if (!confirmed) return;

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
    const confirmed = window.confirm(
      "Удалить чат для всех участников? История останется доступной только для чтения."
    );
    if (!confirmed) return;

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
      window.dispatchEvent(new CustomEvent("fishchat-chat-updated", { detail: { chat: updated } }));
      window.dispatchEvent(new CustomEvent("fishchat-notifications-refresh"));
      setEditing(false);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось обновить чат: ${err.message}`);
    } finally {
      setSavingChat(false);
    }
  }

  async function handleAddParticipants() {
    if (selectedFriendIds.length === 0) return;

    try {
      setAddingParticipants(true);
      setMessage("");

      const updated = await addChatParticipants(chatId, selectedFriendIds);
      setChat(updated);
      setSelectedFriendIds([]);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось добавить участников: ${err.message}`);
    } finally {
      setAddingParticipants(false);
    }
  }

  async function handleRemoveParticipant(userId) {
    const confirmed = window.confirm("Исключить участника из чата?");
    if (!confirmed) return;

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

      const updated = await updateChatParticipantRole(
        chatId,
        participant.userId,
        nextRole
      );

      setChat(updated);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось изменить роль: ${err.message}`);
    } finally {
      setChangingRoleUserId(null);
    }
  }

  async function handleTransferOwnership(participant) {
    const confirmed = window.confirm(
      `Передать права владельца пользователю ${participant.userName}? После этого вы станете админом и сможете выйти из чата.`
    );
    if (!confirmed) return;

    try {
      setTransferringOwnershipUserId(participant.userId);
      setMessage("");

      const updated = await transferChatOwnership(chatId, participant.userId);
      setChat(updated);
      setMessage(`Права владельца переданы пользователю ${participant.userName}. Теперь вы можете выйти из чата.`);
    } catch (err) {
      console.error(err);
      setMessage(`Не удалось передать права владельца: ${err.message}`);
    } finally {
      setTransferringOwnershipUserId(null);
    }
  }

  function goToUserProfile(userId) {
    if (!userId) return;

    if (user?.id === userId) {
      navigate("/profile");
      return;
    }

    navigate(`/users/${userId}`);
  }

  if (loading) {
    return (
      <div className="page-container chat-details-page">
        <div className="chat-details-card chat-details-loading">Загрузка информации о чате...</div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="page-container chat-details-page">
        <div className="chat-details-card chat-details-loading">Чат не найден</div>
      </div>
    );
  }

  const shownAvatarUrl = avatarPreviewUrl || editForm.avatarUrl || chat.avatarUrl;

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

      <div className="page-container chat-details-page">
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
              <p className="chat-details-description">
                {chat.description || "Описание чата пока не добавлено."}
              </p>

              <div className="chat-details-stats chat-details-stats--compact">
                <div className="chat-details-stat">
                  <span>Участники</span>
                  <strong>{chat.participants.length}</strong>
                </div>
                <div className="chat-details-stat">
                  <span>Приглашения</span>
                  <strong>{chat.canMembersInvite ? "Разрешены" : "Только админы"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="chat-details-hero__actions">
            <button
              type="button"
              className="chat-details-button chat-details-button--secondary"
              onClick={() => navigate(`/chats?chatId=${chat.id}`)}
            >
              Назад в чат
            </button>

            {isOwner && (
              <button
                type="button"
                className="chat-details-button chat-details-button--danger"
                onClick={handleDeleteGroupChat}
                disabled={deletingChat || isDeletedByOwner}
              >
                {deletingChat ? "Удаляем..." : isDeletedByOwner ? "Чат удалён" : "Удалить чат"}
              </button>
            )}

            {currentUserStatus === "Active" && (
              <button
                type="button"
                className="chat-details-button chat-details-button--secondary"
                onClick={handleLeaveChat}
                disabled={leaving || isDeletedByOwner || isOwner}
                title={isOwner ? "Сначала передайте права владельца другому участнику" : "Выйти из чата"}
              >
                {leaving ? "Выходим..." : "Выйти из чата"}
              </button>
            )}
          </div>
        </section>

        {message && <div className="chat-details-message">{message}</div>}

        {currentUserStatus === "Active" && !isDeletedByOwner && (
          <section className="chat-details-card chat-details-notification-card">
            <label className={`chat-details-toggle chat-details-toggle--notification ${chat.currentUserIsMuted ? "is-muted" : ""}`}>
              <input
                type="checkbox"
                checked={!!chat.currentUserIsMuted}
                disabled={mutingChat}
                onChange={handleToggleChatMuted}
              />
              <span className="chat-details-toggle__switch" />
              <span className="chat-details-toggle__content">
                <strong>Отключить уведомления</strong>
                <small>Новые сообщения останутся в чате, но всплывающие уведомления по этой группе не будут приходить.</small>
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

              <button
                type="button"
                className="chat-details-button chat-details-button--secondary"
                onClick={() => {
                  if (editing) {
                    cancelEditing();
                    return;
                  }
                  setEditing(true);
                }}
              >
                {editing ? "Отменить" : "Редактировать"}
              </button>
            </div>

            {editing && (
              <div className="chat-details-edit-form">
                <label className="chat-details-field">
                  <span>Название чата</span>
                  <input
                    placeholder="Название чата"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </label>

                <label className="chat-details-field">
                  <span>Описание</span>
                  <textarea
                    rows={4}
                    placeholder="Кратко опиши тематику группы"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </label>

                <div className="chat-details-avatar-editor">
                  <input
                    ref={avatarInputRef}
                    className="chat-details-avatar-editor__input"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                  />

                  <ChatAvatar src={shownAvatarUrl} name={editForm.name || chat.name} size="edit" />

                  <div className="chat-details-avatar-editor__content">
                    <div className="chat-details-avatar-editor__title">Фото чата</div>
                    <p className="chat-details-avatar-editor__hint">
                      Фото будет отображаться в списке чатов и в шапке группы.
                    </p>
                    <div className="chat-details-avatar-editor__actions">
                      <button
                        type="button"
                        className="chat-details-avatar-editor__button"
                        onClick={openAvatarPicker}
                        disabled={savingChat}
                      >
                        <span>+</span>
                        {shownAvatarUrl ? "Заменить фото" : "Добавить фото"}
                      </button>

                      {shownAvatarUrl && (
                        <button
                          type="button"
                          className="chat-details-avatar-editor__remove"
                          onClick={clearAvatar}
                          disabled={savingChat}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <label className="chat-details-toggle">
                  <input
                    type="checkbox"
                    checked={editForm.canMembersInvite}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        canMembersInvite: e.target.checked,
                      }))
                    }
                  />
                  <span className="chat-details-toggle__switch" />
                  <span className="chat-details-toggle__content">
                    <strong>Участники могут приглашать других</strong>
                    <small>Если выключено, новых участников добавляют только владелец и админы.</small>
                  </span>
                </label>

                <div className="chat-details-actions-row">
                  <button
                    type="button"
                    className="chat-details-button chat-details-button--secondary"
                    onClick={cancelEditing}
                    disabled={savingChat}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="chat-details-button chat-details-button--primary"
                    onClick={handleSaveChat}
                    disabled={savingChat || !editForm.name.trim()}
                  >
                    {savingChat ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {isOwner && !isDeletedByOwner && (
          <section className="chat-details-card">
            <div className="chat-details-section-head">
              <div>
                <p className="chat-details-kicker">Права доступа</p>
                <h2>Передача прав владельца</h2>
              </div>
              <p>Сначала передайте права активному участнику, затем сможете выйти из чата.</p>
            </div>

            {ownershipCandidates.length === 0 ? (
              <p className="chat-details-empty">Некому передать права владельца. Добавьте хотя бы одного участника.</p>
            ) : (
              <div className="chat-details-grid">
                {ownershipCandidates.map((participant) => (
                  <ParticipantCard
                    key={participant.userId}
                    participant={participant}
                    onOpenProfile={goToUserProfile}
                    actionArea={(
                      <button
                        type="button"
                        className="chat-details-button chat-details-button--secondary chat-details-button--small"
                        onClick={() => handleTransferOwnership(participant)}
                        disabled={transferringOwnershipUserId === participant.userId}
                      >
                        {transferringOwnershipUserId === participant.userId
                          ? "Передаём..."
                          : "Сделать владельцем"}
                      </button>
                    )}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {canInvite && (
          <section className="chat-details-card">
            <div className="chat-details-section-head">
              <div>
                <p className="chat-details-kicker">Приглашения</p>
                <h2>Добавить участников</h2>
              </div>
              <span className="chat-details-count">Выбрано: {selectedFriendIds.length}</span>
            </div>

            {loadingFriends ? (
              <p className="chat-details-empty">Загрузка друзей...</p>
            ) : availableFriends.length === 0 ? (
              <p className="chat-details-empty">Нет друзей, которых можно добавить.</p>
            ) : (
              <>
                <div className="chat-details-friend-list">
                  {availableFriends.map((friend) => {
                    const checked = selectedFriendIds.includes(friend.userId);
                    const displayName = getDisplayName(friend);

                    return (
                      <label
                        key={friend.userId}
                        className={`chat-details-friend ${checked ? "is-selected" : ""}`}
                      >
                        <ChatAvatar src={friend.avatarUrl} name={displayName} size="small" />

                        <span className="chat-details-friend__info">
                          <strong>{displayName}</strong>
                          <small>{friend.region || friend.userName || "Регион не указан"}</small>
                        </span>

                        <span className="chat-details-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFriend(friend.userId)}
                          />
                          <span />
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="chat-details-actions-row">
                  <button
                    type="button"
                    className="chat-details-button chat-details-button--primary"
                    onClick={handleAddParticipants}
                    disabled={selectedFriendIds.length === 0 || addingParticipants}
                  >
                    {addingParticipants ? "Добавляем..." : "Добавить выбранных"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        <section className="chat-details-card">
          <div className="chat-details-section-head">
            <div>
              <p className="chat-details-kicker">Состав группы</p>
              <h2>Участники</h2>
            </div>
            <span className="chat-details-count">{chat.participants.length}</span>
          </div>

          {chat.participants.length === 0 ? (
            <p className="chat-details-empty">Участников нет.</p>
          ) : (
            <div className="chat-details-grid">
              {chat.participants.map((participant) => {
                const canToggleAdmin =
                  !isDeletedByOwner &&
                  isOwner &&
                  participant.role !== "Owner" &&
                  participant.userId !== user?.id;

                const canRemoveParticipant =
                  !isDeletedByOwner &&
                  (
                    (isOwner &&
                      participant.role !== "Owner" &&
                      participant.userId !== user?.id) ||
                    (isAdmin &&
                      participant.role === "Member" &&
                      participant.userId !== user?.id)
                  );

                const actionArea = (canToggleAdmin || canRemoveParticipant) ? (
                  <>
                    {canToggleAdmin && (
                      <button
                        type="button"
                        className="chat-details-button chat-details-button--secondary chat-details-button--small"
                        onClick={() => handleToggleAdmin(participant)}
                        disabled={changingRoleUserId === participant.userId}
                      >
                        {changingRoleUserId === participant.userId
                          ? "Сохраняем..."
                          : participant.role === "Admin"
                            ? "Снять админа"
                            : "Назначить админом"}
                      </button>
                    )}

                    {canRemoveParticipant && (
                      <button
                        type="button"
                        className="chat-details-button chat-details-button--danger chat-details-button--small"
                        onClick={() => handleRemoveParticipant(participant.userId)}
                        disabled={removingUserId === participant.userId}
                      >
                        {removingUserId === participant.userId ? "Исключаем..." : "Исключить"}
                      </button>
                    )}
                  </>
                ) : null;

                return (
                  <ParticipantCard
                    key={participant.userId}
                    participant={participant}
                    onOpenProfile={goToUserProfile}
                    actionArea={actionArea}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
