import { useEffect, useMemo, useRef, useState } from "react";
import { createGroupChat, uploadChatAvatar } from "../../api/chatsApi";
import { getFriends } from "../../api/friendsApi";
import { getSafeImageUrl } from "../../utils/safeUrl.js";
import AvatarCropEditor from "../AvatarCropEditor";
import "../../styles/CreateGroupChatModal.css";

function getFriendDisplayName(friend) {
  const fullName = `${friend?.firstName || ""} ${friend?.lastName || ""}`.trim();
  return friend?.displayName || fullName || friend?.userName || "Пользователь";
}

function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() || "U";
}

export default function CreateGroupChatModal({ isOpen, onClose, onCreated }) {
  const [friends, setFriends] = useState([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropSourceUrl, setAvatarCropSourceUrl] = useState("");
  const [avatarCropFileName, setAvatarCropFileName] = useState("");
  const avatarInputRef = useRef(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    canMembersInvite: false,
    participantIds: [],
  });

  const filteredFriends = useMemo(() => {
    const query = friendSearch.trim().toLowerCase();

    if (!query) return friends;

    return friends.filter((friend) => {
      const text = [
        getFriendDisplayName(friend),
        friend?.userName,
        friend?.region,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });
  }, [friends, friendSearch]);

  useEffect(() => {
    if (!isOpen) return;

    async function loadFriends() {
      try {
        setLoadingFriends(true);
        setError("");
        const data = await getFriends();
        setFriends(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setError(`Не удалось загрузить друзей: ${err.message}`);
      } finally {
        setLoadingFriends(false);
      }
    }

    loadFriends();
  }, [isOpen]);

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
    if (!isOpen) {
      closeAvatarCropEditor();
    }
  }, [isOpen]);

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

  function resetForm() {
    setForm({
      name: "",
      description: "",
      canMembersInvite: false,
      participantIds: [],
    });
    setFriendSearch("");
    setAvatarFile(null);
    setAvatarPreviewUrl("");
    closeAvatarCropEditor();
    setError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function toggleParticipant(userId) {
    setForm((prev) => ({
      ...prev,
      participantIds: prev.participantIds.includes(userId)
        ? prev.participantIds.filter((x) => x !== userId)
        : [...prev.participantIds, userId],
    }));
  }

  function openAvatarPicker() {
    avatarInputRef.current?.click();
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setError("Для фото группового чата можно выбрать только изображение.");
      return;
    }

    closeAvatarCropEditor();
    setError("");

    const sourceUrl = URL.createObjectURL(file);
    setAvatarCropSourceUrl(sourceUrl);
    setAvatarCropFileName(file.name || "group-avatar.jpg");
    setAvatarCropOpen(true);
  }

  function clearAvatar() {
    setAvatarFile(null);
    setAvatarPreviewUrl("");
    closeAvatarCropEditor();
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  }

  async function handleAvatarCropApply(croppedFile) {
    setAvatarFile(croppedFile);
    closeAvatarCropEditor();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      setSaving(true);

      let avatarUrl = null;

      if (avatarFile) {
        setUploadingAvatar(true);
        const uploadResult = await uploadChatAvatar(avatarFile);
        avatarUrl = uploadResult.avatarUrl;
      }

      const result = await createGroupChat({
        name: form.name,
        description: form.description || null,
        avatarUrl,
        canMembersInvite: form.canMembersInvite,
        participantIds: form.participantIds,
      });

      resetForm();
      onCreated(result);
    } catch (err) {
      console.error(err);
      setError(`Не удалось создать чат: ${err.message}`);
    } finally {
      setSaving(false);
      setUploadingAvatar(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <AvatarCropEditor
        isOpen={avatarCropOpen}
        imageUrl={avatarCropSourceUrl}
        fileName={avatarCropFileName}
        onClose={closeAvatarCropEditor}
        onApply={handleAvatarCropApply}
        saving={saving || uploadingAvatar}
        kicker="Фото группы"
        title="Настрой фото чата"
        hint="Перетащи фото внутри круга и настрой масштаб. Так изображение будет выглядеть в списке чатов и в шапке группы."
        applyLabel="Сохранить фото"
        imageAlt="Выбранное фото группы"
      />

      <div className="create-group-modal-backdrop" onClick={handleClose}>
        <div
          className="create-group-modal chat-scrollbar"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-modal-title"
        >
          <header className="create-group-modal__header">
            <div>
              <p className="create-group-modal__kicker">Групповой чат</p>
              <h2 id="create-group-modal-title">Новый чат</h2>
              <p className="create-group-modal__subtitle">
                Заполни основные данные, добавь фото и выбери друзей для группы.
              </p>
            </div>

            <button
              className="create-group-modal__close"
              onClick={handleClose}
              type="button"
              disabled={saving || uploadingAvatar}
            >
              Закрыть
            </button>
          </header>

          <form className="create-group-form" onSubmit={handleSubmit}>
            <section className="create-group-section create-group-section--main">
              <label className="create-group-field">
                <span>Название чата</span>
                <input
                  placeholder="Например: Рыбалка на выходных"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={saving || uploadingAvatar}
                  required
                />
              </label>

              <label className="create-group-field">
                <span>Описание</span>
                <textarea
                  placeholder="Коротко расскажи, для чего создается группа"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={saving || uploadingAvatar}
                  rows={3}
                />
              </label>
            </section>

            <section className="create-group-section create-group-section--avatar">
              <input
                ref={avatarInputRef}
                className="create-group-avatar-field__input"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={handleAvatarChange}
              />

              <div className="create-group-avatar-field__preview" aria-hidden="true">
                {avatarPreviewUrl ? (
                  <img src={avatarPreviewUrl} alt="" />
                ) : (
                  <span>{getInitials(form.name || "Г")}</span>
                )}
              </div>

              <div className="create-group-avatar-field__content">
                <div className="create-group-avatar-field__title">Фото группы</div>
                <p className="create-group-avatar-field__hint">
                  Будет отображаться в списке чатов и в шапке группы.
                </p>

                <div className="create-group-avatar-field__actions">
                  <button
                    type="button"
                    className="create-group-avatar-field__button"
                    onClick={openAvatarPicker}
                    disabled={saving || uploadingAvatar}
                  >
                    <span className="create-group-avatar-field__plus">+</span>
                    {avatarFile ? "Заменить фото" : "Добавить фото"}
                  </button>

                  {avatarFile && (
                    <button
                      type="button"
                      className="create-group-avatar-field__remove"
                      onClick={clearAvatar}
                      disabled={saving || uploadingAvatar}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </section>

            <label className="create-group-toggle">
              <input
                type="checkbox"
                checked={form.canMembersInvite}
                onChange={(e) =>
                  setForm({ ...form, canMembersInvite: e.target.checked })
                }
                disabled={saving || uploadingAvatar}
              />
              <span className="create-group-toggle__switch" aria-hidden="true" />
              <span className="create-group-toggle__content">
                <span className="create-group-toggle__title">
                  Участники могут приглашать других
                </span>
                <span className="create-group-toggle__hint">
                  Если выключено, приглашать новых участников сможете только вы.
                </span>
              </span>
            </label>

            <section className="create-group-section create-group-section--friends">
              <div className="create-group-friends-head">
                <div>
                  <p className="create-group-section__kicker">Участники</p>
                  <h3>Добавить друзей</h3>
                </div>
                <span className="create-group-selected-count">
                  Выбрано: {form.participantIds.length}
                </span>
              </div>

              <input
                className="create-group-search"
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
                placeholder="Поиск по имени, фамилии или региону"
                disabled={saving || uploadingAvatar}
              />

              {loadingFriends ? (
                <p className="create-group-empty">Загрузка друзей...</p>
              ) : friends.length === 0 ? (
                <p className="create-group-empty">Друзей пока нет</p>
              ) : filteredFriends.length === 0 ? (
                <p className="create-group-empty">По этому запросу друзей не найдено</p>
              ) : (
                <div className="create-group-friends-list chat-scrollbar">
                  {filteredFriends.map((friend) => {
                    const checked = form.participantIds.includes(friend.userId);
                    const displayName = getFriendDisplayName(friend);
                    const safeAvatarUrl = getSafeImageUrl(friend.avatarUrl);

                    return (
                      <label
                        key={friend.userId}
                        className={`create-group-friend ${checked ? "is-selected" : ""}`}
                      >
                        {safeAvatarUrl ? (
                          <img
                            className="create-group-friend__avatar"
                            src={safeAvatarUrl}
                            alt={displayName}
                          />
                        ) : (
                          <div className="create-group-friend__avatar create-group-friend__avatar--fallback">
                            {getInitials(displayName)}
                          </div>
                        )}

                        <span className="create-group-friend__info">
                          <span className="create-group-friend__name">{displayName}</span>
                          <span className="create-group-friend__meta">
                            @{friend.userName || "user"}
                            {friend.region ? ` · ${friend.region}` : ""}
                          </span>
                        </span>

                        <span className="create-group-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleParticipant(friend.userId)}
                            disabled={saving || uploadingAvatar}
                          />
                          <span aria-hidden="true" />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            {error && <p className="create-group-error">{error}</p>}

            <footer className="create-group-modal__actions">
              <button
                type="button"
                className="create-group-modal__secondary"
                onClick={handleClose}
                disabled={saving || uploadingAvatar}
              >
                Отмена
              </button>

              <button
                type="submit"
                className="create-group-modal__primary"
                disabled={saving || uploadingAvatar}
              >
                {saving || uploadingAvatar ? "Создаём..." : "Создать чат"}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </>
  );
}
