const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? "https://localhost:7040/api"
  : "/api";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)
  .trim()
  .replace(/\/+$/, "");

export function getToken() {
  return localStorage.getItem("token");
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (error) {
    console.error("Fetch failed:", error);
    throw new ApiError("Нет соединения с backend.", 0, null);
  }

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error("API error:", data);

    const message =
      data?.message ||
      data?.title ||
      data?.error ||
      (typeof data === "string" ? data : null) ||
      "Ошибка запроса";

    throw new ApiError(message, response.status, data);
  }

  return data;
}
