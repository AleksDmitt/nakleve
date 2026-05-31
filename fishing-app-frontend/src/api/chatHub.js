import * as signalR from "@microsoft/signalr";

const DEFAULT_HUB_URL = import.meta.env.DEV
  ? "https://localhost:7040/hubs/chat"
  : "/hubs/chat";

const HUB_URL = (import.meta.env.VITE_HUB_URL || DEFAULT_HUB_URL).trim();

let connection = null;
let startPromise = null;
let currentToken = null;

export function getChatConnection(token) {
  if (!connection) {
    currentToken = token;

    connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => currentToken || "",
        withCredentials: true,
      })
      .withAutomaticReconnect()
      // Важно: не ставим Information, иначе SignalR пишет в консоль URL подключения,
      // а для WebSocket JWT передаётся через access_token в query string.
      // Warning оставляет предупреждения/ошибки, но убирает информационный лог с токеном.
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }

  return connection;
}

export async function ensureChatConnectionStarted(token) {
  if (connection && currentToken !== token) {
    await stopChatConnection();
  }

  const hubConnection = getChatConnection(token);

  if (hubConnection.state === signalR.HubConnectionState.Connected) {
    return hubConnection;
  }

  if (startPromise) {
    await startPromise;
    return hubConnection;
  }

  startPromise = hubConnection
    .start()
    .catch((err) => {
      console.error("SignalR connection error:", err);
      throw err;
    })
    .finally(() => {
      startPromise = null;
    });

  await startPromise;
  return hubConnection;
}

export async function stopChatConnection() {
  if (!connection) return;

  try {
    if (connection.state !== signalR.HubConnectionState.Disconnected) {
      await connection.stop();
    }
  } catch (err) {
    console.error("SignalR stop error:", err);
  }

  connection = null;
  startPromise = null;
  currentToken = null;
}
