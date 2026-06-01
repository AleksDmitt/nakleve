import { apiRequest } from "../utils/apiClient";

function getChatFreshnessTime(chat) {
  const candidates = [
    chat?.lastMessageAt,
    chat?.lastMessage?.sentAt,
    chat?.lastMessage?.createdAt,
    chat?.latestMessageAt,
    chat?.latestMessage?.sentAt,
    chat?.latestMessage?.createdAt,
    chat?.sentAt,
    chat?.updatedAt,
    chat?.createdAt,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }

  return 0;
}

export function sortChatsByFreshness(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const byTime = getChatFreshnessTime(b) - getChatFreshnessTime(a);
    if (byTime !== 0) return byTime;

    const aUnread = Number(a?.unreadCount || (a?.hasUnread ? 1 : 0));
    const bUnread = Number(b?.unreadCount || (b?.hasUnread ? 1 : 0));
    if (bUnread !== aUnread) return bUnread - aUnread;

    return String(a?.name || "").localeCompare(String(b?.name || ""), "ru");
  });
}

export async function getChats() {
  const data = await apiRequest("/Chats");
  return sortChatsByFreshness(data);
}

export function getChatMessages(chatId) {
  return apiRequest(`/Chats/${chatId}/messages`);
}

export function sendChatMessage(chatId, data) {
  return apiRequest(`/Chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function markChatAsRead(chatId) {
  return apiRequest(`/Chats/${chatId}/read`, {
    method: "POST",
  });
}

export function markChatAsReadUntil(chatId, messageId) {
  return apiRequest(`/Chats/${chatId}/read-until`, {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
}

export function markVoiceMessageAsListened(attachmentId) {
  return apiRequest(`/Chats/attachments/${attachmentId}/voice/listened`, {
    method: "POST",
  });
}

export function createOrGetPersonalChat(userId) {
  return apiRequest(`/Chats/private/${userId}`, {
    method: "POST",
  });
}

export function deletePrivateChatForMe(chatId) {
  return apiRequest(`/Chats/${chatId}/private/delete-for-me`, {
    method: "POST",
  });
}

export function deletePrivateChatForAll(chatId) {
  return apiRequest(`/Chats/${chatId}/private/delete-for-all`, {
    method: "DELETE",
  });
}

export function deleteChatMessage(messageId, deleteForAll = false) {
  return apiRequest(`/Chats/messages/${messageId}`, {
    method: "DELETE",
    body: JSON.stringify({ deleteForAll }),
  });
}

export function createGroupChat(data) {
  return apiRequest("/Chats/group", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getChatDetails(chatId) {
  return apiRequest(`/Chats/${chatId}/details`);
}

export function getUserPresence(userId) {
  return apiRequest(`/Chats/users/${userId}/presence`);
}

export function leaveChat(chatId) {
  return apiRequest(`/Chats/${chatId}/leave`, {
    method: "POST",
  });
}

export function transferChatOwnership(chatId, newOwnerUserId) {
  return apiRequest(`/Chats/${chatId}/transfer-ownership/${newOwnerUserId}`, {
    method: "POST",
  });
}

export function deleteGroupChat(chatId) {
  return apiRequest(`/Chats/${chatId}/group/delete`, {
    method: "POST",
  });
}

export function deleteGroupChatForMe(chatId) {
  return apiRequest(`/Chats/${chatId}/group/delete-for-me`, {
    method: "DELETE",
  });
}

export function updateGroupChat(chatId, data) {
  return apiRequest(`/Chats/${chatId}/group`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function addChatParticipants(chatId, userIds) {
  return apiRequest(`/Chats/${chatId}/participants`, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}

export function removeChatParticipant(chatId, userId) {
  return apiRequest(`/Chats/${chatId}/participants/${userId}`, {
    method: "DELETE",
  });
}

export function updateChatParticipantRole(chatId, userId, role) {
  return apiRequest(`/Chats/${chatId}/participants/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function uploadChatAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest("/Chats/upload-avatar", {
    method: "POST",
    body: formData,
  });
}

export function uploadChatAttachment(file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest("/Chats/upload-attachment", {
    method: "POST",
    body: formData,
  });
}

export function shareFishingEntryToChat(chatId, fishingEntryId, text = null) {
  return sendChatMessage(chatId, {
    text,
    replyToMessageId: null,
    sharedFishingEntryId: fishingEntryId,
    attachments: [],
  });
}

export function updateChatNotificationSettings(chatId, isMuted) {
  return apiRequest(`/Chats/${chatId}/notifications`, {
    method: "PATCH",
    body: JSON.stringify({ isMuted }),
  });
}
