import { apiRequest } from "../utils/apiClient";

export function getProfile() {
  return apiRequest("/profile");
}

export function getPublicProfile(userId) {
  return apiRequest(`/profile/${userId}`);
}

export function updateProfile(data) {
  return apiRequest("/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function requestPasswordChangeCode() {
  return apiRequest("/Auth/request-password-change-code", {
    method: "POST",
  });
}

export function changePasswordWithCode(data) {
  return apiRequest("/Auth/change-password-with-code", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProfileAvatar(avatarUrl) {
  return apiRequest("/profile/avatar", {
    method: "PUT",
    body: JSON.stringify({ avatarUrl }),
  });
}


export function updateNotificationSettings(data) {
  return apiRequest("/profile/notification-settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function adminBlockUser(userId, data = {}) {
  const payload = typeof data === "string"
    ? { reasonCode: data, reasonText: null }
    : {
        reasonCode: data.reasonCode || data.reason || null,
        reasonText: data.reasonText || null,
      };

  return apiRequest(`/profile/admin/users/${userId}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUnblockUser(userId) {
  return apiRequest(`/profile/admin/users/${userId}/block`, {
    method: "DELETE",
  });
}


export function submitBlockAppeal(message) {
  return apiRequest("/profile/block-appeal", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}


export function reportUser(userId, data = {}) {
  return apiRequest(`/profile/${userId}/report`, {
    method: "POST",
    body: JSON.stringify({
      reasonCode: data.reasonCode || data.reason || null,
      reasonText: data.reasonText || null,
    }),
  });
}

export function blockUser(userId) {
  return apiRequest(`/profile/${userId}/block`, {
    method: "POST",
  });
}

export function unblockUser(userId) {
  return apiRequest(`/profile/${userId}/block`, {
    method: "DELETE",
  });
}
