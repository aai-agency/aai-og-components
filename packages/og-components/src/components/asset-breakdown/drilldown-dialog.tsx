import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";

import { FONT_FAMILY, TEXT_HEADING, TEXT_MUTED } from "../../theme";

export interface DrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  size?: "standard" | "wide";
}

/** Shared accessible shell for charts, source records and host-provided breakdown content. */
export const DrilldownDialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "standard",
}: DrilldownDialogProps) => {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(9, 9, 11, 0.45)",
            backdropFilter: "blur(3px)",
          }}
        />
        <Dialog.Content
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
          style={{
            position: "fixed",
            zIndex: 71,
            top: "50%",
            left: "50%",
            width: `min(${size === "wide" ? 1160 : 720}px, calc(100vw - 28px))`,
            maxHeight: "calc(100dvh - 28px)",
            transform: "translate(-50%, -50%)",
            overflow: "auto",
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#ffffff",
            boxShadow: "0 24px 80px rgba(9, 9, 11, 0.24)",
            fontFamily: FONT_FAMILY,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "start",
              justifyContent: "space-between",
              gap: 12,
              padding: "20px 22px 16px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div>
              <Dialog.Title
                style={{ margin: 0, color: TEXT_HEADING, fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em" }}
              >
                {title}
              </Dialog.Title>
              <Dialog.Description style={{ margin: "5px 0 0", color: TEXT_MUTED, fontSize: 12 }}>
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close drill-down"
                title="Close drill-down"
                style={{
                  flexShrink: 0,
                  display: "grid",
                  width: 32,
                  height: 32,
                  placeItems: "center",
                  border: "1px solid #e4e4e7",
                  borderRadius: 7,
                  background: "white",
                  color: TEXT_MUTED,
                  cursor: "pointer",
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
