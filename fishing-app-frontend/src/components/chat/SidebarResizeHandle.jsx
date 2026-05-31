export default function SidebarResizeHandle({ onPointerDown }) {
  return (
    <div
      onMouseDown={onPointerDown}
      style={{
        width: "10px",
        cursor: "col-resize",
        position: "relative",
        flexShrink: 0,
        userSelect: "none",
      }}
      title="Изменить ширину панели"
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "4px",
          height: "72px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
}
