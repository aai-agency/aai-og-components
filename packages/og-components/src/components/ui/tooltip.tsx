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
        "z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md whitespace-nowrap animate-in fade-in-0 zoom-in-95",
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
const Tooltip = ({
  label,
  children,
  side,
  sideOffset,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}) => {
  return (
    <TooltipRoot delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side ?? "top"} sideOffset={sideOffset}>
        {label}
      </TooltipContent>
    </TooltipRoot>
  );
};

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent, Tooltip };
