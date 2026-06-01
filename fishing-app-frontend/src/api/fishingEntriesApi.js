import { apiRequest } from "../utils/apiClient";

export function getFishingEntries() {
  return apiRequest("/FishingEntries");
}

export function getFishingEntryById(id) {
  return apiRequest(`/FishingEntries/${id}`);
}

export function getFishingFeed(options = {}) {
  const params = new URLSearchParams();

  const page = Number(options.page || 1);
  const pageSize = Number(options.pageSize || 10);

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  if (options.sort) params.set("sort", options.sort);
  if (options.region) params.set("region", options.region);
  if (options.fish) params.set("fish", options.fish);
  if (options.entryId) params.set("entryId", options.entryId);

  return apiRequest(`/FishingEntries/feed?${params.toString()}`);
}

export function createFishingEntry(data) {
  return apiRequest("/FishingEntries", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateFishingEntry(id, data) {
  return apiRequest(`/FishingEntries/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteFishingEntry(id) {
  return apiRequest(`/FishingEntries/${id}`, {
    method: "DELETE",
  });
}

export function adminDeleteFishingEntry(id) {
  return apiRequest(`/FishingEntries/${id}/admin`, {
    method: "DELETE",
  });
}

export function toggleFishingEntryLike(id) {
  return apiRequest(`/FishingEntries/${id}/like`, {
    method: "POST",
  });
}

export function getFishingEntryComments(id) {
  return apiRequest(`/FishingEntries/${id}/comments`);
}

export function createFishingEntryComment(id, text, parentCommentId = null) {
  return apiRequest(`/FishingEntries/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ text, parentCommentId }),
  });
}

export function updateFishingEntryComment(entryId, commentId, text) {
  return apiRequest(`/FishingEntries/${entryId}/comments/${commentId}`, {
    method: "PUT",
    body: JSON.stringify({ text }),
  });
}

export function deleteFishingEntryComment(entryId, commentId) {
  return apiRequest(`/FishingEntries/${entryId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export function shareFishingEntry(id) {
  return apiRequest(`/FishingEntries/${id}/share`, {
    method: "POST",
  });
}
