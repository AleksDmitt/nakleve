import { API_BASE_URL, getToken } from "../utils/apiClient";

async function uploadFile(endpoint, file, errorPrefix) {
  const formData = new FormData();
  formData.append("file", file);

  const token = getToken();

  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (error) {
    console.error(`${errorPrefix} fetch error:`, error);
    throw new Error("Нет соединения с сервером.");
  }

  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error(`${errorPrefix} API error:`, data);

    const message =
      data?.message ||
      data?.title ||
      data?.error ||
      (typeof data === "string" ? data : null) ||
      "Ошибка загрузки файла";

    throw new Error(message);
  }

  return data;
}

export async function uploadFishingPhoto(file) {
  return uploadFile("/Uploads/fishing-photo", file, "Upload");
}

export async function uploadAvatar(file) {
  return uploadFile("/Uploads/avatar", file, "Avatar upload");
}

export async function uploadFishingMedia(file) {
  // Backend принимает фото и видео через /Uploads/fishing-photo.
  return uploadFishingPhoto(file);
}

export async function uploadFishingMediaFiles(files) {
  const fileList = Array.from(files || []);

  const uploaded = [];
  for (const file of fileList) {
    const result = await uploadFishingMedia(file);
    const url = result?.fileUrl || result?.url || result?.path || "";
    if (!url) continue;

    uploaded.push({
      url,
      mediaType: file.type?.startsWith("video/") ? "video" : "image",
      sortOrder: uploaded.length,
    });
  }

  return uploaded;
}
