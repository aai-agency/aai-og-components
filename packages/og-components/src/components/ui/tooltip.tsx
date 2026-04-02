import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React from "react";
import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const tooltipContentStyle: React.CSSProperties = {
  zIndex: 100000,
  overflow: "hidden",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "#fff",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "#0f172a",
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  lineHeight: 1.5,
  whiteSpace: "nowrap",
};

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      style={{ ...tooltipContentStyle, ...style }}
      className={className}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

/**
 * Convenience wrapper: wraps a child with a tooltip.
 *
 * Usage:
 *   <Tooltip label="Zoom In"><button>+</button></Tooltip>
 */
function Tooltip({
  label,
  children,
  side,
  sideOffset,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}) {
  return (
    <TooltipRoot delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side ?? "top"} sideOffset={sideOffset}>
        {label}
      </TooltipContent>
    </TooltipRoot>
  );
}

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent, Tooltip };
