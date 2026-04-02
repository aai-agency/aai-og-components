import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { FONT_FAMILY } from "./theme";

/**
 * Lightweight tooltip for map controls. Shows on hover after a short delay.
 * Uses a portal to render at document.body so it escapes overflow:hidden containers.
 */
export function TooltipHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    timerRef.current = setTimeout(() => setShow(true), 400);
  };
  const handleLeave = () => {
    clearTimeout(timerRef.current);
    setShow(false);
  };

  const tooltip =
    show && pos
      ? createPortal(
          <div
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y - 6,
              transform: "translate(-50%, -100%)",
              background: "#ffffff",
              color: "#334155",
              border: "1px solid #e2e8f0",
              fontSize: 11,
              fontWeight: 500,
              fontFamily: FONT_FAMILY,
              padding: "4px 8px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            {label}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ position: "relative", display: "inline-flex" }}
    >
      {children}
      {tooltip}
    </div>
  );
}
