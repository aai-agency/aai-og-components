import { DirectCircleMode } from "./circle";
import { DirectPolygonMode } from "./polygon";
import { DirectRectangleMode } from "./rectangle";

export const CustomDrawModes = {
  direct_polygon: DirectPolygonMode,
  direct_rectangle: DirectRectangleMode,
  direct_circle: DirectCircleMode,
};

export const CustomDrawModeKeys = {
  DIRECT_POLYGON: "direct_polygon",
  DIRECT_RECTANGLE: "direct_rectangle",
  DIRECT_CIRCLE: "direct_circle",
} as const;

export type { DrawModeContext, DrawModeState, PolygonState, RectangleState, CircleState, DrawFeature } from "./types";
