import type { DrawCustomMode } from "@mapbox/mapbox-gl-draw";
import { doubleClickZoom } from "./helpers";
import type { DrawModeContext, RectangleState } from "./types";

const DirectRectangleMode: DrawCustomMode = {
  onSetup: function (this: DrawModeContext): RectangleState {
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
      rectangle: feature,
      startPoint: undefined,
      endPoint: undefined,
      clickCount: 0,
      rectangleCompleted: false,
      isAdjusting: false,
    } as RectangleState;
  },

  onClick: function (state, e) {
    if (!state || !e || !e.lngLat) return;

    const shiftPressed = e.originalEvent?.shiftKey;

    if (shiftPressed && state.rectangleCompleted) {
      const feature = this.newFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[]] },
      });
      this.addFeature(feature);
      state.rectangle = feature;
      state.startPoint = undefined;
      state.endPoint = undefined;
      state.clickCount = 0;
      state.rectangleCompleted = false;
      state.isAdjusting = false;
    }

    state.clickCount = (state.clickCount || 0) + 1;

    if (state.rectangleCompleted && state.clickCount > 2 && !shiftPressed) {
      state.startPoint = undefined;
      state.endPoint = undefined;
      state.clickCount = 1;
      state.rectangleCompleted = false;
      state.isAdjusting = false;
    }

    if (state.clickCount === 1) {
      state.rectangle.coordinates = [[]];
      state.startPoint = [e.lngLat.lng, e.lngLat.lat];
      state.rectangle.updateCoordinate("0.0", e.lngLat.lng, e.lngLat.lat);
      return;
    }

    if (state.clickCount === 2 && state.startPoint) {
      this.updateUIClasses({ mouse: "pointer" });
      state.endPoint = [e.lngLat.lng, e.lngLat.lat];
      const startPoint = state.startPoint;
      const endPoint = state.endPoint;

      if (
        startPoint &&
        endPoint &&
        Array.isArray(startPoint) &&
        startPoint.length >= 2 &&
        Array.isArray(endPoint) &&
        endPoint.length >= 2 &&
        state.rectangle &&
        typeof state.rectangle.updateCoordinate === "function"
      ) {
        state.rectangle.updateCoordinate("0.0", startPoint[0], startPoint[1]);
        state.rectangle.updateCoordinate("0.1", endPoint[0], startPoint[1]);
        state.rectangle.updateCoordinate("0.2", endPoint[0], endPoint[1]);
        state.rectangle.updateCoordinate("0.3", startPoint[0], endPoint[1]);
        state.rectangle.updateCoordinate("0.4", startPoint[0], startPoint[1]);
      }

      state.rectangleCompleted = true;

      if (state.rectangle && typeof state.rectangle.toGeoJSON === "function") {
        this.map.fire("draw.create", { features: [state.rectangle.toGeoJSON()] });
      }
    }
  },

  onMouseMove: (state, e) => {
    if (!state || !e || !e.lngLat) return;
    if (state.startPoint && !state.endPoint && !state.rectangleCompleted) {
      const startPoint = state.startPoint;
      if (!startPoint || !Array.isArray(startPoint) || startPoint.length < 2) return;
      if (state.rectangle && typeof state.rectangle.updateCoordinate === "function") {
        state.rectangle.updateCoordinate("0.0", startPoint[0], startPoint[1]);
        state.rectangle.updateCoordinate("0.1", e.lngLat.lng, startPoint[1]);
        state.rectangle.updateCoordinate("0.2", e.lngLat.lng, e.lngLat.lat);
        state.rectangle.updateCoordinate("0.3", startPoint[0], e.lngLat.lat);
        state.rectangle.updateCoordinate("0.4", startPoint[0], startPoint[1]);
      }
    }
  },

  onKeyUp: function (state, e) {
    if (!state || !e) return;
    if (e.key === "Escape" || e.key === "Delete") {
      this.deleteFeature(state.rectangle.id);
      const feature = this.newFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[]] },
      });
      this.addFeature(feature);
      state.rectangle = feature;
      state.startPoint = undefined;
      state.endPoint = undefined;
      state.clickCount = 0;
      state.rectangleCompleted = false;
      state.isAdjusting = false;
    }
  },

  onStop: function (state) {
    if (!state) return;
    doubleClickZoom.enable(this);
    this.updateUIClasses({ mouse: "none" });
    this.activateUIButton();
    if (!state.rectangle || !state.rectangle.id || this.getFeature(String(state.rectangle.id)) === undefined) return;
    if (!state.rectangleCompleted) {
      if (state.rectangle.isValid && typeof state.rectangle.isValid === "function" && state.rectangle.isValid()) {
        if (typeof state.rectangle.toGeoJSON === "function") {
          this.map.fire("draw.create", { features: [state.rectangle.toGeoJSON()] });
        }
      } else {
        this.deleteFeature(String(state.rectangle.id));
      }
    }
  },

  onTrash: function (state) {
    if (!state) return;
    if (state.rectangle?.id) {
      this.deleteFeature(String(state.rectangle.id));
    }
    this.changeMode("simple_select");
  },

  toDisplayFeatures: (state, geojson, display) => {
    if (!state || !geojson || !display) {
      if (typeof display === "function" && geojson) display(geojson);
      return;
    }
    const geoJsonAny = geojson as unknown as Record<string, unknown>;
    const props = geoJsonAny.properties as Record<string, unknown> | undefined;
    const isActiveRectangle = state.rectangle?.id && props?.id === state.rectangle.id;
    if (props) {
      props.active = isActiveRectangle ? "true" : "false";
    }
    display(geojson);
  },
};

export { DirectRectangleMode };
