import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import YandexMap from "../components/YandexMap";
import AvatarUploader from "../components/AvatarUploader";
import MediaLightbox from "../components/MediaLightbox";
import {
  getProfile,
  updateProfile,
  updateProfileAvatar,
  updateNotificationSettings,
  requestPasswordChangeCode,
  changePasswordWithCode,
  submitBlockAppeal,
} from "../api/profileApi";
import {
  createFishingEntry,
  deleteFishingEntry,
  getFishingEntries,
  updateFishingEntry,
  shareFishingEntry,
} from "../api/fishingEntriesApi";
import { uploadAvatar, uploadFishingMediaFiles } from "../api/uploadsApi";
import { getMapPoints } from "../api/mapPointsApi";
import { searchPlaces } from "../api/geocodingApi";
import { createOrGetPersonalChat, getChats, shareFishingEntryToChat } from "../api/chatsApi";
import {
  getFriends,
  getIncomingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  sendFriendRequest,
  searchUsersByUserName,
} from "../api/friendsApi";
import {
  acceptCompanionResponse,
  cancelCompanionResponseAcceptance,
  cancelMyCompanionResponse,
  closeCompanionRequest,
  createCompanionRequest,
  deleteCompanionRequest,
  getCompanionRequestById,
  getCompanionRequests,
  rejectCompanionResponse,
  updateCompanionRequest,
} from "../api/companionsApi";
import { useAuth } from "../context/AuthContext";
import {
  getSafeAppFileUrl,
  getSafeImageUrl,
  getSafeOptimizedImageUrl,
  useImageFallback,
} from "../utils/safeUrl.js";
import "../styles/profile.css";
import "../styles/notificationSettings.css";

const EMPTY_ENTRY_FORM = {
  title: "",
  locationName: "",
  description: "",
  catchType: "",
  catchWeight: "",
  bait: "",
  fishingDate: "",
  startTime: "",
  endTime: "",
  isMultiDay: false,
  endDate: "",
  latitude: "",
  longitude: "",
  photoUrl: "",
  media: [],
  visibility: 1,
  isPublishedToFeed: false,
};

const EMPTY_COMPANION_FORM = {
  title: "",
  description: "",
  region: "",
  plannedDate: "",
  plannedTime: "",
  meetingPoint: "",
  seatsCount: 1,
};

const COMPANION_STATUS_LABELS = {
  open: "Активен",
  closed: "Закрыт",
  cancelled: "Отменён",
};

const COMPANION_RESPONSE_STATUS_LABELS = {
  pending: "Ждёт подтверждения",
  accepted: "Едет",
  rejected: "Отклонён",
  cancelled: "Отменён",
};

const ENTRY_DRAFT_KEY = "fishingapp.entryDraft.v1";
const SUPPORT_EMAIL = "rassokha.lesha@yandex.ru";

function getFeedEntryPath(entryId) {
  const params = new URLSearchParams({ entryId });

  let feedRoute = "/feed";

  try {
    const savedRoute = localStorage.getItem("fishingAppFeedRoute");
    if (savedRoute && savedRoute.startsWith("/")) {
      feedRoute = savedRoute;
    }
  } catch {
    // localStorage может быть недоступен, тогда используем fallback
  }

  return `${feedRoute}?${params.toString()}`;
}


function isEntryFormEmpty(form) {
  return !form.title?.trim()
    && !form.locationName?.trim()
    && !form.description?.trim()
    && !form.catchType?.trim()
    && !form.catchWeight?.toString().trim()
    && !form.bait?.trim()
    && !form.startTime?.trim()
    && !form.endTime?.trim()
    && !form.endDate?.trim()
    && !form.latitude?.toString().trim()
    && !form.longitude?.toString().trim()
    && !form.photoUrl?.trim()
    && (!Array.isArray(form.media) || form.media.length === 0)
    && !form.isPublishedToFeed;
}

function readEntryDraft() {
  try {
    const raw = localStorage.getItem(ENTRY_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEntryDraft(form) {
  try {
    localStorage.setItem(ENTRY_DRAFT_KEY, JSON.stringify({ ...form, savedAt: new Date().toISOString() }));
  } catch {
    // Черновик не должен ломать создание записи.
  }
}

function clearEntryDraft() {
  try {
    localStorage.removeItem(ENTRY_DRAFT_KEY);
  } catch {
    // ignore
  }
}


function formatDate(value) {
  if (!value) return "Дата не указана";

  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() || "U";
}

function getDisplayName(user) {
  if (!user) return "Пользователь";

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  return user.displayName || fullName || user.userName || "Пользователь";
}

function getBlockReasonText(profile) {
  return profile?.blockReasonText || profile?.BlockReasonText || "Нарушение правил сервиса";
}

function toLocalDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isSameDay(first, second) {
  if (!first || !second) return false;
  const a = new Date(first);
  const b = new Date(second);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatShortDate(dateValue) {
  const date = new Date(dateValue);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function formatShortTime(dateValue) {
  const date = new Date(dateValue);
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFishingRange(startValue, endValue) {
  if (!startValue && !endValue) return "Время не указано";
  if (startValue && !endValue) {
    return `${formatShortDate(startValue)}, ${formatShortTime(startValue)}`;
  }
  if (!startValue && endValue) {
    return `${formatShortDate(endValue)}, до ${formatShortTime(endValue)}`;
  }

  if (isSameDay(startValue, endValue)) {
    return `${formatShortDate(startValue)}, ${formatShortTime(startValue)}–${formatShortTime(endValue)}`;
  }

  return `${formatShortDate(startValue)} ${formatShortTime(startValue)} — ${formatShortDate(endValue)} ${formatShortTime(endValue)}`;
}

function toApiLocalDateTime(datePart, timePart) {
  if (!datePart) return null;
  const safeTime = timePart || "00:00";
  return `${datePart}T${safeTime}`;
}

function toWeatherDateParam(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Avatar({ userName, avatarUrl, size = "large", onClick }) {
  const safeAvatarUrl = getSafeImageUrl(avatarUrl);

  if (safeAvatarUrl) {
    return (
      <img
        src={safeAvatarUrl}
        alt={userName || "Аватар"}
        className={`profile-avatar profile-avatar-${size}`}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      className={`profile-avatar profile-avatar-${size} profile-avatar-placeholder`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {getInitials(userName)}
    </div>
  );
}

function EmptyState({ title, text, action }) {
  return (
    <div className="profile-empty-state">
      <div className="profile-empty-icon">🎣</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function normalizeId(value) {
  return value == null ? "" : String(value).toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function getCompanionStatusLabel(status) {
  return COMPANION_STATUS_LABELS[normalizeStatus(status)] || status || "—";
}

function getCompanionResponseStatusLabel(status) {
  return COMPANION_RESPONSE_STATUS_LABELS[normalizeStatus(status)] || status || "—";
}

function formatCompanionDateTime(value) {
  if (!value) return "Дата не указана";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toApiUtcDateTime(datePart, timePart) {
  if (!datePart) return null;

  const safeTime = timePart || "00:00";
  const date = new Date(`${datePart}T${safeTime}`);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isCompanionDateTimeInPast(form) {
  if (!form?.plannedDate) return false;

  const safeTime = form.plannedTime || "00:00";
  const plannedDate = new Date(`${form.plannedDate}T${safeTime}`);

  if (Number.isNaN(plannedDate.getTime())) return false;

  return plannedDate <= new Date();
}

function getCompanionMinTime(form) {
  if (form?.plannedDate !== getTodayDateInput()) return undefined;

  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getCompanionSeatsLeft(request) {
  return Math.max(0, Number(request?.seatsCount || 1) - Number(request?.acceptedCount || 0));
}

function getResponsesByStatus(request, status) {
  const normalized = normalizeStatus(status);
  return (request?.responses || []).filter((response) => normalizeStatus(response.status) === normalized);
}

function isActiveCompanionBookingStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "pending" || normalized === "accepted";
}

function getMyCompanionActionLabel(status) {
  return normalizeStatus(status) === "accepted" ? "Отменить бронь" : "Отменить отклик";
}

function getCompanionFormFromRequest(request) {
  return {
    title: request?.title || "",
    description: request?.description || "",
    region: request?.region || "",
    plannedDate: toLocalDateInput(request?.plannedDate),
    plannedTime: toLocalTimeInput(request?.plannedDate),
    meetingPoint: request?.meetingPoint || "",
    seatsCount: Number(request?.seatsCount || 1),
  };
}

function getCompanionPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    region: form.region.trim() || null,
    plannedDate: toApiUtcDateTime(form.plannedDate, form.plannedTime),
    meetingPoint: form.meetingPoint.trim() || null,
    seatsCount: Math.max(1, Number(form.seatsCount || 1)),
  };
}

function CompanionRequestsModal({
  isOpen,
  onClose,
  requests,
  partnerRequests,
  loading,
  form,
  onFormChange,
  formOpen,
  editingId,
  saving,
  actionLoading,
  openMenuId,
  onSetOpenMenuId,
  onOpenCreate,
  onOpenEdit,
  onCancelForm,
  onSubmit,
  onDelete,
  onCloseRequest,
  onAcceptResponse,
  onRejectResponse,
  onCancelAcceptance,
  onCancelMyResponse,
  onOpenProfile,
}) {
  if (!isOpen) return null;

  const activeRequests = requests.filter((request) => normalizeStatus(request.status) === "open");
  const activePartnerRequests = (partnerRequests || []).filter((request) => (
    normalizeStatus(request.status) === "open" && isActiveCompanionBookingStatus(request.currentUserResponseStatus)
  ));

  return (
    <div className="profile-modal-backdrop profile-modal-backdrop-locked" onMouseDown={onClose}>
      <div className="profile-modal-card profile-companion-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="profile-modal-header">
          <div>
            <p className="profile-kicker">Поиск напарника</p>
            <h2>Управление поисками</h2>
          </div>
          <button className="profile-form-ghost-button" onClick={onClose} type="button">
            Закрыть
          </button>
        </div>

        {!formOpen && (
          <div className="profile-companion-top-actions">
            <button className="profile-form-primary-button" onClick={onOpenCreate} type="button">
              + Поиск напарника
            </button>
          </div>
        )}

        {formOpen && (
          <form className="profile-companion-form" onSubmit={onSubmit}>
            <div className="profile-section-header profile-section-header-wrap">
              <div>
                <p className="profile-kicker">{editingId ? "Редактирование" : "Новый поиск"}</p>
                <h3>{editingId ? "Изменить поиск напарника" : "Поиск напарника"}</h3>
              </div>
            </div>

            <div className="profile-entry-form-grid profile-companion-form-grid">
              <label>
                Заголовок
                <input name="title" value={form.title} onChange={onFormChange} placeholder="Например: Ищу напарника на утреннюю рыбалку" required />
              </label>

              <label>
                Регион
                <input name="region" value={form.region} onChange={onFormChange} placeholder="Новосибирская область" />
              </label>

              <label>
                Количество человек
                <input name="seatsCount" type="number" min="1" max="20" value={form.seatsCount} onChange={onFormChange} required />
              </label>

              <label>
                Дата
                <input name="plannedDate" type="date" min={getTodayDateInput()} value={form.plannedDate} onChange={onFormChange} required />
              </label>

              <label>
                Время
                <input name="plannedTime" type="time" min={getCompanionMinTime(form)} value={form.plannedTime} onChange={onFormChange} required />
              </label>

              <label>
                Место встречи
                <input name="meetingPoint" value={form.meetingPoint} onChange={onFormChange} placeholder="Берег, база, точка сбора" />
              </label>
            </div>

            <label className="profile-full-field">
              Описание
              <textarea name="description" value={form.description} onChange={onFormChange} placeholder="Куда едем, какой формат рыбалки, что взять с собой..." />
            </label>

            {isCompanionDateTimeInPast(form) && (
              <div className="profile-form-inline-error">
                Нельзя выбрать прошедшую дату и время.
              </div>
            )}

            <div className="profile-modal-actions">
              <button className="profile-form-primary-button" type="submit" disabled={saving || isCompanionDateTimeInPast(form)}>
                {saving ? "Сохранение..." : editingId ? "Сохранить" : "Поиск напарника"}
              </button>
              <button className="profile-form-ghost-button" type="button" onClick={onCancelForm}>
                Отмена
              </button>
            </div>
          </form>
        )}

        {!formOpen && (
          loading ? (
            <div className="profile-companion-loading">Загружаем поиски...</div>
          ) : (
            <>
              <section className="profile-companion-section">
                <div className="profile-companion-section-header">
                  <div>
                    <h3>Мои активные поиски</h3>
                    <p>Здесь можно редактировать поиск, закрыть его или подтвердить напарников.</p>
                  </div>
                </div>

                {activeRequests.length === 0 ? (
                  <EmptyState
                    title="Активных поисков нет"
                    text="Нажмите «+ Поиск напарника», чтобы создать новый поиск и собрать компанию на рыбалку."
                    action={<button className="profile-form-primary-button" onClick={onOpenCreate} type="button">+ Поиск напарника</button>}
                  />
                ) : (
                  <div className="profile-companion-list">
                    {activeRequests.map((request) => {
                      const pendingResponses = getResponsesByStatus(request, "pending");
                      const acceptedResponses = getResponsesByStatus(request, "accepted");
                      const seatsLeft = getCompanionSeatsLeft(request);
                      const menuOpen = openMenuId === request.id;

                      return (
                        <article className="profile-companion-card" key={request.id}>
                          <div className="profile-companion-card-header">
                            <div>
                              <div className="profile-companion-badges">
                                <span>{getCompanionStatusLabel(request.status)}</span>
                                <span>{acceptedResponses.length}/{request.seatsCount || 1} едут</span>
                                <span>{seatsLeft} свободно</span>
                                {pendingResponses.length > 0 && <span className="profile-companion-badge-alert">{pendingResponses.length} ждут ответа</span>}
                              </div>
                              <h3>{request.title}</h3>
                              <p>{request.region || "Регион не указан"} · {formatCompanionDateTime(request.plannedDate)}</p>
                            </div>

                            <div className="profile-entry-menu-wrap">
                              <button
                                className="profile-entry-menu-button"
                                type="button"
                                onClick={() => onSetOpenMenuId(menuOpen ? null : request.id)}
                                aria-label="Действия"
                                title="Действия"
                              >
                                ⋯
                              </button>

                              {menuOpen && (
                                <div className="profile-entry-menu">
                                  <button type="button" onClick={() => onOpenEdit(request)}>Редактировать</button>
                                  <button type="button" onClick={() => onCloseRequest(request)}>Закрыть</button>
                                  <button className="danger" type="button" onClick={() => onDelete(request)}>Удалить</button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="profile-companion-meta">
                            <span>📍 {request.meetingPoint || "Место встречи не указано"}</span>
                            <span>👥 Нужно человек: {request.seatsCount || 1}</span>
                          </div>

                          {request.description && <p className="profile-companion-description">{request.description}</p>}

                          {pendingResponses.length > 0 && (
                            <section className="profile-companion-response-section">
                              <h4>Отклики на подтверждение</h4>
                              <div className="profile-companion-response-list">
                                {pendingResponses.map((response) => (
                                  <div className="profile-companion-response" key={response.id}>
                                    <div>
                                      <button
                                        className="profile-companion-user-link"
                                        type="button"
                                        onClick={() => onOpenProfile(response.userId)}
                                      >
                                        @{response.userName || "user"}
                                      </button>
                                      <span>{getCompanionResponseStatusLabel(response.status)} · {formatCompanionDateTime(response.createdAt)}</span>
                                      {response.message && <p>{response.message}</p>}
                                    </div>
                                    <div className="profile-companion-response-actions">
                                      <button
                                        className="profile-form-primary-button"
                                        type="button"
                                        disabled={actionLoading === response.id || seatsLeft <= 0}
                                        onClick={() => onAcceptResponse(request, response)}
                                      >
                                        Беру
                                      </button>
                                      <button
                                        className="profile-form-ghost-button"
                                        type="button"
                                        disabled={actionLoading === response.id}
                                        onClick={() => onRejectResponse(request, response)}
                                      >
                                        Не беру
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {acceptedResponses.length > 0 && (
                            <section className="profile-companion-response-section">
                              <h4>Едут с вами</h4>
                              <div className="profile-companion-response-list">
                                {acceptedResponses.map((response) => (
                                  <div className="profile-companion-response" key={response.id}>
                                    <div>
                                      <button
                                        className="profile-companion-user-link"
                                        type="button"
                                        onClick={() => onOpenProfile(response.userId)}
                                      >
                                        @{response.userName || "user"}
                                      </button>
                                      <span>{getCompanionResponseStatusLabel(response.status)}</span>
                                      {response.message && <p>{response.message}</p>}
                                    </div>
                                    <button
                                      className="profile-form-ghost-button"
                                      type="button"
                                      disabled={actionLoading === response.id}
                                      onClick={() => onCancelAcceptance(request, response)}
                                    >
                                      Отменить бронь
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="profile-companion-section">
                <div className="profile-companion-section-header">
                  <div>
                    <h3>Я напарник</h3>
                    <p>Поиски, на которые вы откликнулись или где вас уже подтвердили.</p>
                  </div>
                </div>

                {activePartnerRequests.length === 0 ? (
                  <div className="profile-companion-mini-empty">
                    Вы пока не откликались на активные поиски напарника.
                  </div>
                ) : (
                  <div className="profile-companion-list">
                    {activePartnerRequests.map((request) => {
                      const acceptedCount = Number(request.acceptedCount || 0);
                      const seatsCount = Number(request.seatsCount || 1);
                      const seatsLeft = getCompanionSeatsLeft(request);
                      const status = normalizeStatus(request.currentUserResponseStatus);
                      const loadingKey = `my-${request.id}`;

                      return (
                        <article className="profile-companion-card profile-companion-card-partner" key={request.id}>
                          <div className="profile-companion-card-header">
                            <div>
                              <div className="profile-companion-badges">
                                <span>{getCompanionResponseStatusLabel(request.currentUserResponseStatus)}</span>
                                <span>{acceptedCount}/{seatsCount} едут</span>
                                <span>{seatsLeft} свободно</span>
                              </div>
                              <h3>{request.title}</h3>
                              <p>{request.region || "Регион не указан"} · {formatCompanionDateTime(request.plannedDate)}</p>
                            </div>
                          </div>

                          <div className="profile-companion-meta">
                            <span>📍 {request.meetingPoint || "Место встречи не указано"}</span>
                            <span>
                              Автор: {" "}
                              <button
                                className="profile-companion-user-link inline"
                                type="button"
                                onClick={() => onOpenProfile(request.userId)}
                              >
                                @{request.userName || "user"}
                              </button>
                            </span>
                          </div>

                          {request.description && <p className="profile-companion-description">{request.description}</p>}

                          <div className="profile-companion-response-actions profile-companion-own-actions">
                            <button
                              className="profile-form-ghost-button"
                              type="button"
                              disabled={actionLoading === loadingKey}
                              onClick={() => onCancelMyResponse(request)}
                            >
                              {getMyCompanionActionLabel(status)}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )
        )}
      </div>
    </div>
  );
}

function NotificationSettingsPanel({ profile, saving, onSave }) {
  const chatToastsEnabled = profile?.chatToastsEnabled !== false;
  const hideMessageText = !!profile?.hideChatMessageTextInNotifications;

  function updateSettings(patch) {
    const nextSettings = {
      chatToastsEnabled,
      hideChatMessageTextInNotifications: hideMessageText,
      ...patch,
    };

    if (!nextSettings.chatToastsEnabled) {
      nextSettings.hideChatMessageTextInNotifications = false;
    }

    onSave(nextSettings);
  }

  return (
    <section className="profile-notification-settings-card">
      <div className="profile-section-header">
        <div>
          <p className="profile-kicker">Уведомления</p>
          <h2 className="section-title">Настройки уведомлений</h2>
        </div>
      </div>

      <div className="profile-notification-settings-list">
        <label className={`profile-notification-toggle ${chatToastsEnabled ? "active" : ""}`}>
          <input
            type="checkbox"
            checked={chatToastsEnabled}
            disabled={saving}
            onChange={(event) => updateSettings({ chatToastsEnabled: event.target.checked })}
          />
          <span className="profile-notification-toggle__switch" />
          <span className="profile-notification-toggle__content">
            <strong>Показывать всплывающие уведомления из чатов</strong>
            <small>Если включено, новые сообщения будут появляться внутри приложения поверх интерфейса.</small>
          </span>
        </label>

        <label className={`profile-notification-toggle profile-notification-toggle--nested ${hideMessageText ? "active" : ""} ${!chatToastsEnabled ? "disabled" : ""}`}>
          <input
            type="checkbox"
            checked={hideMessageText}
            disabled={saving || !chatToastsEnabled}
            onChange={(event) => updateSettings({ hideChatMessageTextInNotifications: event.target.checked })}
          />
          <span className="profile-notification-toggle__switch" />
          <span className="profile-notification-toggle__content">
            <strong>Скрывать текст сообщения</strong>
            <small>В уведомлении будет отображаться только имя отправителя и подпись «Новое сообщение».</small>
          </span>
        </label>
      </div>

      {saving && <p className="profile-notification-settings-saving">Сохраняем настройки...</p>}
    </section>
  );
}

function PasswordChangePanel({ profile, onMessage }) {
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [sendingCode, setSendingCode] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const passwordChecks = {
    length: newPassword.length >= 8,
    upper: /[A-ZА-ЯЁ]/.test(newPassword),
    lower: /[a-zа-яё]/.test(newPassword),
    digit: /\d/.test(newPassword),
    match: newPassword.length > 0 && newPassword === confirmPassword,
  };

  const isPasswordValid =
    passwordChecks.length &&
    passwordChecks.upper &&
    passwordChecks.lower &&
    passwordChecks.digit &&
    passwordChecks.match;

  function normalizeCode(value) {
    return value.replace(/\D/g, "").slice(0, 6);
  }

  function resetCodeAfterPasswordChange() {
    if (codeSent || code) {
      setCodeSent(false);
      setCode("");
    }
  }

  function startCooldown(seconds) {
    setResendCooldown(seconds);

    const intervalId = window.setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }

        return current - 1;
      });
    }, 1000);
  }

  async function handleSendCode() {
    if (!isPasswordValid) {
      onMessage("Проверьте требования к новому паролю.", true);
      return;
    }

    try {
      setSendingCode(true);

      const response = await requestPasswordChangeCode();

      setCodeSent(true);
      startCooldown(60);
      onMessage(response?.message || "Код подтверждения отправлен на email.");
    } catch (err) {
      console.error(err);
      onMessage(`Не удалось отправить код: ${err.message}`, true);
      startCooldown(60);
    } finally {
      setSendingCode(false);
    }
  }


  async function handleSubmit(event) {
    event.preventDefault();

    if (!isPasswordValid) {
      onMessage("Проверьте требования к новому паролю.", true);
      return;
    }

    if (code.length !== 6) {
      onMessage("Введите 6-значный код подтверждения.", true);
      return;
    }

    try {
      setChangingPassword(true);

      const response = await changePasswordWithCode({
        code,
        newPassword,
      });

      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setCodeSent(false);

      onMessage(response?.message || "Пароль успешно изменён.");
    } catch (err) {
      console.error(err);
      onMessage(`Не удалось изменить пароль: ${err.message}`, true);
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <section className="profile-security-card">
      <div className="profile-section-header">
        <div>
          <p className="profile-kicker">Безопасность</p>
          <h2 className="section-title">Смена пароля</h2>
        </div>
      </div>

      <div className="profile-security-note">
        <div>
          <span>Email для подтверждения</span>
          <strong>{profile?.email || "Не указан"}</strong>
        </div>
        <p>
          После ввода нового пароля мы отправим код подтверждения на вашу почту.
        </p>
      </div>

      <form className="profile-security-form" onSubmit={handleSubmit}>
        <div className="profile-form-row">
          <label htmlFor="new-password">Новый пароль</label>

          <div className="profile-password-field">
            <input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                resetCodeAfterPasswordChange();
              }}
              placeholder="Введите новый пароль"
              autoComplete="new-password"
              required
              minLength={8}
            />

            <button
              type="button"
              className="profile-password-toggle"
              onClick={() => setShowNewPassword((value) => !value)}
              aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showNewPassword ? "Скрыть" : "Показать"}
            </button>
          </div>
        </div>

        <div className="profile-form-row">
          <label htmlFor="confirm-new-password">Повторите пароль</label>

          <div className="profile-password-field">
            <input
              id="confirm-new-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                resetCodeAfterPasswordChange();
              }}
              placeholder="Повторите новый пароль"
              autoComplete="new-password"
              required
              minLength={8}
            />

            <button
              type="button"
              className="profile-password-toggle"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showConfirmPassword ? "Скрыть" : "Показать"}
            </button>
          </div>
        </div>

        <div className="password-check-card">
          <div className="password-check-header">Требования к паролю</div>

          <PasswordRule checked={passwordChecks.length}>
            Минимум 8 символов
          </PasswordRule>

          <PasswordRule checked={passwordChecks.upper}>
            Заглавная буква
          </PasswordRule>

          <PasswordRule checked={passwordChecks.lower}>
            Строчная буква
          </PasswordRule>

          <PasswordRule checked={passwordChecks.digit}>
            Цифра
          </PasswordRule>

          <PasswordRule checked={passwordChecks.match}>
            Пароли совпадают
          </PasswordRule>
        </div>

        <div className="profile-security-actions">
          <button
            className="button-secondary"
            type="button"
            onClick={handleSendCode}
            disabled={!isPasswordValid || sendingCode || resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `Повторно через ${resendCooldown} сек.`
              : sendingCode
                ? "Отправляем..."
                : codeSent
                  ? "Отправить код повторно"
                  : "Получить код"}
          </button>

          {codeSent && (
            <span className="profile-security-status">
              Код отправлен
            </span>
          )}
        </div>

        {codeSent && (
          <div className="profile-form-row">
            <label htmlFor="password-change-code">Код подтверждения</label>
            <input
              id="password-change-code"
              className="profile-code-input"
              value={code}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>
        )}

        <div className="profile-security-submit">
          <button
            type="submit"
            disabled={!codeSent || !isPasswordValid || code.length !== 6 || changingPassword}
          >
            {changingPassword ? "Сохраняем..." : "Сохранить новый пароль"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordRule({ checked, children }) {
  return (
    <div className={`password-rule ${checked ? "is-valid" : ""}`}>
      <span className="password-rule-icon">{checked ? "✓" : ""}</span>
      <span>{children}</span>
    </div>
  );
}


function AvatarPreviewModal({ isOpen, imageUrl, onClose }) {
  const safeImageUrl = getSafeImageUrl(imageUrl);

  if (!isOpen || !safeImageUrl) return null;

  return (
    <div className="profile-modal-backdrop profile-avatar-backdrop" onClick={onClose}>
      <button className="profile-modal-close" onClick={onClose} type="button">
        ×
      </button>
      <img
        src={safeImageUrl}
        alt="Аватар"
        className="profile-avatar-preview"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function FriendsModal({ isOpen, onClose, friends, requests, onAccept, onDecline, onFriendRequestSent, onMessage }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(24);
  const [userNameSearch, setUserNameSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const filteredFriends = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return friends;

    return friends.filter((person) => {
      const text = `${getDisplayName(person)} ${person.userName || ""} ${person.region || ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [friends, query]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return requests;

    return requests.filter((person) => {
      const text = `${getDisplayName(person)} ${person.userName || ""} ${person.region || ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [requests, query]);

  const visibleFriends = filteredFriends.slice(0, visibleCount);
  const hasMoreFriends = visibleCount < filteredFriends.length;
  const hasAnyResults = filteredFriends.length > 0 || filteredRequests.length > 0;

  useEffect(() => {
    setVisibleCount(24);
  }, [query]);

  async function handleOpenPersonalChat(userId) {
    try {
      const result = await createOrGetPersonalChat(userId);

      if (!result?.chatId) {
        alert("Сервер не вернул chatId");
        return;
      }

      navigate(`/chats?chatId=${result.chatId}`);
      onClose();
    } catch (err) {
      console.error("open personal chat error:", err);
      alert(`Не удалось открыть личный чат: ${err.message}`);
    }
  }

  async function handleSearchUsers(event) {
    event.preventDefault();

    const normalizedUserName = userNameSearch.trim().replace(/^@/, "");

    if (normalizedUserName.length < 2) {
      onMessage?.("Введите имя пользователя для поиска.", true);
      return;
    }

    try {
      setSearchingUsers(true);
      const result = await searchUsersByUserName(normalizedUserName);
      setSearchResults(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error(err);
      onMessage?.(`Не удалось выполнить поиск: ${err.message}`, true);
    } finally {
      setSearchingUsers(false);
    }
  }

  async function handleSendFriendRequest(userId) {
    try {
      await sendFriendRequest(userId);
      onMessage?.("Заявка в друзья отправлена.");
      setSearchResults((current) =>
        current.map((user) => {
          const currentUserId = user.id || user.userId;
          return currentUserId === userId
            ? { ...user, friendStatus: "OutgoingRequest" }
            : user;
        })
      );
      await onFriendRequestSent?.();
    } catch (err) {
      console.error(err);
      onMessage?.(`Не удалось отправить заявку: ${err.message}`, true);
    }
  }

  function renderFriendStatus(user) {
    const status = user.friendStatus || user.status;

    if (status === "Friends") return "Уже в друзьях";
    if (status === "OutgoingRequest") return "Заявка отправлена";
    if (status === "IncomingRequest") return "Есть входящая заявка";
    if (status === "Self") return "Это вы";

    return null;
  }

  if (!isOpen) return null;

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div className="profile-modal-card profile-friends-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <div>
            <p className="profile-kicker">Социальный раздел</p>
            <h2>Друзья</h2>
          </div>
          <button className="button-secondary" onClick={onClose} type="button">
            Закрыть
          </button>
        </div>

        <section className="profile-friend-search-card">
          <div>
            <p className="profile-kicker">Поиск пользователей</p>
            <h3>Найти по имени пользователя</h3>
            <p className="muted-text">Введите имя пользователя без пробелов. Например: @fisher54 или fisher54.</p>
          </div>

          <form className="profile-friend-search-form" onSubmit={handleSearchUsers}>
            <input
              value={userNameSearch}
              onChange={(event) => setUserNameSearch(event.target.value)}
              placeholder="Введите имя пользователя"
              className="profile-search-input"
              autoComplete="off"
            />
            <button type="submit" disabled={searchingUsers}>
              {searchingUsers ? "Ищем..." : "Найти"}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="profile-people-grid profile-people-grid-compact">
              {searchResults.map((user) => {
                const userId = user.id || user.userId;
                const statusLabel = renderFriendStatus(user);

                return (
                  <article key={userId} className="profile-person-card">
                    <div className="profile-person-main">
                      <Avatar userName={getDisplayName(user)} avatarUrl={user.avatarUrl} size="small" />
                      <div>
                        <strong>{getDisplayName(user)}</strong>
                        <p>@{user.userName}</p>
                        <p>{user.region || "Регион не указан"}</p>
                      </div>
                    </div>

                    <div className="profile-person-actions">
                      <button
                        className="button-secondary"
                        onClick={() => navigate(`/users/${userId}`)}
                        type="button"
                      >
                        Профиль
                      </button>
                      {statusLabel ? (
                        <span className="profile-friend-status">{statusLabel}</span>
                      ) : (
                        <button onClick={() => handleSendFriendRequest(userId)} type="button">
                          Добавить в друзья
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="profile-modal-toolbar profile-modal-toolbar-single">
          <div className="profile-friends-summary">
            <strong>{friends.length}</strong>
            <span>друзей</span>
            {requests.length > 0 && <span>{requests.length} заявок</span>}
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Фильтр по друзьям и заявкам"
            className="profile-search-input"
          />
        </div>

        {!hasAnyResults ? (
          <EmptyState
            title={query ? "Ничего не найдено" : "Пока нет друзей"}
            text={query ? "Попробуйте изменить поисковый запрос." : "Когда появятся друзья или заявки, они будут здесь."}
          />
        ) : (
          <div className="profile-friends-sections">
            {filteredRequests.length > 0 && (
              <section className="profile-friends-section">
                <div className="profile-section-header profile-section-header-compact">
                  <div>
                    <p className="profile-kicker">Новые заявки</p>
                    <h3>Ожидают ответа · {filteredRequests.length}</h3>
                  </div>
                </div>

                <div className="profile-people-grid profile-people-grid-compact">
                  {filteredRequests.map((person) => (
                    <article key={person.friendshipId} className="profile-person-card">
                      <div className="profile-person-main">
                        <Avatar userName={getDisplayName(person)} avatarUrl={person.avatarUrl} size="small" />
                        <div>
                          <strong>{getDisplayName(person)}</strong>
                          <p>@{person.userName}</p>
                          <p>{person.region || "Регион не указан"}</p>
                        </div>
                      </div>

                      <div className="profile-person-actions">
                        <button onClick={() => onAccept(person.friendshipId)} type="button">
                          Принять
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => onDecline(person.friendshipId)}
                          type="button"
                        >
                          Отклонить
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => navigate(`/users/${person.userId}`)}
                          type="button"
                        >
                          Профиль
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {filteredFriends.length > 0 && (
              <section className="profile-friends-section">
                <div className="profile-section-header profile-section-header-compact">
                  <div>
                    <p className="profile-kicker">Список друзей</p>
                    <h3>Друзья · {filteredFriends.length}</h3>
                  </div>
                </div>

                <div className="profile-people-grid profile-people-grid-compact">
                  {visibleFriends.map((person) => (
                    <article key={person.userId} className="profile-person-card">
                      <div className="profile-person-main">
                        <Avatar userName={getDisplayName(person)} avatarUrl={person.avatarUrl} size="small" />
                        <div>
                          <strong>{getDisplayName(person)}</strong>
                          <p>@{person.userName}</p>
                          <p>{person.region || "Регион не указан"}</p>
                        </div>
                      </div>

                      <div className="profile-person-actions">
                        <button onClick={() => navigate(`/users/${person.userId}`)} type="button">
                          Профиль
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => handleOpenPersonalChat(person.userId)}
                          type="button"
                        >
                          Чат
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                {hasMoreFriends && (
                  <div className="profile-load-more">
                    <button
                      className="button-secondary"
                      onClick={() => setVisibleCount((count) => count + 24)}
                      type="button"
                    >
                      Показать ещё {Math.min(24, filteredFriends.length - visibleCount)}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function normalizeEntryMedia(entry) {
  const media = Array.isArray(entry?.media) ? entry.media : [];
  const normalized = media
    .filter((item) => item?.url)
    .map((item, index) => ({
      id: item.id || `${item.url}-${index}`,
      url: item.url,
      mediaType: item.mediaType || item.type || (String(item.url).match(/\.(mp4|webm|mov)(\?|$)/i) ? "video" : "image"),
      sortOrder: item.sortOrder ?? index,
    }))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

  if (normalized.length === 0 && entry?.photoUrl) {
    normalized.push({
      id: `photo-${entry.photoUrl}`,
      url: entry.photoUrl,
      mediaType: "image",
      sortOrder: 0,
    });
  }

  return normalized;
}

function EntryMediaGallery({ entry, details = false, alt = "Медиа записи", onOpenFullscreen }) {
  const media = normalizeEntryMedia(entry);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartRef = useRef(null);
  const didSwipeRef = useRef(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [entry?.id, media.length]);

  if (media.length === 0) {
    return (
      <div className={details ? "profile-entry-details-image profile-entry-image-empty" : "profile-entry-image profile-entry-image-empty"}>
        <span>🎣</span>
      </div>
    );
  }

  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const safeActiveUrl = getSafeAppFileUrl(active?.url);
  if (!safeActiveUrl) return null;

  const isVideo = active.mediaType === "video";

  function goPrevious(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  }

  function goNext(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setActiveIndex((current) => (current + 1) % media.length);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;

    didSwipeRef.current = false;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches?.[0];
    const start = touchStartRef.current;

    touchStartRef.current = null;

    if (!touch || !start || media.length <= 1) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;

    didSwipeRef.current = true;

    if (dx < 0) {
      goNext(event);
    } else {
      goPrevious(event);
    }
  }

  function handleGalleryClick(event) {
    if (didSwipeRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didSwipeRef.current = false;
      return;
    }

    if (details) {
      openFullscreen(event);
    }
  }

  function openFullscreen(event) {
    event?.stopPropagation();
    onOpenFullscreen?.(media, Math.min(activeIndex, media.length - 1));
  }

  return (
    <div
      className={`profile-entry-media-frame profile-gallery-touchable ${details ? "profile-entry-details-image" : ""}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleGalleryClick}
      role={details ? "button" : undefined}
      tabIndex={details ? 0 : undefined}
      title={details ? "Открыть медиа на весь экран" : undefined}
    >
      {isVideo ? (
        <video
          className={details ? "profile-entry-details-media" : "profile-entry-video"}
          src={safeActiveUrl}
          controls={details}
          muted={!details}
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={safeActiveUrl}
          alt={alt}
          className={details ? "profile-entry-details-media" : "profile-entry-image"}
          loading="lazy"
          decoding="async"
        />
      )}

      {media.length > 1 && (
        <>
          <button className="profile-entry-media-nav prev" type="button" onClick={goPrevious} aria-label="Предыдущее медиа">‹</button>
          <button className="profile-entry-media-nav next" type="button" onClick={goNext} aria-label="Следующее медиа">›</button>
          <span className="profile-entry-media-counter">{activeIndex + 1} / {media.length}</span>
          <div className="profile-entry-media-dots" aria-hidden="true">
            {media.map((item, index) => (
              <span key={item.id || item.url} className={`profile-entry-media-dot ${index === activeIndex ? "active" : ""}`} />
            ))}
          </div>
        </>
      )}

      {isVideo && <span className="profile-entry-video-badge">▶ Видео</span>}
    </div>
  );
}


function ProfileFullscreenMediaViewer({ viewer, onClose }) {
  const [activeIndex, setActiveIndex] = useState(viewer?.initialIndex || 0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    setActiveIndex(viewer?.initialIndex || 0);
  }, [viewer?.initialIndex, viewer?.media]);

  useEffect(() => {
    if (!viewer) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => Math.max(0, current - 1));
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) => Math.min((viewer.media?.length || 1) - 1, current + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, viewer]);

  if (!viewer?.media?.length) return null;

  const media = viewer.media;
  const active = media[Math.min(activeIndex, media.length - 1)] || media[0];
  const safeUrl = getSafeAppFileUrl(active?.url);
  const isVideo = active?.mediaType === "video";

  function goPrevious(event) {
    event?.stopPropagation();
    setActiveIndex((current) => (current - 1 + media.length) % media.length);
  }

  function goNext(event) {
    event?.stopPropagation();
    setActiveIndex((current) => (current + 1) % media.length);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches?.[0];
    const start = touchStartRef.current;

    touchStartRef.current = null;

    if (!touch || !start || media.length <= 1) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) {
      goNext(event);
    } else {
      goPrevious(event);
    }
  }

  return (
    <div className="profile-fullscreen-backdrop" onClick={onClose}>
      <div className="profile-fullscreen-viewer" onClick={(event) => event.stopPropagation()}>
        <div className="profile-fullscreen-topbar">
          <div>
            <strong>Медиа</strong>
            {media.length > 1 && <span>{activeIndex + 1} / {media.length}</span>}
          </div>

          <button type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div
          className="profile-fullscreen-media-wrap"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isVideo ? (
            safeUrl && <video className="profile-fullscreen-media" src={safeUrl} controls playsInline preload="metadata" />
          ) : (
            safeUrl && <img className="profile-fullscreen-media" src={safeUrl} alt="Медиа записи" />
          )}

          {media.length > 1 && (
            <>
              <button type="button" className="profile-fullscreen-nav prev" onClick={goPrevious} aria-label="Предыдущее медиа">
                ‹
              </button>
              <button type="button" className="profile-fullscreen-nav next" onClick={goNext} aria-label="Следующее медиа">
                ›
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function EntryCard({
  entry,
  onEdit,
  onDelete,
  onTogglePrivacy,
  onToggleFeed,
  onOpenWeather,
  onOpenMap,
  onOpenDetails,
  onOpenFeed,
  onShare,
  canManage = true,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const fishingStart = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
  const fishingEnd = entry.fishingEndedAt || entry.endTime;
  const visibilityLabel = entry.visibility === 0 ? "Приватная" : "Публичная";
  const feedLabel = entry.isPublishedToFeed ? "В ленте" : "Только в профиле";
  const hasWeatherPage = entry.latitude != null && entry.longitude != null;
  const hasMapPoint = entry.latitude != null && entry.longitude != null;

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [menuOpen]);

  function stopAndRun(event, callback) {
    event.stopPropagation();
    callback?.(entry);
  }

  return (
    <article
      className="profile-entry-card profile-entry-card-clickable"
      onClick={() => onOpenDetails?.(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails?.(entry);
        }
      }}
    >
      <div className="profile-entry-media">
        <EntryMediaGallery entry={entry} alt={entry.title || "Запись о рыбалке"} />

        <div className="profile-entry-overlay-top">
          <span className="profile-entry-overlay-badge">{visibilityLabel}</span>
          {entry.visibility === 1 && (
            <span className="profile-entry-overlay-badge profile-entry-overlay-badge-secondary">
              {feedLabel}
            </span>
          )}
        </div>

        {canManage && (
          <div className="profile-entry-menu-wrap" ref={menuRef} onClick={(event) => event.stopPropagation()}>
            <button
              className="profile-entry-menu-button"
              onClick={() => setMenuOpen((value) => !value)}
              type="button"
              aria-label="Действия с записью"
            >
              ⋮
            </button>

            {menuOpen && (
              <div className="profile-entry-menu">
                <button onClick={(event) => stopAndRun(event, onEdit)} type="button">
                  Редактировать
                </button>
                <button onClick={(event) => stopAndRun(event, onTogglePrivacy)} type="button">
                  {entry.visibility === 0 ? "Сделать публичной" : "Сделать приватной"}
                </button>
                {entry.visibility !== 0 && (
                  <button onClick={(event) => stopAndRun(event, onToggleFeed)} type="button">
                    {entry.isPublishedToFeed ? "Убрать из ленты" : "Показать в ленте"}
                  </button>
                )}
                {entry.visibility === 0 && (
                  <button onClick={(event) => stopAndRun(event, onToggleFeed)} type="button">
                    Сделать публичной и показать в ленте
                  </button>
                )}
                {entry.isPublishedToFeed && (
                  <button onClick={(event) => stopAndRun(event, onOpenFeed)} type="button">
                    Посмотреть в ленте
                  </button>
                )}
                <button onClick={(event) => stopAndRun(event, onShare)} type="button">
                  Поделиться в чат
                </button>
                <button onClick={(event) => stopAndRun(event, onDelete)} type="button" className="danger">
                  Удалить
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="profile-entry-body">
        <div className="profile-entry-topline">
          <span>{formatFishingRange(fishingStart, fishingEnd)}</span>
        </div>

        <h3>{entry.title || "Запись о рыбалке"}</h3>
        <div className="profile-entry-location-row">
          <p className="profile-entry-location">{entry.locationName || "Место не указано"}</p>
          {hasMapPoint && (
            <button
              className="profile-entry-map-link"
              onClick={(event) => stopAndRun(event, onOpenMap)}
              type="button"
            >
              Посмотреть на карте
            </button>
          )}
        </div>

        {entry.weatherSummary && (
          <button
            className="profile-entry-weather-line profile-entry-weather-button"
            onClick={(event) => stopAndRun(event, onOpenWeather)}
            type="button"
            disabled={!hasWeatherPage}
            title={hasWeatherPage ? "Открыть погоду на дату рыбалки" : "Для прогноза нужны координаты"}
          >
            <span className="profile-entry-weather-icon">☁</span>
            <span>{entry.weatherSummary}</span>
          </button>
        )}

        {entry.description && (
          <p className="profile-entry-description">{entry.description}</p>
        )}

        <div className="profile-entry-meta">
          {entry.catchType && <span>Рыба: {entry.catchType}</span>}
          {entry.catchWeight != null && entry.catchWeight !== "" && <span>Вес: {entry.catchWeight}</span>}
          {entry.bait && <span>Наживка: {entry.bait}</span>}
        </div>
      </div>
    </article>
  );
}

function EntryDetailsModal({ entry, isOpen, onClose, onOpenWeather, onOpenMap, onOpenFeed }) {
  const [fullscreenViewer, setFullscreenViewer] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setFullscreenViewer(null);
    }
  }, [isOpen]);

  if (!isOpen || !entry) return null;

  const fishingStart = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
  const fishingEnd = entry.fishingEndedAt || entry.endTime;
  const hasWeatherPage = entry.latitude != null && entry.longitude != null;
  const hasMapPoint = entry.latitude != null && entry.longitude != null;

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <article className="profile-modal-card profile-entry-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="profile-modal-header">
          <div>
            <p className="profile-kicker">Полная запись</p>
            <h2>{entry.title || "Запись о рыбалке"}</h2>
          </div>
          <button className="profile-form-ghost-button" onClick={onClose} type="button">
            Закрыть
          </button>
        </div>

        <EntryMediaGallery
          entry={entry}
          details
          alt={entry.title || "Запись о рыбалке"}
          onOpenFullscreen={(media, initialIndex) =>
            setFullscreenViewer({
              media,
              initialIndex,
              title: entry.title || "Запись о рыбалке",
            })
          }
        />

        <div className="profile-entry-details-content">
          <div className="profile-entry-details-main">
            <span>{formatFishingRange(fishingStart, fishingEnd)}</span>
            <strong>{entry.locationName || "Место не указано"}</strong>
          </div>

          {entry.weatherSummary && (
            <button
              className="profile-entry-weather-line profile-entry-weather-button"
              onClick={() => onOpenWeather(entry)}
              type="button"
              disabled={!hasWeatherPage}
            >
              <span className="profile-entry-weather-icon">☁</span>
              <span>{entry.weatherSummary}</span>
            </button>
          )}

          {entry.description ? (
            <p className="profile-entry-details-description">{entry.description}</p>
          ) : (
            <p className="muted-text">Описание не заполнено.</p>
          )}

          <div className="profile-entry-meta profile-entry-details-meta">
            {entry.catchType && <span>Рыба: {entry.catchType}</span>}
            {entry.catchWeight != null && entry.catchWeight !== "" && <span>Вес: {entry.catchWeight}</span>}
            {entry.bait && <span>Наживка: {entry.bait}</span>}
            <span>{entry.visibility === 0 ? "Приватная" : "Публичная"}</span>
            {entry.isPublishedToFeed && <span>Опубликована в ленте</span>}
          </div>

          <div className="profile-entry-details-actions">
            {hasMapPoint && (
              <button className="profile-form-ghost-button" onClick={() => onOpenMap(entry)} type="button">
                Посмотреть на карте
              </button>
            )}
            {hasWeatherPage && (
              <button className="profile-form-ghost-button" onClick={() => onOpenWeather(entry)} type="button">
                Погода в этот день
              </button>
            )}
            {entry.isPublishedToFeed && (
              <button className="profile-form-primary-button" onClick={() => onOpenFeed(entry)} type="button">
                Посмотреть в ленте
              </button>
            )}
          </div>
        </div>
      </article>

      {fullscreenViewer && (
        <MediaLightbox viewer={fullscreenViewer} onClose={() => setFullscreenViewer(null)} />
      )}
    </div>
  );
}

function EntryEditorModal({ isOpen, mode, entry, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(EMPTY_ENTRY_FORM);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const [mapCenter, setMapCenter] = useState([27.5667, 53.9]);
  const [userLocation, setUserLocation] = useState(null);
  const [savedPoints, setSavedPoints] = useState([]);
  const [savedPointQuery, setSavedPointQuery] = useState("");
  const [savedPointsOpen, setSavedPointsOpen] = useState(false);
  const [savedPointsLoading, setSavedPointsLoading] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState([]);
  const [placeResultsOpen, setPlaceResultsOpen] = useState(false);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(JSON.stringify(EMPTY_ENTRY_FORM));
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
  const locationSearchRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setIsMobileKeyboardOpen(false);
      return undefined;
    }

    function updateKeyboardState() {
      const viewport = window.visualViewport;
      if (!viewport) {
        setIsMobileKeyboardOpen(false);
        return;
      }

      const heightDiff = window.innerHeight - viewport.height;
      setIsMobileKeyboardOpen(window.innerWidth <= 760 && heightDiff > 140);
    }

    updateKeyboardState();
    window.visualViewport?.addEventListener("resize", updateKeyboardState);
    window.visualViewport?.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateKeyboardState);
      window.visualViewport?.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setDraftRestored(false);

    if (entry) {
      const startedAt = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
      const endedAt = entry.fishingEndedAt || entry.endTime;
      const multiDay = startedAt && endedAt ? !isSameDay(startedAt, endedAt) : false;
      const nextForm = {
        title: entry.title || "",
        locationName: entry.locationName || "",
        description: entry.description || "",
        catchType: entry.catchType || "",
        catchWeight: entry.catchWeight ?? "",
        bait: entry.bait || "",
        fishingDate: toLocalDateInput(startedAt),
        startTime: toLocalTimeInput(startedAt),
        endTime: toLocalTimeInput(endedAt),
        isMultiDay: multiDay,
        endDate: endedAt ? toLocalDateInput(endedAt) : "",
        latitude: entry.latitude ?? "",
        longitude: entry.longitude ?? "",
        photoUrl: entry.photoUrl || "",
        media: normalizeEntryMedia(entry),
        visibility: entry.visibility ?? 1,
        isPublishedToFeed: Boolean(entry.isPublishedToFeed),
      };

      setForm(nextForm);
      setInitialFormSnapshot(JSON.stringify(nextForm));

      if (entry.latitude != null && entry.longitude != null) {
        setMapCenter([Number(entry.longitude), Number(entry.latitude)]);
      }
    } else {
      const today = toLocalDateInput(new Date());
      const baseForm = {
        ...EMPTY_ENTRY_FORM,
        fishingDate: today,
        endDate: "",
        startTime: "",
        endTime: "",
      };

      const draft = readEntryDraft();
      const draftForm = draft ? Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "savedAt")) : null;
      const shouldRestoreDraft = draftForm && !isEntryFormEmpty(draftForm);
      const nextForm = shouldRestoreDraft ? { ...baseForm, ...draftForm } : baseForm;

      setForm(nextForm);
      setInitialFormSnapshot(JSON.stringify(baseForm));
      setDraftRestored(Boolean(shouldRestoreDraft));

      if (nextForm.latitude !== "" && nextForm.longitude !== "") {
        setMapCenter([Number(nextForm.longitude), Number(nextForm.latitude)]);
      }
    }

    setLocalMessage("");
  }, [entry, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    async function loadSavedPoints() {
      try {
        setSavedPointsLoading(true);
        const points = await getMapPoints();

        if (!cancelled) {
          setSavedPoints(Array.isArray(points) ? points : []);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setSavedPoints([]);
          setLocalMessage(`Не удалось загрузить сохранённые точки: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setSavedPointsLoading(false);
        }
      }
    }

    loadSavedPoints();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!savedPointsOpen && !placeResultsOpen) return undefined;

    function handleOutsideClick(event) {
      if (!locationSearchRef.current?.contains(event.target)) {
        setSavedPointsOpen(false);
        setPlaceResultsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [savedPointsOpen, placeResultsOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const normalizedQuery = placeQuery.trim();

    if (normalizedQuery.length < 2) {
      setPlaceResults([]);
      setPlaceSearchLoading(false);
      return undefined;
    }

    setPlaceResultsOpen(true);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setPlaceSearchLoading(true);
        const results = await searchPlaces(normalizedQuery);

        if (!cancelled) {
          setPlaceResults(Array.isArray(results) ? results.filter(Boolean) : []);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setPlaceResults([]);
          setLocalMessage(`Не удалось выполнить поиск места: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setPlaceSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, placeQuery]);



  const hasUnsavedChanges = mode === "create"
    ? JSON.stringify(form) !== initialFormSnapshot && !isEntryFormEmpty(form)
    : JSON.stringify(form) !== initialFormSnapshot;

  useEffect(() => {
    if (!isOpen || mode !== "create") return;
    if (!hasUnsavedChanges) return;

    const timer = setTimeout(() => {
      saveEntryDraft(form);
    }, 350);

    return () => clearTimeout(timer);
  }, [form, hasUnsavedChanges, isOpen, mode]);

  function requestClose() {
    if (hasUnsavedChanges) {
      const message = mode === "create"
        ? "Закрыть форму? Введённые данные останутся в черновике."
        : "Закрыть редактирование без сохранения изменений?";
      const confirmed = window.confirm(message);
      if (!confirmed) return;

      if (mode === "create") {
        saveEntryDraft(form);
      }
    }

    onClose();
  }

  function handleDiscardDraft() {
    const confirmed = window.confirm("Удалить черновик и очистить форму?");
    if (!confirmed) return;

    clearEntryDraft();
    const today = toLocalDateInput(new Date());
    const baseForm = {
      ...EMPTY_ENTRY_FORM,
      fishingDate: today,
      endDate: "",
      startTime: "",
      endTime: "",
    };
    setForm(baseForm);
    setInitialFormSnapshot(JSON.stringify(baseForm));
    setDraftRestored(false);
  }


  if (!isOpen) return null;

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => {
      const nextValue = type === "checkbox" ? checked : value;
      const next = {
        ...current,
        [name]: nextValue,
      };

      // Если рыбалка однодневная, дата окончания всегда совпадает с датой начала.
      // Так не появляются случайные даты/время и пользователю не нужно следить за лишним полем.
      if (name === "isMultiDay") {
        // При переключении режима не подставляем дату/время окончания автоматически.
        // Пользователь сам укажет окончание, если оно нужно.
        next.endDate = "";
        next.endTime = "";
      }

      return next;
    });
  }


  function setFishingDatePreset(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const nextDate = toLocalDateInput(date);

    setForm((current) => ({
      ...current,
      fishingDate: nextDate,
      endDate: "",
      endTime: "",
    }));
  }

  function clearEndTime() {
    setForm((current) => ({
      ...current,
      endTime: "",
      endDate: "",
    }));
  }

  async function handleMediaUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      setUploadingPhoto(true);
      setLocalMessage("");
      const uploaded = await uploadFishingMediaFiles(files);

      setForm((current) => {
        const currentMedia = Array.isArray(current.media) ? current.media : [];
        const nextMedia = [...currentMedia, ...uploaded].map((item, index) => ({
          ...item,
          sortOrder: index,
        }));
        const firstImage = nextMedia.find((item) => item.mediaType !== "video") || nextMedia[0];

        return {
          ...current,
          media: nextMedia,
          photoUrl: firstImage?.url || "",
        };
      });

      event.target.value = "";
    } catch (err) {
      console.error(err);
      setLocalMessage(`Не удалось загрузить медиа: ${err.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removeMedia(indexToRemove) {
    setForm((current) => {
      const nextMedia = (current.media || [])
        .filter((_, index) => index !== indexToRemove)
        .map((item, index) => ({ ...item, sortOrder: index }));
      const firstImage = nextMedia.find((item) => item.mediaType !== "video") || nextMedia[0];

      return {
        ...current,
        media: nextMedia,
        photoUrl: firstImage?.url || "",
      };
    });
  }

  function handleDetectLocation() {
    if (!navigator.geolocation) {
      setLocalMessage("Геолокация не поддерживается браузером.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));

        setUserLocation({ latitude, longitude });
        setForm((current) => ({
          ...current,
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          locationName: current.locationName || "Моё местоположение",
        }));
        setMapCenter([longitude, latitude]);
        setLocalMessage("Координаты добавлены.");
      },
      () => setLocalMessage("Не удалось определить местоположение."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function handleMapClick(latlng) {
    const latitude = Number(latlng.lat.toFixed(6));
    const longitude = Number(latlng.lng.toFixed(6));

    setForm((current) => ({
      ...current,
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      locationName: current.locationName || "Выбранная точка",
    }));
  }

  const normalizedSavedPointQuery = savedPointQuery.trim().toLowerCase();
  const filteredSavedPoints = savedPoints
    .filter((point) => {
      if (!normalizedSavedPointQuery) return true;

      const searchableText = [
        point.name,
        point.region,
        point.description,
        point.typeName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSavedPointQuery);
    })
    .slice(0, 8);

  function selectEntryLocation({ name, address, region, latitude, longitude }) {
    if (latitude == null || longitude == null) {
      setLocalMessage("У выбранного места нет координат.");
      return;
    }

    const nextLatitude = Number(latitude);
    const nextLongitude = Number(longitude);

    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setLocalMessage("У выбранного места некорректные координаты.");
      return;
    }

    const locationName = name || address || region || "Выбранная точка";

    setForm((current) => ({
      ...current,
      locationName,
      latitude: nextLatitude.toFixed(6),
      longitude: nextLongitude.toFixed(6),
    }));

    setMapCenter([nextLongitude, nextLatitude]);
    setSavedPointsOpen(false);
    setPlaceResultsOpen(false);
    setLocalMessage("Место ловли выбрано.");
  }

  const selectedMapPoint = form.latitude !== "" && form.longitude !== ""
    ? [{
        id: "entry-location-point",
        name: form.locationName || "Место ловли",
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        type: 0,
        region: null,
        description: "Точка из записи о рыбалке",
      }]
    : [];


  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.fishingDate || !form.startTime) {
      setLocalMessage("Укажи дату и время начала рыбалки.");
      return;
    }

    if (form.isMultiDay && form.endTime && !form.endDate) {
      setLocalMessage("Для многодневной рыбалки укажи дату окончания или убери время окончания.");
      return;
    }

    const endDateValue = form.isMultiDay ? form.endDate : form.fishingDate;
    const startDateTime = toApiLocalDateTime(form.fishingDate, form.startTime);
    const endDateTime = form.endTime && endDateValue ? toApiLocalDateTime(endDateValue, form.endTime) : null;

    if (endDateTime && new Date(endDateTime).getTime() < new Date(startDateTime).getTime()) {
      setLocalMessage("Окончание рыбалки не может быть раньше начала.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      locationName: form.locationName.trim(),
      description: form.description.trim(),
      catchType: form.catchType.trim(),
      catchWeight: form.catchWeight === "" ? null : Number(form.catchWeight),
      bait: form.bait.trim(),
      latitude: form.latitude === "" ? null : Number(form.latitude),
      longitude: form.longitude === "" ? null : Number(form.longitude),
      photoUrl: form.photoUrl || null,
      media: (form.media || []).map((item, index) => ({
        url: item.url,
        mediaType: item.mediaType === "video" ? "video" : "image",
        sortOrder: index,
      })),
      visibility: Number(form.visibility),
      isPublishedToFeed: Boolean(form.isPublishedToFeed),
      fishingDate: startDateTime,
      fishingStartedAt: startDateTime,
      fishingEndedAt: endDateTime,
    };

    const saved = await onSubmit(payload);
    if (saved !== false && mode === "create") {
      clearEntryDraft();
      setDraftRestored(false);
    }
  }

  return (
    <div className="profile-modal-backdrop profile-modal-backdrop-locked">
      <form className="profile-modal-card profile-entry-editor" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="profile-modal-header">
          <div>
            <p className="profile-kicker">Журнал рыбалки</p>
            <h2>{mode === "create" ? "Новая запись" : "Редактирование записи"}</h2>
          </div>
          <button className="profile-form-ghost-button" onClick={requestClose} type="button">
            Закрыть
          </button>
        </div>

        {draftRestored && mode === "create" && (
          <div className="profile-draft-banner">
            <div>
              <strong>Восстановлен черновик</strong>
              <p>Данные сохранились после прошлого закрытия формы.</p>
            </div>
            <button className="profile-form-ghost-button" type="button" onClick={handleDiscardDraft}>
              Очистить
            </button>
          </div>
        )}

        <div className="profile-entry-form-grid profile-entry-form-grid-time">
          <label>
            Название
            <input name="title" value={form.title} onChange={handleChange} required />
          </label>

          <label>
            Место
            <input name="locationName" value={form.locationName} onChange={handleChange} />
          </label>

          <label>
            Рыба
            <input name="catchType" value={form.catchType} onChange={handleChange} />
          </label>

          <label>
            Вес
            <input name="catchWeight" type="number" step="0.01" min="0" value={form.catchWeight} onChange={handleChange} />
          </label>

          <label>
            Наживка
            <input name="bait" value={form.bait} onChange={handleChange} />
          </label>


          <label>
            Приватность
            <select name="visibility" value={form.visibility} onChange={handleChange}>
              <option value={1}>Публичная</option>
              <option value={0}>Приватная</option>
            </select>
          </label>
        </div>


        <section className="profile-time-picker">
          <div className="profile-time-picker-header">
            <div>
              <p className="profile-kicker">Время ловли</p>
              <h3>Когда рыбачил?</h3>
              <p>Сначала выбери режим. Для одного дня указывается одна дата и время с–до. Для нескольких дней окончание заполняется вручную.</p>
            </div>
            <div className="profile-time-presets">
              <button type="button" onClick={() => setFishingDatePreset(0)}>Сегодня</button>
              <button type="button" onClick={() => setFishingDatePreset(-1)}>Вчера</button>
            </div>
          </div>

          <div className="profile-time-mode-row">
            <button
              type="button"
              className={!form.isMultiDay ? "active" : ""}
              onClick={() => setForm((current) => ({ ...current, isMultiDay: false, endDate: "", endTime: "" }))}
            >
              Один день
            </button>
            <button
              type="button"
              className={form.isMultiDay ? "active" : ""}
              onClick={() => setForm((current) => ({ ...current, isMultiDay: true, endDate: "", endTime: "" }))}
            >
              Несколько дней
            </button>
          </div>

          <div className="profile-time-range-layout">
            <div className="profile-time-range-card">
              <span>Начало</span>
              <label>
                Дата
                <input name="fishingDate" type="date" value={form.fishingDate} onChange={handleChange} required />
              </label>
              <label>
                Время
                <input name="startTime" type="time" value={form.startTime} onChange={handleChange} required />
              </label>
            </div>

            <div className="profile-time-range-card">
              <div className="profile-time-range-card-title">
                <span>Окончание</span>
                <button type="button" onClick={clearEndTime}>Не указывать</button>
              </div>

              {form.isMultiDay && (
                <label>
                  Дата
                  <input name="endDate" type="date" value={form.endDate} onChange={handleChange} />
                </label>
              )}

              <label>
                Время
                <input name="endTime" type="time" value={form.endTime} onChange={handleChange} />
              </label>

              {!form.isMultiDay && (
                <small>Дата окончания будет такой же, как дата начала.</small>
              )}
            </div>
          </div>
        </section>

        <label className="profile-full-field">
          Описание
          <textarea name="description" value={form.description} onChange={handleChange} />
        </label>

        <div className="profile-entry-media-picker">
          <label
            className={`profile-entry-media-picker__button${uploadingPhoto ? " is-loading" : ""}`}
            title="Выбрать фото или видео"
          >
            <input
              className="profile-entry-media-picker__input"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleMediaUpload}
              disabled={uploadingPhoto}
            />
            <span className="profile-entry-media-picker__icon" aria-hidden="true">
              {uploadingPhoto ? "…" : "+"}
            </span>
            <span className="profile-entry-media-picker__text">
              {uploadingPhoto ? "Загрузка медиа" : "Добавить фото или видео"}
            </span>
          </label>

          <p className="profile-entry-media-picker__note">
            {Array.isArray(form.media) && form.media.length > 0
              ? `Добавлено: ${form.media.length}. Первое фото будет обложкой записи.`
              : "Первое фото будет обложкой записи."}
          </p>
        </div>

        {uploadingPhoto && <p className="muted-text">Загружаем медиа...</p>}
        {localMessage && <p className={localMessage.includes("Не удалось") || localMessage.includes("не поддерживается") || localMessage.includes("не может быть") || localMessage.includes("Укажи") || localMessage.includes("Для многодневной") || localMessage.includes("Окончание") ? "error-text" : "success-text"}>{localMessage}</p>}
        {Array.isArray(form.media) && form.media.length > 0 && (
          <div className="profile-media-upload-list">
            {form.media.map((item, index) => (
              <div className="profile-media-upload-item" key={`${item.url}-${index}`}>
                {item.mediaType === "video" ? (
                  <video src={item.url} muted playsInline preload="metadata" />
                ) : (
                  <img src={item.url} alt={`Медиа ${index + 1}`} />
                )}
                <span className="profile-media-upload-type">{item.mediaType === "video" ? "Видео" : "Фото"}</span>
                <button
                  className="profile-media-upload-remove"
                  type="button"
                  onClick={() => removeMedia(index)}
                  aria-label="Удалить медиа"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <section className="profile-location-picker">
          <div className="profile-location-picker-header">
            <div>
              <p className="profile-kicker">Место ловли</p>
              <h3>Выбор точки на карте</h3>
            </div>
          </div>

          <div className="profile-saved-points-search" ref={locationSearchRef}>
            <div>
              <strong>Поиск места</strong>
              <p>Выбери сохранённую точку или найди новое место через поиск по карте.</p>
            </div>

            <div className="profile-location-search-grid">
              <div className="profile-location-search-field profile-location-search-field-dropdown">
                <span>Сохранённые точки</span>
                <input
                  value={savedPointQuery}
                  onChange={(event) => {
                    setSavedPointQuery(event.target.value);
                    setSavedPointsOpen(true);
                    setPlaceResultsOpen(false);
                  }}
                  onFocus={() => {
                    setSavedPointsOpen(true);
                    setPlaceResultsOpen(false);
                  }}
                  placeholder={savedPointsLoading ? "Загружаем точки..." : "Название, регион или описание точки"}
                  autoComplete="off"
                />

                {savedPointsOpen && (
                  <div className="profile-location-search-dropdown profile-location-search-dropdown-single">
                    <div className="profile-location-search-title">
                      Сохранённые точки
                    </div>

                    {savedPointsLoading ? (
                      <div className="profile-location-search-empty">Загружаем...</div>
                    ) : filteredSavedPoints.length === 0 ? (
                      <div className="profile-location-search-empty">
                        {savedPointQuery.trim() ? "Точки не найдены" : "Сохранённых точек пока нет"}
                      </div>
                    ) : (
                      filteredSavedPoints.map((point) => (
                        <button
                          key={point.id}
                          className="profile-location-search-option"
                          type="button"
                          onClick={() => selectEntryLocation(point)}
                        >
                          <strong>{point.name || "Точка без названия"}</strong>
                          <span>{point.region || point.description || "Сохранённая точка"}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="profile-location-search-field profile-location-search-field-dropdown">
                <span>Поиск места</span>
                <input
                  value={placeQuery}
                  onChange={(event) => {
                    setPlaceQuery(event.target.value);
                    setPlaceResultsOpen(true);
                    setSavedPointsOpen(false);
                  }}
                  onFocus={() => {
                    setPlaceResultsOpen(true);
                    setSavedPointsOpen(false);
                  }}
                  placeholder="Например: озеро, река, деревня"
                  autoComplete="off"
                />

                {placeResultsOpen && (
                  <div className="profile-location-search-dropdown profile-location-search-dropdown-single">
                    <div className="profile-location-search-title">
                      Найденные места
                    </div>

                    {placeSearchLoading ? (
                      <div className="profile-location-search-empty">Ищем...</div>
                    ) : placeQuery.trim().length < 2 ? (
                      <div className="profile-location-search-empty">Введите минимум 2 символа</div>
                    ) : placeResults.length === 0 ? (
                      <div className="profile-location-search-empty">Места не найдены</div>
                    ) : (
                      placeResults.map((place, index) => (
                        <button
                          key={`${place.latitude}-${place.longitude}-${index}`}
                          className="profile-location-search-option"
                          type="button"
                          onClick={() => selectEntryLocation(place)}
                        >
                          <strong>{place.name || "Место на карте"}</strong>
                          <span>{place.address || place.description || place.region || "Найдено через геокодер"}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="profile-location-map-wrapper">
            <YandexMap
              points={selectedMapPoint}
              userLocation={userLocation}
              onMapClick={handleMapClick}
              onLocationClick={handleDetectLocation}
              center={mapCenter}
              zoom={8}
            />
          </div>

          <div className="profile-location-selected">
            <div>
              <span>Широта</span>
              <strong>{form.latitude || "—"}</strong>
            </div>
            <div>
              <span>Долгота</span>
              <strong>{form.longitude || "—"}</strong>
            </div>
          </div>
        </section>

        <label className={`profile-publish-card ${form.isPublishedToFeed ? "active" : ""} ${Number(form.visibility) !== 1 ? "disabled" : ""}`}>
          <input
            name="isPublishedToFeed"
            type="checkbox"
            checked={form.isPublishedToFeed}
            disabled={Number(form.visibility) !== 1}
            onChange={handleChange}
          />
          <span className="profile-publish-toggle" />
          <span>
            <strong>Показать запись в общей ленте</strong>
            <small>{Number(form.visibility) === 1 ? "Запись увидят другие пользователи в ленте." : "Сначала сделай запись публичной."}</small>
          </span>
        </label>

        <div className="profile-weather-note">
          <strong>Погода:</strong> она подставляется автоматически по координатам и времени рыбалки. Вручную ничего вводить не нужно.
        </div>

        {!isMobileKeyboardOpen && (
          <div className="profile-modal-actions">
            <button className="profile-form-primary-button" type="submit" disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить запись"}
            </button>
            <button className="profile-form-ghost-button" onClick={requestClose} type="button">
              Закрыть и оставить черновик
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout, setUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");
  const [entryFilter, setEntryFilter] = useState("all");
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalMode, setEntryModalMode] = useState("create");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [detailsEntry, setDetailsEntry] = useState(null);
  const [companionModalOpen, setCompanionModalOpen] = useState(false);
  const [companionFormOpen, setCompanionFormOpen] = useState(false);
  const [companionForm, setCompanionForm] = useState(EMPTY_COMPANION_FORM);
  const [companionRequests, setCompanionRequests] = useState([]);
  const [companionPartnerRequests, setCompanionPartnerRequests] = useState([]);
  const [companionsLoading, setCompanionsLoading] = useState(false);
  const [companionSaving, setCompanionSaving] = useState(false);
  const [companionEditingId, setCompanionEditingId] = useState(null);
  const [companionActionLoading, setCompanionActionLoading] = useState(null);
  const [openCompanionMenuId, setOpenCompanionMenuId] = useState(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", userName: "", region: "", about: "", avatarUrl: "" });
  const [message, setMessage] = useState("");
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [blockAppealText, setBlockAppealText] = useState("");
  const [blockAppealSending, setBlockAppealSending] = useState(false);
  const [blockAppealSent, setBlockAppealSent] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [shareModalEntry, setShareModalEntry] = useState(null);
  const [availableChats, setAvailableChats] = useState([]);
  const [loadingShareChats, setLoadingShareChats] = useState(false);
  const [shareChatSearch, setShareChatSearch] = useState("");
  const [shareMessageText, setShareMessageText] = useState("");
  const [selectedShareChatIds, setSelectedShareChatIds] = useState([]);
  const [shareSending, setShareSending] = useState(false);
  const settingsMenuRef = useRef(null);

  const publishedEntries = useMemo(() => entries.filter((entry) => entry.isPublishedToFeed), [entries]);
  const publicProfileEntries = useMemo(() => entries.filter((entry) => entry.visibility !== 0), [entries]);
  const privateEntries = useMemo(() => entries.filter((entry) => entry.visibility === 0), [entries]);

  const visibleEntries = useMemo(() => {
    if (entryFilter === "feed") return publishedEntries;
    if (entryFilter === "profile") return publicProfileEntries;
    if (entryFilter === "private") return privateEntries;
    return entries;
  }, [entries, entryFilter, privateEntries, publicProfileEntries, publishedEntries]);

  useEffect(() => {
    if (profile?.blockAppealSubmitted || profile?.BlockAppealSubmitted) {
      setBlockAppealSent(true);
    }
  }, [profile?.blockAppealSubmitted, profile?.BlockAppealSubmitted]);

  const companionPendingCount = useMemo(() => {
    return companionRequests
      .filter((request) => normalizeStatus(request.status) === "open")
      .reduce((sum, request) => sum + getResponsesByStatus(request, "pending").length, 0);
  }, [companionRequests]);

  function showMessage(text, isError = false) {
    setMessage(text);
    setIsErrorMessage(isError);
  }

  async function handleSubmitBlockAppeal(event) {
    event.preventDefault();

    const text = blockAppealText.trim();
    if (!text) {
      showMessage("Укажите текст обращения.", true);
      return;
    }

    try {
      setBlockAppealSending(true);
      const result = await submitBlockAppeal(text);
      setBlockAppealText("");
      setBlockAppealSent(true);
      showMessage(result?.message || "Обращение отправлено. Ожидайте решения администрации.");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отправить обращение: ${err.message}`, true);
    } finally {
      setBlockAppealSending(false);
    }
  }

  async function loadFriendsData() {
    const [friendsData, requestsData] = await Promise.all([getFriends(), getIncomingFriendRequests()]);
    setFriends(friendsData);
    setRequests(requestsData);
  }

  async function loadEntries() {
    const entriesData = await getFishingEntries();
    setEntries(entriesData);
  }

  const loadCompanionRequests = useCallback(async (silent = false) => {
    const currentUserId = normalizeId(profile?.id || profile?.userId);

    if (!currentUserId) return;

    try {
      if (!silent) setCompanionsLoading(true);

      const data = await getCompanionRequests();
      const allRequests = Array.isArray(data) ? data : [];
      const ownRequests = allRequests.filter((request) => normalizeId(request.userId) === currentUserId);
      const partnerRequests = allRequests.filter((request) => (
        normalizeId(request.userId) !== currentUserId &&
        normalizeStatus(request.status) === "open" &&
        isActiveCompanionBookingStatus(request.currentUserResponseStatus)
      ));

      const detailedRequests = await Promise.all(
        ownRequests.map(async (request) => {
          try {
            return await getCompanionRequestById(request.id);
          } catch {
            return { ...request, responses: request.responses || [] };
          }
        })
      );

      setCompanionRequests(detailedRequests);
      setCompanionPartnerRequests(partnerRequests);
    } catch (err) {
      console.error(err);
      if (!silent) showMessage(`Не удалось загрузить поиски напарника: ${err.message}`, true);
    } finally {
      if (!silent) setCompanionsLoading(false);
    }
  }, [profile?.id, profile?.userId]);

  useEffect(() => {
    async function loadData() {
      try {
        const profileData = await getProfile();

        setProfile(profileData);
        setUser(profileData);
        setForm({
          firstName: profileData.firstName || "",
          lastName: profileData.lastName || "",
          userName: profileData.userName || "",
          region: profileData.region || "",
          about: profileData.about || "",
          avatarUrl: profileData.avatarUrl || "",
        });

        if (profileData.isBlocked) {
          setEntries([]);
          setFriends([]);
          setRequests([]);
          return;
        }

        const entriesData = await getFishingEntries();
        setEntries(entriesData);
        await loadFriendsData();
      } catch (err) {
        console.error(err);
        showMessage(`Не удалось загрузить профиль: ${err.message}`, true);
      }
    }

    loadData();
  }, [setUser]);

  useEffect(() => {
    if (profile?.isBlocked) return undefined;
    if (!profile?.id && !profile?.userId) return undefined;

    loadCompanionRequests(true);

    const intervalId = window.setInterval(() => {
      loadCompanionRequests(true);
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [profile?.id, profile?.userId, profile?.isBlocked, loadCompanionRequests]);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
      setIsErrorMessage(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!settingsMenuOpen) return;

    function handleOutsideClick(event) {
      if (!settingsMenuRef.current?.contains(event.target)) {
        setSettingsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [settingsMenuOpen]);

  function startEdit() {
    if (!profile) return;
    setForm({
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      userName: profile.userName || "",
      region: profile.region || "",
      about: profile.about || "",
      avatarUrl: profile.avatarUrl || "",
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleAvatarUpload(croppedFile) {
    try {
      setUploadingAvatar(true);
      const result = await uploadAvatar(croppedFile);
      const nextAvatarUrl = result.fileUrl || result.url || "";

      if (!nextAvatarUrl) {
        throw new Error("Сервер не вернул адрес загруженного аватара");
      }

      const updated = await updateProfileAvatar(nextAvatarUrl);

      setForm((current) => ({ ...current, avatarUrl: updated.avatarUrl || nextAvatarUrl }));
      setProfile((current) => current ? { ...current, avatarUrl: updated.avatarUrl || nextAvatarUrl } : current);
      setUser((current) => current ? { ...current, avatarUrl: updated.avatarUrl || nextAvatarUrl } : current);
      showMessage("Аватар сохранён");
      return updated.avatarUrl || nextAvatarUrl;
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось загрузить аватар: ${err.message}`, true);
      throw err;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    try {
      setUploadingAvatar(true);
      const updated = await updateProfileAvatar("");

      setForm((current) => ({ ...current, avatarUrl: updated.avatarUrl || "" }));
      setProfile((current) => current ? { ...current, avatarUrl: updated.avatarUrl || "" } : current);
      setUser((current) => current ? { ...current, avatarUrl: updated.avatarUrl || "" } : current);
      showMessage("Аватар удалён");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось удалить аватар: ${err.message}`, true);
    } finally {
      setUploadingAvatar(false);
    }
  }


  async function handleSaveNotificationSettings(settings) {
    try {
      setNotificationSaving(true);
      const updated = await updateNotificationSettings(settings);
      setProfile(updated);
      setUser(updated);
      showMessage("Настройки уведомлений сохранены");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось сохранить настройки уведомлений: ${err.message}`, true);
    } finally {
      setNotificationSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);
      const updated = await updateProfile(form);
      setProfile(updated);
      setUser(updated);
      setIsEditing(false);
      showMessage("Профиль обновлён");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось обновить профиль: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  }

  async function handleAccept(friendshipId) {
    try {
      await acceptFriendRequest(friendshipId);
      await loadFriendsData();
      showMessage("Заявка принята");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось принять заявку: ${err.message}`, true);
    }
  }

  async function handleDecline(friendshipId) {
    try {
      await declineFriendRequest(friendshipId);
      await loadFriendsData();
      showMessage("Заявка отклонена");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отклонить заявку: ${err.message}`, true);
    }
  }

  function openCreateEntryModal() {
    setSelectedEntry(null);
    setEntryModalMode("create");
    setEntryModalOpen(true);
  }

  function openEditEntryModal(entry) {
    setSelectedEntry(entry);
    setEntryModalMode("edit");
    setEntryModalOpen(true);
  }

  async function handleSaveEntry(payload) {
    try {
      setEntrySaving(true);

      if (entryModalMode === "create") {
        await createFishingEntry(payload);
        showMessage("Запись создана");
      } else {
        await updateFishingEntry(selectedEntry.id, payload);
        showMessage("Запись обновлена");
      }

      setEntryModalOpen(false);
      setSelectedEntry(null);
      await loadEntries();
      return true;
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось сохранить запись: ${err.message}`, true);
      return false;
    } finally {
      setEntrySaving(false);
    }
  }

  async function handleDeleteEntry(entry) {
    const confirmed = window.confirm(`Удалить запись "${entry.title || "Без названия"}"?`);
    if (!confirmed) return;

    try {
      await deleteFishingEntry(entry.id);
      await loadEntries();
      showMessage("Запись удалена");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось удалить запись: ${err.message}`, true);
    }
  }

  async function handleTogglePrivacy(entry) {
    try {
      const nextVisibility = entry.visibility === 0 ? 1 : 0;
      await updateFishingEntry(entry.id, {
        ...entry,
        visibility: nextVisibility,
      });
      await loadEntries();
      showMessage(nextVisibility === 0 ? "Запись стала приватной" : "Запись стала публичной");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось изменить приватность: ${err.message}`, true);
    }
  }


  async function handleToggleFeed(entry) {
    try {
      const nextPublished = entry.visibility === 0 ? true : !entry.isPublishedToFeed;
      const nextVisibility = entry.visibility === 0 ? 1 : entry.visibility;

      await updateFishingEntry(entry.id, {
        ...entry,
        visibility: nextVisibility,
        isPublishedToFeed: nextPublished,
      });

      await loadEntries();
      showMessage(nextPublished ? "Запись показана в ленте" : "Запись убрана из ленты");
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось изменить публикацию в ленте: ${err.message}`, true);
    }
  }

  function handleOpenWeather(entry) {
    if (entry.latitude == null || entry.longitude == null) {
      showMessage("Для прогноза у записи должны быть координаты.", true);
      return;
    }

    const dateSource = entry.fishingStartedAt || entry.startTime || entry.fishingDate;
    const date = toWeatherDateParam(dateSource) || toWeatherDateParam(new Date());

    const params = new URLSearchParams({
      date,
      lat: entry.latitude,
      lon: entry.longitude,
      placeName: entry.locationName || "Место рыбалки",
    });

    navigate(`/weather?${params.toString()}`);
  }

  function handleOpenEntryMap(entry) {
    if (entry.latitude == null || entry.longitude == null) {
      showMessage("У записи нет координат для открытия на карте.", true);
      return;
    }

    const params = new URLSearchParams({
      lat: entry.latitude,
      lon: entry.longitude,
      name: entry.locationName || entry.title || "Место рыбалки",
      entryId: entry.id,
    });

    navigate(`/map-points?${params.toString()}`);
  }


  function handleOpenEntryInFeed(entry) {
    if (!entry?.isPublishedToFeed) {
      showMessage("Эта запись не опубликована в ленте.", true);
      return;
    }

    navigate(getFeedEntryPath(entry.id));
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function openEditProfileFromSettings() {
    setSettingsMenuOpen(false);
    startEdit();
  }

  function openSecurityFromSettings() {
    setSettingsMenuOpen(false);
    setIsEditing(false);
    setActiveTab("security");
  }

  function openNotificationsFromSettings() {
    setSettingsMenuOpen(false);
    setIsEditing(false);
    setActiveTab("notifications");
  }

  async function handleShareProfile() {
    const profileUrl = profile?.id
      ? `${window.location.origin}/users/${profile.id}`
      : window.location.href;

    try {
      await navigator.clipboard.writeText(profileUrl);
      showMessage("Ссылка на профиль скопирована");
    } catch {
      showMessage(profileUrl);
    }
  }

  function openCompanionModal() {
    setCompanionModalOpen(true);
    setCompanionFormOpen(false);
    setCompanionEditingId(null);
    setOpenCompanionMenuId(null);
    loadCompanionRequests(false);
  }

  function openCreateCompanionForm() {
    setCompanionEditingId(null);
    setCompanionForm({
      ...EMPTY_COMPANION_FORM,
      region: profile?.region || "",
      plannedDate: toLocalDateInput(new Date()),
      plannedTime: "08:00",
    });
    setOpenCompanionMenuId(null);
    setCompanionFormOpen(true);
  }

  function openEditCompanionForm(request) {
    setCompanionEditingId(request.id);
    setCompanionForm(getCompanionFormFromRequest(request));
    setOpenCompanionMenuId(null);
    setCompanionFormOpen(true);
  }

  function cancelCompanionForm() {
    setCompanionFormOpen(false);
    setCompanionEditingId(null);
    setCompanionForm(EMPTY_COMPANION_FORM);
  }

  function handleCompanionFormChange(event) {
    const { name, value } = event.target;
    setCompanionForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSaveCompanionRequest(event) {
    event.preventDefault();

    const payload = getCompanionPayload(companionForm);

    if (!payload.title) {
      showMessage("Укажите заголовок поиска.", true);
      return;
    }

    if (!payload.plannedDate) {
      showMessage("Укажите дату и время рыбалки.", true);
      return;
    }

    if (isCompanionDateTimeInPast(companionForm)) {
      showMessage("Нельзя выбрать прошедшую дату и время.", true);
      return;
    }

    try {
      setCompanionSaving(true);

      if (companionEditingId) {
        await updateCompanionRequest(companionEditingId, payload);
        showMessage("Поиск напарника обновлён");
      } else {
        await createCompanionRequest(payload);
        showMessage("Поиск напарника создан");
      }

      setCompanionFormOpen(false);
      setCompanionEditingId(null);
      setCompanionForm(EMPTY_COMPANION_FORM);
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось сохранить поиск напарника: ${err.message}`, true);
    } finally {
      setCompanionSaving(false);
    }
  }

  async function handleDeleteCompanionRequest(request) {
    const confirmed = window.confirm(`Удалить поиск "${request.title || "Без названия"}"?`);
    if (!confirmed) return;

    try {
      setCompanionActionLoading(request.id);
      await deleteCompanionRequest(request.id);
      showMessage("Поиск напарника удалён");
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось удалить поиск: ${err.message}`, true);
    } finally {
      setCompanionActionLoading(null);
      setOpenCompanionMenuId(null);
    }
  }

  async function handleCloseCompanionRequest(request) {
    const confirmed = window.confirm(`Закрыть поиск "${request.title || "Без названия"}"?`);
    if (!confirmed) return;

    try {
      setCompanionActionLoading(request.id);
      await closeCompanionRequest(request.id);
      showMessage("Поиск напарника закрыт");
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось закрыть поиск: ${err.message}`, true);
    } finally {
      setCompanionActionLoading(null);
      setOpenCompanionMenuId(null);
    }
  }

  async function handleAcceptCompanionResponse(request, response) {
    try {
      setCompanionActionLoading(response.id);
      await acceptCompanionResponse(request.id, response.id);
      showMessage(`@${response.userName || "user"} подтверждён`);
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось подтвердить отклик: ${err.message}`, true);
    } finally {
      setCompanionActionLoading(null);
    }
  }

  async function handleRejectCompanionResponse(request, response) {
    try {
      setCompanionActionLoading(response.id);
      await rejectCompanionResponse(request.id, response.id);
      showMessage("Отклик отклонён");
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отклонить отклик: ${err.message}`, true);
    } finally {
      setCompanionActionLoading(null);
    }
  }

  async function handleCancelCompanionAcceptance(request, response) {
    const confirmed = window.confirm(`Отменить бронь для @${response.userName || "user"}?`);
    if (!confirmed) return;

    try {
      setCompanionActionLoading(response.id);
      await cancelCompanionResponseAcceptance(request.id, response.id);
      showMessage("Бронь отменена, отклик снова ждёт решения");
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отменить бронь: ${err.message}`, true);
    } finally {
      setCompanionActionLoading(null);
    }
  }

  async function handleCancelMyCompanionResponse(request) {
    const isAccepted = normalizeStatus(request.currentUserResponseStatus) === "accepted";
    const confirmed = window.confirm(isAccepted
      ? `Отменить бронь в поиске "${request.title || "Без названия"}"?`
      : `Отменить отклик на поиск "${request.title || "Без названия"}"?`
    );

    if (!confirmed) return;

    try {
      setCompanionActionLoading(`my-${request.id}`);
      await cancelMyCompanionResponse(request.id);
      showMessage(isAccepted ? "Бронь отменена" : "Отклик отменён");
      await loadCompanionRequests(true);
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отменить участие: ${err.message}`, true);
    } finally {
      setCompanionActionLoading(null);
    }
  }

  useEffect(() => {
    if (!shareModalEntry) return;

    async function loadShareChats() {
      try {
        setLoadingShareChats(true);
        setMessage("");
        const data = await getChats();
        setAvailableChats(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setMessage(`Не удалось загрузить чаты: ${err.message}`);
        setIsErrorMessage(true);
      } finally {
        setLoadingShareChats(false);
      }
    }

    loadShareChats();
  }, [shareModalEntry]);

  const filteredShareChats = useMemo(() => {
    const query = shareChatSearch.trim().toLowerCase();
    if (!query) return availableChats;

    return availableChats.filter((chat) =>
      [chat.name, chat.lastMessageText, chat.lastMessageUserName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [availableChats, shareChatSearch]);

  function closeShareModal() {
    setShareModalEntry(null);
    setShareMessageText("");
    setShareChatSearch("");
    setSelectedShareChatIds([]);
  }

  function openShareEntryModal(entry) {
    setShareModalEntry(entry);
    setShareMessageText("");
    setShareChatSearch("");
    setSelectedShareChatIds([]);
  }

  function toggleShareChat(chatId) {
    setSelectedShareChatIds((current) =>
      current.includes(chatId)
        ? current.filter((id) => id !== chatId)
        : [...current, chatId]
    );
  }

  async function handleSendShareToChats() {
    if (!shareModalEntry?.id || selectedShareChatIds.length === 0) return;

    const selectedChats = availableChats.filter((chat) => selectedShareChatIds.includes(chat.id));
    if (selectedChats.length === 0) return;

    try {
      setShareSending(true);
      setMessage("");
      setIsErrorMessage(false);

      const note = shareMessageText.trim();

      for (const chat of selectedChats) {
        await shareFishingEntryToChat(chat.id, shareModalEntry.id, note || null);
      }

      if (shareModalEntry.visibility !== 0 && shareModalEntry.isPublishedToFeed) {
        try {
          await shareFishingEntry(shareModalEntry.id);
        } catch (err) {
          console.warn("Не удалось обновить счетчик репостов:", err);
        }
      }

      showMessage(
        selectedChats.length === 1
          ? `Запись отправлена в чат «${selectedChats[0]?.name || "Чат"}».`
          : `Запись отправлена в ${selectedChats.length} чата.`
      );
      closeShareModal();
    } catch (err) {
      console.error(err);
      showMessage(`Не удалось отправить запись в чат: ${err.message}`, true);
    } finally {
      setShareSending(false);
    }
  }

  function openProfileById(userId) {
    if (!userId) return;
    navigate(`/users/${userId}`);
  }

  if (!profile) {
    return <p className="muted-text">Загрузка профиля...</p>;
  }

  if (profile.isBlocked) {
    return (
      <div className="page-container profile-page">
        <section className="profile-hero card">
          <div className="profile-cover">
            <span className="profile-cover-badge">Профиль ограничен</span>
          </div>

          <div className="profile-main">
            <div className="profile-avatar profile-avatar-large profile-avatar-placeholder" aria-hidden="true">
              !
            </div>

            <div className="profile-info">
              <p className="profile-kicker">Мой профиль</p>
              <h1>Аккаунт заблокирован</h1>
              <p className="profile-region">Доступ к приложению временно ограничен.</p>
              <p className="profile-about">
                Публикации, фото профиля и действия в приложении скрыты до решения администрации.
              </p>
            </div>
          </div>

          <div className="profile-actions">
            <button className="profile-form-ghost-button" onClick={handleLogout} type="button">
              Выйти
            </button>
          </div>
        </section>

        <section className="card profile-content-card">
          <div className="profile-section-header">
            <div>
              <p className="profile-kicker">Статус аккаунта</p>
              <h2 className="section-title">Вы были заблокированы</h2>
            </div>
          </div>

          <div className="profile-info-grid">
            <div className="profile-info-item profile-info-item-wide">
              <span>Причина блокировки</span>
              <strong>{getBlockReasonText(profile)}</strong>
            </div>

            {profile.blockedAtUtc && (
              <div className="profile-info-item">
                <span>Дата блокировки</span>
                <strong>{formatDate(profile.blockedAtUtc)}</strong>
              </div>
            )}

            <div className="profile-info-item profile-info-item-wide">
              <span>Связь с поддержкой</span>
              <strong>{SUPPORT_EMAIL}</strong>
            </div>
          </div>
        </section>

        <section className="card profile-content-card">
          <div className="profile-section-header">
            <div>
              <p className="profile-kicker">Обращение</p>
              <h2 className="section-title">Обжалование блокировки</h2>
            </div>
          </div>

          {blockAppealSent ? (
            <div className="profile-info-grid">
              <div className="profile-info-item profile-info-item-wide">
                <span>Статус обращения</span>
                <strong>Обращение уже отправлено. Ожидайте решения администрации.</strong>
              </div>
            </div>
          ) : (
            <form className="form-grid" onSubmit={handleSubmitBlockAppeal}>
              <p className="muted-text" style={{ margin: 0 }}>
                Если вы считаете блокировку ошибочной, отправьте обращение администрации. Опишите обстоятельства нарушения и причину пересмотра решения.
              </p>

              <label>
                Текст обращения
                <textarea
                  value={blockAppealText}
                  onChange={(event) => setBlockAppealText(event.target.value)}
                  placeholder="Текст обращения"
                  maxLength={2000}
                  rows={5}
                  disabled={blockAppealSending}
                />
              </label>

              <div className="button-row">
                <button type="submit" disabled={blockAppealSending}>
                  {blockAppealSending ? "Отправка..." : "Отправить обращение"}
                </button>
              </div>
            </form>
          )}
        </section>

        {message && (
          <p className={`profile-message ${isErrorMessage ? "error-text" : "success-text"}`}>{message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="page-container profile-page">
      <section className="profile-hero card">
        <div className="profile-cover">
          <span className="profile-cover-badge">Профиль НаКлёве</span>
        </div>

        <div className="profile-main">
          <Avatar
            userName={getDisplayName(profile)}
            avatarUrl={profile.avatarUrl}
            onClick={profile.avatarUrl ? () => setIsAvatarOpen(true) : undefined}
          />

          <div className="profile-info">
            <p className="profile-kicker">Мой профиль</p>
            <h1>{getDisplayName(profile)}</h1>
            <p className="profile-username">@{profile.userName}</p>
            <p className="profile-region">{profile.region || "Регион не указан"}</p>
            <p className="profile-about">
              {profile.about || "Добавь описание профиля, любимые места, снасти и стиль рыбалки."}
            </p>
          </div>
        </div>

        <div className="profile-stats">
          <button className="profile-stat" onClick={() => setActiveTab("posts")} type="button">
            <strong>{entries.length}</strong>
            <span>записей</span>
          </button>
          <button className="profile-stat" onClick={() => setFriendsModalOpen(true)} type="button">
            <strong>{friends.length}</strong>
            <span>друзей</span>
            {requests.length > 0 && <small>{requests.length} заявок</small>}
          </button>
        </div>

        <div className="profile-actions">
          <button className="profile-form-primary-button" onClick={openCreateEntryModal} type="button">
            Добавить запись
          </button>

          <button className="profile-form-ghost-button profile-action-with-badge" onClick={openCompanionModal} type="button">
            Поиск напарника
            {companionPendingCount > 0 && <span>{companionPendingCount}</span>}
          </button>

          <button className="profile-form-ghost-button" onClick={handleShareProfile} type="button">
            Поделиться профилем
          </button>

          <div className="profile-settings-dropdown" ref={settingsMenuRef}>
            <button
              className="profile-settings-button"
              onClick={() => setSettingsMenuOpen((value) => !value)}
              type="button"
              aria-label="Настройки профиля"
              title="Настройки профиля"
            >
              ⚙
            </button>

            {settingsMenuOpen && (
              <div className="profile-settings-menu">
                <button onClick={openEditProfileFromSettings} type="button">
                  Редактировать профиль
                </button>
                <button onClick={openSecurityFromSettings} type="button">
                  Безопасность
                </button>
                <button onClick={openNotificationsFromSettings} type="button">
                  Уведомления
                </button>
                <button
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    showMessage("Смена email будет добавлена следующим этапом.");
                  }}
                  type="button"
                >
                  Сменить email
                </button>
                <button onClick={handleLogout} type="button" className="danger">
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {message && (
        <p className={`profile-message ${isErrorMessage ? "error-text" : "success-text"}`}>{message}</p>
      )}

      {isEditing && (
        <section className="card profile-edit-card">
          <div className="profile-section-header">
            <div>
              <p className="profile-kicker">Настройки</p>
              <h2 className="section-title">Редактирование профиля</h2>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Имя
              <input name="firstName" value={form.firstName} onChange={handleFormChange} required />
            </label>

            <label>
              Фамилия
              <input name="lastName" value={form.lastName} onChange={handleFormChange} />
            </label>

            <label>
              Имя пользователя
              <input name="userName" value={form.userName} onChange={handleFormChange} required />
            </label>

            <label>
              Регион
              <input name="region" value={form.region} onChange={handleFormChange} />
            </label>

            <label>
              О себе
              <textarea name="about" value={form.about} onChange={handleFormChange} />
            </label>

            <AvatarUploader
              avatarUrl={form.avatarUrl}
              displayName={getDisplayName(profile)}
              disabled={saving}
              uploading={uploadingAvatar}
              onUpload={handleAvatarUpload}
              onRemove={handleAvatarRemove}
            />

            <div className="button-row">
              <button type="submit" disabled={saving || uploadingAvatar}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button className="button-secondary" type="button" onClick={cancelEdit}>
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card profile-content-card">
        <div className="profile-tabs">
          <button className={`profile-tab ${activeTab === "posts" ? "active" : ""}`} onClick={() => setActiveTab("posts")} type="button">
            Записи
          </button>
          <button className={`profile-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => setActiveTab("info")} type="button">
            Информация
          </button>
        </div>  

        {activeTab === "posts" && (
          <>
            <div className="profile-section-header profile-section-header-wrap">
              <div>
                <p className="profile-kicker">Журнал рыбалки</p>
                <h2 className="section-title">Мои записи</h2>
              </div>

              <div className="profile-filter-row">
                <button className={`profile-chip ${entryFilter === "all" ? "active" : ""}`} onClick={() => setEntryFilter("all")} type="button">
                  Все · {entries.length}
                </button>
                <button className={`profile-chip ${entryFilter === "feed" ? "active" : ""}`} onClick={() => setEntryFilter("feed")} type="button">
                  В ленте · {publishedEntries.length}
                </button>
                <button className={`profile-chip ${entryFilter === "profile" ? "active" : ""}`} onClick={() => setEntryFilter("profile")} type="button">
                  В профиле · {publicProfileEntries.length}
                </button>
                <button className={`profile-chip ${entryFilter === "private" ? "active" : ""}`} onClick={() => setEntryFilter("private")} type="button">
                  Приватные · {privateEntries.length}
                </button>
              </div>
            </div>

            {visibleEntries.length === 0 ? (
              <EmptyState
                title="У вас пока нет записей"
                text="Поделитесь своими рыболовными приключениями с сообществом."
                action={<button className="profile-form-primary-button" onClick={openCreateEntryModal} type="button">Добавить первую запись</button>}
              />
            ) : (
              <div className="profile-entry-grid">
                {visibleEntries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onEdit={openEditEntryModal}
                    onDelete={handleDeleteEntry}
                    onTogglePrivacy={handleTogglePrivacy}
                    onToggleFeed={handleToggleFeed}
                    onOpenWeather={handleOpenWeather}
                    onOpenMap={handleOpenEntryMap}
                    onOpenDetails={setDetailsEntry}
                    onOpenFeed={handleOpenEntryInFeed}
                    onShare={openShareEntryModal}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "info" && (
          <div className="profile-info-grid">
            <div className="profile-info-item">
              <span>Имя</span>
              <strong>{profile.firstName || "Не указано"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Фамилия</span>
              <strong>{profile.lastName || "Не указана"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Имя пользователя</span>
              <strong>@{profile.userName}</strong>
            </div>
            <div className="profile-info-item">
              <span>Регион</span>
              <strong>{profile.region || "Не указан"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Дата регистрации</span>
              <strong>{formatDate(profile.createdAt)}</strong>
            </div>
            <div className="profile-info-item profile-info-item-wide">
              <span>О себе</span>
              <strong>{profile.about || "Описание пока не заполнено"}</strong>
            </div>
          </div>
        )}
        {activeTab === "notifications" && (
          <NotificationSettingsPanel
            profile={profile}
            saving={notificationSaving}
            onSave={handleSaveNotificationSettings}
          />
        )}

        {activeTab === "security" && (
          <PasswordChangePanel profile={profile} onMessage={showMessage} />
        )}
      </section>

      <AvatarPreviewModal isOpen={isAvatarOpen} imageUrl={profile.avatarUrl} onClose={() => setIsAvatarOpen(false)} />

      <FriendsModal
        isOpen={friendsModalOpen}
        onClose={() => setFriendsModalOpen(false)}
        friends={friends}
        requests={requests}
        onAccept={handleAccept}
        onDecline={handleDecline}
        onFriendRequestSent={loadFriendsData}
        onMessage={showMessage}
      />

      <EntryDetailsModal
        isOpen={Boolean(detailsEntry)}
        entry={detailsEntry}
        onClose={() => setDetailsEntry(null)}
        onOpenWeather={handleOpenWeather}
        onOpenMap={handleOpenEntryMap}
        onOpenFeed={handleOpenEntryInFeed}
      />

      <CompanionRequestsModal
        isOpen={companionModalOpen}
        onClose={() => setCompanionModalOpen(false)}
        requests={companionRequests}
        partnerRequests={companionPartnerRequests}
        loading={companionsLoading}
        form={companionForm}
        onFormChange={handleCompanionFormChange}
        formOpen={companionFormOpen}
        editingId={companionEditingId}
        saving={companionSaving}
        actionLoading={companionActionLoading}
        openMenuId={openCompanionMenuId}
        onSetOpenMenuId={setOpenCompanionMenuId}
        onOpenCreate={openCreateCompanionForm}
        onOpenEdit={openEditCompanionForm}
        onCancelForm={cancelCompanionForm}
        onSubmit={handleSaveCompanionRequest}
        onDelete={handleDeleteCompanionRequest}
        onCloseRequest={handleCloseCompanionRequest}
        onAcceptResponse={handleAcceptCompanionResponse}
        onRejectResponse={handleRejectCompanionResponse}
        onCancelAcceptance={handleCancelCompanionAcceptance}
        onCancelMyResponse={handleCancelMyCompanionResponse}
        onOpenProfile={openProfileById}
      />

      {shareModalEntry && (
        <div className="profile-share-modal-backdrop" onClick={closeShareModal}>
          <div className="profile-share-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-share-modal__header">
              <div>
                <p className="profile-kicker">Поделиться</p>
                <h2>Отправить запись в чат</h2>
                <span>{shareModalEntry.title || "Запись о рыбалке"}</span>
              </div>
              <button type="button" onClick={closeShareModal} aria-label="Закрыть">×</button>
            </div>

            <textarea
              className="profile-share-modal__message"
              value={shareMessageText}
              onChange={(event) => setShareMessageText(event.target.value)}
              maxLength={1000}
              placeholder="Сообщение к записи, необязательно"
            />

            <input
              className="profile-share-modal__search"
              value={shareChatSearch}
              onChange={(event) => setShareChatSearch(event.target.value)}
              placeholder="Найти чат"
            />

            <div className="profile-share-modal__list">
              {loadingShareChats ? (
                <div className="profile-share-modal__empty">Загружаем чаты...</div>
              ) : filteredShareChats.length === 0 ? (
                <div className="profile-share-modal__empty">Чаты не найдены.</div>
              ) : (
                filteredShareChats.map((chat) => {
                  const isSelected = selectedShareChatIds.includes(chat.id);
                  const safeAvatarUrl = getSafeImageUrl(chat.targetUserAvatarUrl || chat.avatarUrl);

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className={`profile-share-chat${isSelected ? " selected" : ""}`}
                      disabled={shareSending}
                      onClick={() => toggleShareChat(chat.id)}
                    >
                      <span className="profile-share-chat__avatar">
                        {safeAvatarUrl ? (
                          <img src={safeAvatarUrl} alt={chat.name || "Чат"} loading="lazy" decoding="async" />
                        ) : (
                          <span>{getInitials(chat.name || "Ч")}</span>
                        )}
                      </span>
                      <span className="profile-share-chat__info">
                        <strong>{chat.name || "Чат"}</strong>
                        <small>{chat.type === "Group" ? "Групповой чат" : "Личный чат"}</small>
                      </span>
                      <span className="profile-share-chat__check" aria-hidden="true">{isSelected ? "✓" : ""}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="profile-share-modal__footer">
              <span>Выбрано: {selectedShareChatIds.length}</span>
              <button
                type="button"
                className="profile-form-primary-button"
                disabled={selectedShareChatIds.length === 0 || shareSending}
                onClick={handleSendShareToChats}
              >
                {shareSending ? "Отправляем..." : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      )}

      <EntryEditorModal
        isOpen={entryModalOpen}
        mode={entryModalMode}
        entry={selectedEntry}
        onClose={() => setEntryModalOpen(false)}
        onSubmit={handleSaveEntry}
        saving={entrySaving}
      />
    </div>
  );
}
