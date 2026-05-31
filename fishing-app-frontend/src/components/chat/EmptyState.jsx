export default function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        color: "rgba(255,255,255,0.72)",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "420px" }}>
        <div style={{ fontSize: "52px", marginBottom: "14px" }}>💬</div>
        <div style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>
          Выберите чат
        </div>
        <div className="muted-text">
          Слева находятся ваши личные и групповые чаты. Откройте диалог или создайте новый.
        </div>
      </div>
    </div>
  );
}
