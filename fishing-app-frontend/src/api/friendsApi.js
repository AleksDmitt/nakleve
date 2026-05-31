import { apiRequest } from "../utils/apiClient";

export function getFriends() {
  return apiRequest("/Friends");
}

export function getIncomingFriendRequests() {
  return apiRequest("/Friends/requests/incoming");
}

export function searchUsersByUserName(userName) {
  const normalizedUserName = userName.trim().replace(/^@/, "");
  return apiRequest(`/Friends/search?userName=${encodeURIComponent(normalizedUserName)}`);
}

export function getFriendshipStatus(userId) {
  return apiRequest(`/Friends/status/${userId}`);
}

export function sendFriendRequest(userId) {
  return apiRequest(`/Friends/request/${userId}`, {
    method: "POST",
  });
}

export function cancelOutgoingFriendRequest(userId) {
  return apiRequest(`/Friends/request/${userId}`, {
    method: "DELETE",
  });
}

export function acceptFriendRequest(friendshipId) {
  return apiRequest(`/Friends/accept/${friendshipId}`, {
    method: "POST",
  });
}

export function declineFriendRequest(friendshipId) {
  return apiRequest(`/Friends/decline/${friendshipId}`, {
    method: "POST",
  });
}

export function removeFriend(userId) {
  return apiRequest(`/Friends/${userId}`, {
    method: "DELETE",
  });
}
