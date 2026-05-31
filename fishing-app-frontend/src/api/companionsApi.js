import { apiRequest } from "../utils/apiClient";

export function getCompanionRequests() {
  return apiRequest("/companions/requests");
}

export function getCompanionRequestById(id) {
  return apiRequest(`/companions/requests/${id}`);
}

export function createCompanionRequest(data) {
  return apiRequest("/companions/requests", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCompanionRequest(requestId, data) {
  return apiRequest(`/companions/requests/${requestId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCompanionRequest(requestId) {
  return apiRequest(`/companions/requests/${requestId}`, {
    method: "DELETE",
  });
}

export function createCompanionResponse(requestId, data) {
  return apiRequest(`/companions/requests/${requestId}/responses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function acceptCompanionResponse(requestId, responseId) {
  return apiRequest(`/companions/requests/${requestId}/responses/${responseId}/accept`, {
    method: "PUT",
  });
}

export function rejectCompanionResponse(requestId, responseId) {
  return apiRequest(`/companions/requests/${requestId}/responses/${responseId}/reject`, {
    method: "PUT",
  });
}

export function cancelCompanionResponseAcceptance(requestId, responseId) {
  return apiRequest(`/companions/requests/${requestId}/responses/${responseId}/cancel-acceptance`, {
    method: "PUT",
  });
}

export function closeCompanionRequest(requestId) {
  return apiRequest(`/companions/requests/${requestId}/close`, {
    method: "PUT",
  });
}

export function cancelMyCompanionResponse(requestId) {
  return apiRequest(`/companions/requests/${requestId}/responses/my/cancel`, {
    method: "PUT",
  });
}
