import { useEffect, useState } from "react";
import {
  closeCompanionRequest,
  createCompanionRequest,
  createCompanionResponse,
  getCompanionRequestById,
  getCompanionRequests,
} from "../api/companionsApi";
import { getProfile } from "../api/profileApi";

const emptyForm = {
  title: "",
  description: "",
  region: "",
  plannedDate: "",
  meetingPoint: "",
};

export default function CompanionsPage() {
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [responseMessage, setResponseMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    try {
      setLoading(true);
      const data = await getCompanionRequests();
      setRequests(data);
    } catch (err) {
      setMessage(`Не удалось загрузить заявки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfileInfo() {
    try {
      const profile = await getProfile();
      setMyUserId(profile.id);
    } catch {
      setMyUserId(null);
    }
  }

  async function loadRequestDetails(id) {
    try {
      const data = await getCompanionRequestById(id);
      setSelectedRequest(data);
    } catch (err) {
      setMessage(`Не удалось загрузить заявку: ${err.message}`);
    }
  }

  useEffect(() => {
    loadRequests();
    loadProfileInfo();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        region: form.region || null,
        plannedDate: new Date(form.plannedDate).toISOString(),
        meetingPoint: form.meetingPoint || null,
      };

      await createCompanionRequest(payload);
      setForm(emptyForm);
      setMessage("Заявка создана");
      await loadRequests();
    } catch (err) {
      setMessage(`Не удалось создать заявку: ${err.message}`);
    }
  }

  async function handleOpenDetails(id) {
    await loadRequestDetails(id);
  }

  async function handleSendResponse() {
    if (!selectedRequest) return;

    try {
      await createCompanionResponse(selectedRequest.id, {
        message: responseMessage || null,
      });

      setResponseMessage("");
      setMessage("Отклик отправлен");
      await loadRequestDetails(selectedRequest.id);
    } catch (err) {
      setMessage(`Не удалось отправить отклик: ${err.message}`);
    }
  }

  async function handleCloseRequest(id) {
    try {
      await closeCompanionRequest(id);
      setMessage("Заявка закрыта");
      await loadRequests();

      if (selectedRequest?.id === id) {
        await loadRequestDetails(id);
      }
    } catch (err) {
      setMessage(`Не удалось закрыть заявку: ${err.message}`);
    }
  }

  return (
    <div>
      <h1>Поиск напарника</h1>

      <form
        onSubmit={handleCreate}
        style={{
          display: "grid",
          gap: "10px",
          maxWidth: "600px",
          marginBottom: "24px",
        }}
      >
        <input
          placeholder="Название"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <textarea
          placeholder="Описание"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          placeholder="Регион"
          value={form.region}
          onChange={(e) => setForm({ ...form, region: e.target.value })}
        />
        <input
          type="datetime-local"
          value={form.plannedDate}
          onChange={(e) => setForm({ ...form, plannedDate: e.target.value })}
          required
        />
        <input
          placeholder="Место встречи"
          value={form.meetingPoint}
          onChange={(e) => setForm({ ...form, meetingPoint: e.target.value })}
        />
        <button type="submit">Создать заявку</button>
      </form>

      {message && <p>{message}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div>
          <h2>Список заявок</h2>

          {loading ? (
            <p>Загрузка...</p>
          ) : requests.length === 0 ? (
            <p>Заявок пока нет</p>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              {requests.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  <h3>{item.title}</h3>
                  <p><strong>Описание:</strong> {item.description || "—"}</p>
                  <p><strong>Регион:</strong> {item.region || "—"}</p>
                  <p><strong>Дата:</strong> {new Date(item.plannedDate).toLocaleString()}</p>
                  <p><strong>Место встречи:</strong> {item.meetingPoint || "—"}</p>
                  <p><strong>Статус:</strong> {item.status}</p>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => handleOpenDetails(item.id)}>
                      Подробнее
                    </button>

                    {myUserId === item.userId && item.status !== "Closed" && (
                      <button onClick={() => handleCloseRequest(item.id)}>
                        Закрыть
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2>Детали заявки</h2>

          {!selectedRequest ? (
            <p>Выбери заявку из списка</p>
          ) : (
            <div
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <h3>{selectedRequest.title}</h3>
              <p><strong>Автор:</strong> {selectedRequest.userName || "—"}</p>
              <p><strong>Описание:</strong> {selectedRequest.description || "—"}</p>
              <p><strong>Регион:</strong> {selectedRequest.region || "—"}</p>
              <p><strong>Дата:</strong> {new Date(selectedRequest.plannedDate).toLocaleString()}</p>
              <p><strong>Место встречи:</strong> {selectedRequest.meetingPoint || "—"}</p>
              <p><strong>Статус:</strong> {selectedRequest.status}</p>

              <h4>Отклики</h4>
              {selectedRequest.responses.length === 0 ? (
                <p>Откликов пока нет</p>
              ) : (
                <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
                  {selectedRequest.responses.map((response) => (
                    <div
                      key={response.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: "6px",
                        padding: "10px",
                      }}
                    >
                      <p><strong>Пользователь:</strong> {response.userName || "—"}</p>
                      <p><strong>Сообщение:</strong> {response.message || "—"}</p>
                      <p><strong>Дата:</strong> {new Date(response.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedRequest.status !== "Closed" && myUserId !== selectedRequest.userId && (
                <div style={{ display: "grid", gap: "10px" }}>
                  <textarea
                    placeholder="Сообщение к отклику"
                    value={responseMessage}
                    onChange={(e) => setResponseMessage(e.target.value)}
                  />
                  <button onClick={handleSendResponse}>Откликнуться</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}