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
