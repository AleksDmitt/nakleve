export const SIDEBAR_COLLAPSED_WIDTH = 76;
export const SIDEBAR_TEXT_MIN_WIDTH = 240;
export const SIDEBAR_COLLAPSE_THRESHOLD = 210;
export const SIDEBAR_DEFAULT_WIDTH = 320;
export const SIDEBAR_MAX_RATIO = 0.5;
export const QUICK_EMOJIS = ["🎣", "🐟", "🔥", "😄", "👍", "👏", "😎", "🌊", "☀️", "🌧️"];

export function getInitials(name) {
  return name?.[0]?.toUpperCase() || "U";
}

export function shortenText(text, max = 60) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function formatMessageTime(dateValue) {
  const date = new Date(dateValue);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDateDivider(dateValue) {
  const date = new Date(dateValue);
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (isSameDay(target, today)) return "Сегодня";
  if (isSameDay(target, yesterday)) return "Вчера";

  const sameYear = date.getFullYear() === now.getFullYear();

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function buildMessageItems(messages) {
  const items = [];
  let previousDate = null;

  for (const msg of messages) {
    const currentDate = new Date(msg.sentAt);

    if (!previousDate || !isSameDay(previousDate, currentDate)) {
      items.push({
        type: "divider",
        id: `divider-${msg.id}`,
        label: formatDateDivider(msg.sentAt),
      });
    }

    items.push({
      type: "message",
      ...msg,
    });

    previousDate = currentDate;
  }

  return items;
}

export function clampSidebarWidth(value) {
  const maxWidth = Math.floor(window.innerWidth * SIDEBAR_MAX_RATIO);

  if (value <= SIDEBAR_COLLAPSE_THRESHOLD) {
    return SIDEBAR_COLLAPSED_WIDTH;
  }

  return Math.min(Math.max(value, SIDEBAR_TEXT_MIN_WIDTH), maxWidth);
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}
