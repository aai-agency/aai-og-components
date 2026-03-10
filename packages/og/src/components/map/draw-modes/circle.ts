import type { DrawModeContext, CircleState } from "./types";
import type { DrawCustomMode } from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import { doubleClickZoom } from "./helpers";

const DirectCircleMode: DrawCustomMode = {
  onSetup: function (this: DrawModeContext): CircleState {
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
      circle: feature,
      center: undefined,
      radius: undefined,
      clickCount: 0,
      circleCompleted: false,
    } as CircleState;
  },

  onClick: function (state, e) {
    const shiftPressed = e.originalEvent && e.originalEvent.shiftKey;
    state.clickCount = (state.clickCount || 0) + 1;

    if (shiftPressed && state.circleCompleted) {
      const feature = this.newFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[]] },
      });
      this.addFeature(feature);
      state.circle = feature;
      state.center = undefined;
      state.radius = undefined;
      state.clickCount = 1;
      state.circleCompleted = false;
      state.center = [e.lngLat.lng, e.lngLat.lat];
      const tinyCircle = turf.circle(state.center, 0.001, { steps: 64, units: "kilometers" });
      const coordinates = tinyCircle.geometry.coordinates[0];
      for (let i = 0; i < coordinates.length; i++) {
        state.circle.updateCoordinate(`0.${i}`, coordinates[i][0], coordinates[i][1]);
      }
      return;
    }

    if ((state.circleCompleted || state.clickCount > 2) && !shiftPressed) {
      state.circle.coordinates = [[]];
      state.center = [];
      state.radius = undefined;
      state.clickCount = 1;
      state.circleCompleted = false;
    }

    if (state.clickCount === 1) {
      state.center = [e.lngLat.lng, e.lngLat.lat];
      const tinyCircle = turf.circle(state.center, 0.001, { steps: 64, units: "kilometers" });
      const coordinates = tinyCircle.geometry.coordinates[0];
      for (let i = 0; i < coordinates.length; i++) {
        state.circle.updateCoordinate(`0.${i}`, coordinates[i][0], coordinates[i][1]);
      }
      return;
    }

    if (state.clickCount === 2 && state.center) {
      const center = turf.point(state.center);
      const radiusPoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
      const radius = turf.distance(center, radiusPoint, { units: "kilometers" });
      const effectiveRadius = Math.max(radius, 0.001);
      const circleFeature = turf.circle(state.center, effectiveRadius, { steps: 64, units: "kilometers" });
      const coordinates = circleFeature.geometry.coordinates[0];
      for (let i = 0; i < coordinates.length; i++) {
        state.circle.updateCoordinate(`0.${i}`, coordinates[i][0], coordinates[i][1]);
      }
      state.circleCompleted = true;
      this.map.fire("draw.create", { features: [state.circle.toGeoJSON()] });
    }
  },

  onMouseMove: function (state, e) {
    if (state.center && state.clickCount === 1 && !state.circleCompleted) {
      const center = turf.point(state.center);
      const radiusPoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
      const radius = turf.distance(center, radiusPoint, { units: "kilometers" });
      const circleFeature = turf.circle(state.center, radius, { steps: 64, units: "kilometers" });
      const coordinates = circleFeature.geometry.coordinates[0];
      for (let i = 0; i < coordinates.length; i++) {
        state.circle.updateCoordinate(`0.${i}`, coordinates[i][0], coordinates[i][1]);
      }
    }
  },

  onKeyUp: function (state, e) {
    if (e.key === "Escape" || e.key === "Delete") {
      this.deleteFeature(state.circle.id);
      const feature = this.newFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[]] },
      });
      this.addFeature(feature);
      state.circle = feature;
      state.center = undefined;
      state.radius = undefined;
      state.clickCount = 0;
      state.circleCompleted = false;
    }
  },

  onStop: function (state) {
    doubleClickZoom.enable(this);
    this.updateUIClasses({ mouse: "none" });
    this.activateUIButton();
    if (this.getFeature(String(state.circle.id)) === undefined) return;
    if (!state.circleCompleted) {
      if (state.circle.isValid && state.circle.isValid()) {
        this.map.fire("draw.create", { features: [state.circle.toGeoJSON()] });
      } else {
        this.deleteFeature(String(state.circle.id));
      }
    }
  },

  onTrash: function (state) {
    if (state.circle && state.circle.id) {
      this.deleteFeature(String(state.circle.id));
    }
    const feature = this.newFeature({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[]] },
    });
    this.addFeature(feature);
    state.circle = feature;
    state.center = undefined;
    state.radius = undefined;
    state.clickCount = 0;
    state.circleCompleted = false;
  },

  toDisplayFeatures: function (state, geojson, display) {
    const geoJsonAny = geojson as unknown as Record<string, unknown>;
    const props = geoJsonAny.properties as Record<string, unknown> | undefined;
    const isActiveCircle = props?.id === state.circle.id;
    if (props) {
      props.active = isActiveCircle ? "true" : "false";
    }
    display(geojson);
  },
};

export { DirectCircleMode };
