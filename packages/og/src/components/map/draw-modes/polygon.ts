import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { doubleClickZoom } from "./helpers";
import type { DrawModeContext, PolygonState } from "./types";

const DirectPolygonMode: MapboxDraw.DrawCustomMode = {
  onSetup: function (this: DrawModeContext): PolygonState {
    const feature = this.newFeature({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[]] },
    });

    this.addFeature(feature);
    doubleClickZoom.disable(this);
    this.clearSelectedFeatures();
    this.updateUIClasses({ mouse: "add" });
    this.setActionableState({ trash: true, combineFeatures: false, uncombineFeatures: false });

    return {
      polygon: feature,
      currentVertexPosition: 0,
      isDrawing: false,
      polygonCompleted: false,
      minDrawInterval: 15,
      lastDrawTime: 0,
      minDistance: 3,
      lastPoint: null,
      clickCount: 0,
    } as PolygonState;
  },

  onClick: function (state, e) {
    const shiftPressed = e.originalEvent?.shiftKey;
    state.clickCount = (state.clickCount || 0) + 1;

    if (shiftPressed && state.polygonCompleted) {
      const feature = this.newFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[]] },
      });
      this.addFeature(feature);
      state.polygon = feature;
      state.currentVertexPosition = 0;
      state.isDrawing = true;
      state.polygonCompleted = false;
      state.lastPoint = e.point;
      state.lastDrawTime = Date.now();
      state.clickCount = 1;
      state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
      state.currentVertexPosition++;
      return;
    }

    if (state.clickCount > 2 && !shiftPressed) {
      state.polygon.coordinates = [[]];
      state.currentVertexPosition = 0;
      state.isDrawing = false;
      state.polygonCompleted = false;
      state.lastPoint = null;
      state.lastDrawTime = 0;
      state.clickCount = 1;
    }

    if (state.clickCount === 1) {
      state.isDrawing = true;
      state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
      state.currentVertexPosition++;
      state.lastPoint = e.point;
      state.lastDrawTime = Date.now();
      return;
    }

    if (state.clickCount === 2 && state.isDrawing) {
      if (state.currentVertexPosition >= 2) {
        state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
        state.currentVertexPosition++;
        const firstPoint = state.polygon.coordinates[0][0];
        state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, firstPoint[0], firstPoint[1]);
        state.polygonCompleted = true;
        state.isDrawing = false;
        this.map.fire("draw.create", { features: [state.polygon.toGeoJSON()] });
      } else {
        for (let i = 0; i < state.currentVertexPosition + 1; i++) {
          state.polygon.removeCoordinate(`0.${i}`);
        }
        state.currentVertexPosition = 0;
        state.isDrawing = false;
        state.clickCount = 0;
      }
    }
  },

  onMouseMove: (state, e) => {
    if (state.isDrawing && !state.polygonCompleted) {
      const now = Date.now();
      if (now - state.lastDrawTime >= state.minDrawInterval) {
        if (state.lastPoint) {
          const dx = e.point.x - state.lastPoint.x;
          const dy = e.point.y - state.lastPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= state.minDistance) {
            state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
            state.currentVertexPosition++;
            state.lastPoint = e.point;
            state.lastDrawTime = now;
          }
        }
      }
    }
  },

  onKeyUp: function (state, e) {
    if (e.key === "Escape" || e.key === "Delete") {
      this.deleteFeature(state.polygon.id);
      const feature = this.newFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[]] },
      });
      this.addFeature(feature);
      state.polygon = feature;
      state.currentVertexPosition = 0;
      state.isDrawing = false;
      state.polygonCompleted = false;
      state.lastPoint = null;
      state.lastDrawTime = 0;
      state.clickCount = 0;
    }
  },

  onStop: function (state) {
    doubleClickZoom.enable(this);
    this.updateUIClasses({ mouse: "none" });
    this.activateUIButton();
    if (this.getFeature(state.polygon.id) === undefined) return;
    if (!state.polygonCompleted && state.isDrawing) {
      if (state.currentVertexPosition >= 3) {
        const firstPoint = state.polygon.coordinates[0][0];
        state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, firstPoint[0], firstPoint[1]);
        this.map.fire("draw.create", { features: [state.polygon.toGeoJSON()] });
      } else {
        this.deleteFeature(state.polygon.id);
      }
    }
  },

  onTrash: function (state) {
    state.polygon.coordinates = [];
    state.currentVertexPosition = 0;
    state.isDrawing = false;
    state.polygonCompleted = false;
    state.lastPoint = null;
    state.lastDrawTime = 0;
    state.clickCount = 0;
    this.changeMode("simple_select");
  },

  toDisplayFeatures: (state, geojson, display) => {
    const geoJsonAny = geojson as unknown as Record<string, unknown>;
    const props = geoJsonAny.properties as Record<string, unknown> | undefined;
    const isActivePolygon = props?.id === state.polygon.id;
    if (props) {
      props.active = isActivePolygon ? "true" : "false";
    }
    display(geojson);
  },
};

export { DirectPolygonMode };
