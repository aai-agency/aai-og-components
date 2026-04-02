import type MapboxDraw from "@mapbox/mapbox-gl-draw";

export type DrawFeature = MapboxDraw.DrawFeature;

declare module "@mapbox/mapbox-gl-draw" {
  interface DrawModes {
    direct_polygon: MapboxDraw.DrawCustomMode;
    direct_rectangle: MapboxDraw.DrawCustomMode;
    direct_circle: MapboxDraw.DrawCustomMode;
  }
}

export interface DrawModeContext extends MapboxDraw.DrawCustomModeThis {
  _ctx?: {
    store?: {
      getState?: () => unknown;
      getInitialConfigValue?: (key: string) => unknown;
    };
  };
}

export interface DrawModeState {
  currentFeatureId?: string | null;
  isDrawing?: boolean;
  startPoint?: number[];
  center?: number[];
  rectangle?: DrawFeature;
  circle?: DrawFeature;
  polygon?: DrawFeature;
  endPoint?: number[];
  clickCount?: number;
  polygonCompleted?: boolean;
  rectangleCompleted?: boolean;
  circleCompleted?: boolean;
  radius?: number;
  isAdjusting?: boolean;
  currentVertexPosition?: number;
  lastDrawTime?: number;
  minDrawInterval?: number;
  minDistance?: number;
  lastPoint?: { x: number; y: number } | null;
}

export interface PolygonState extends DrawModeState {
  polygon: DrawFeature;
  currentVertexPosition: number;
  isDrawing: boolean;
  polygonCompleted: boolean;
  minDrawInterval: number;
  lastDrawTime: number;
  minDistance: number;
  lastPoint: { x: number; y: number } | null;
  clickCount: number;
}

export interface RectangleState extends DrawModeState {
  rectangle: DrawFeature;
  startPoint?: number[];
  endPoint?: number[];
  clickCount: number;
  rectangleCompleted: boolean;
  isAdjusting: boolean;
}

export interface CircleState extends DrawModeState {
  circle: DrawFeature;
  center?: number[];
  radius?: number;
  clickCount: number;
  circleCompleted: boolean;
}
