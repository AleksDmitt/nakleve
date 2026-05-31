import { apiRequest } from "../utils/apiClient";

export function register(data) {
  return apiRequest("/Auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function confirmEmail(data) {
  return apiRequest("/Auth/confirm-email", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function resendEmailCode(data) {
  return apiRequest("/Auth/resend-email-code", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function forgotPassword(data) {
  return apiRequest("/Auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function resetPassword(data) {
  return apiRequest("/Auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function login(data) {
  return apiRequest("/Auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getMe() {
  return apiRequest("/Auth/me");
}
export function acceptLegalDocuments(data) {
  return apiRequest("/Auth/accept-legal-documents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
