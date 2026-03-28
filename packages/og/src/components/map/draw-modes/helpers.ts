import type { DrawModeContext } from "./types";

export const doubleClickZoom = {
  enable: (ctx: DrawModeContext) => {
    setTimeout(() => {
      if (!ctx.map || !ctx.map.doubleClickZoom || !ctx._ctx || !ctx._ctx.store || !ctx._ctx.store.getInitialConfigValue)
        return;
      if (!ctx._ctx.store.getInitialConfigValue("doubleClickZoom")) return;
      ctx.map.doubleClickZoom.enable();
    }, 0);
  },
  disable(ctx: DrawModeContext) {
    setTimeout(() => {
      if (!ctx.map || !ctx.map.doubleClickZoom) return;
      ctx.map.doubleClickZoom.disable();
    }, 0);
  },
};
