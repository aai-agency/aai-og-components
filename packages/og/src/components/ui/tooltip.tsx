import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React from "react";
import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[100000] overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md",
        "animate-in fade-in-0 zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
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
