import { API_BASE_URL } from "./apiClient";

const DANGEROUS_URL_PREFIXES = [
  "javascript:",
  "vbscript:",
  "data:text/html",
  "data:application/xhtml+xml",
  "data:image/svg+xml",
];

function normalizeUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasDangerousPrefix(value) {
  const normalized = normalizeUrl(value).toLowerCase().replace(/\s+/g, "");
  return DANGEROUS_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isSafeUploadPath(pathname) {
  return pathname.startsWith("/uploads/");
}

function getApiOrigin() {
  const normalizedBaseUrl = normalizeUrl(API_BASE_URL);

  try {
    const apiUrl = new URL(normalizedBaseUrl, window.location.origin);
    return apiUrl.origin;
  } catch {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
}

function toDisplayUploadUrl(value) {
  const normalized = normalizeUrl(value);

  if (!normalized || hasDangerousPrefix(normalized)) return "";
  if (normalized.startsWith("blob:")) return normalized;

  if (normalized.startsWith("/")) {
    return isSafeUploadPath(normalized) ? `${getApiOrigin()}${normalized}` : "";
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return isSafeUploadPath(url.pathname) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isSafeAppFileUrl(value, { allowBlob = false } = {}) {
  const normalized = normalizeUrl(value);
  if (!normalized || hasDangerousPrefix(normalized)) return false;

  if (allowBlob && normalized.startsWith("blob:")) return true;

  if (normalized.startsWith("/")) {
    return isSafeUploadPath(normalized);
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return isSafeUploadPath(url.pathname);
  } catch {
    return false;
  }
}

export function getSafeAppFileUrl(value, fallback = "", options = {}) {
  const normalized = normalizeUrl(value);

  if (options?.allowBlob && normalized.startsWith("blob:")) {
    return isSafeAppFileUrl(normalized, options) ? normalized : fallback;
  }

  return isSafeAppFileUrl(normalized, options)
    ? toDisplayUploadUrl(normalized)
    : fallback;
}

export function getSafeImageUrl(value, fallback = "") {
  return getSafeAppFileUrl(value, fallback);
}

export function getSafePreviewUrl(value, fallback = "") {
  return getSafeAppFileUrl(value, fallback, { allowBlob: true });
}

export function getSafeOptimizedImageUrl(primaryUrl, fallbackUrl = "") {
  return getSafeImageUrl(primaryUrl, "") || getSafeImageUrl(fallbackUrl, "");
}

export function useImageFallback(event, fallbackUrl = "") {
  const safeFallback = getSafeImageUrl(fallbackUrl, "");

  if (!safeFallback || event.currentTarget.dataset.fallbackApplied === "true") {
    return;
  }

  event.currentTarget.dataset.fallbackApplied = "true";
  event.currentTarget.src = safeFallback;
}
