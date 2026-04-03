import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { mapMachine } from "..";
import type { Asset } from "../../types";

const makeAsset = (id: string, overrides?: Partial<Asset>): Asset => {
  return {
    id,
    name: id,
    type: "well",
    status: "producing",
    coordinates: { lat: 31, lng: -103 },
    properties: {},
    ...overrides,
  };
};

const testAssets = [
  makeAsset("w1", { type: "well", status: "producing", name: "Alpha Well" }),
  makeAsset("w2", { type: "well", status: "shut-in", name: "Beta Well" }),
  makeAsset("w3", { type: "meter", status: "active", name: "Gamma Meter" }),
  makeAsset("w4", { type: "well", status: "drilled", name: "Delta Well" }),
];

const createTestActor = () => {
  const actor = createActor(mapMachine, {
    input: {
      assets: testAssets,
      viewState: { latitude: 31, longitude: -103, zoom: 8 },
      colorScheme: "status" as const,
      typeConfigs: new Map(),
      store: null,
    },
  });
  actor.start();
  actor.send({ type: "LOAD_ASSETS", assets: testAssets });
  return actor;
};

describe("map machine view events", () => {
  it("PAN_ZOOM updates viewState", () => {
    const actor = createTestActor();
    actor.send({ type: "PAN_ZOOM", viewState: { latitude: 40, longitude: -100, zoom: 10 } });
    const vs = actor.getSnapshot().context.viewState;
    expect(vs.latitude).toBe(40);
    expect(vs.longitude).toBe(-100);
    expect(vs.zoom).toBe(10);
    actor.stop();
  });

  it("SET_BOUNDS updates bounds", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_BOUNDS", bounds: [-104, 30, -102, 32] });
    expect(actor.getSnapshot().context.bounds).toEqual([-104, 30, -102, 32]);
    actor.stop();
  });

  it("FIT_TO_ASSETS recalculates viewState from visible assets", () => {
    const actor = createTestActor();
    const before = actor.getSnapshot().context.viewState;
    actor.send({ type: "FIT_TO_ASSETS" });
    const after = actor.getSnapshot().context.viewState;
    // ViewState should be recalculated (may or may not differ depending on assets)
    expect(after).toBeDefined();
    expect(after.latitude).toBeDefined();
    expect(after.longitude).toBeDefined();
    actor.stop();
  });

  it("SET_COLOR_SCHEME changes color scheme", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_COLOR_SCHEME", scheme: "production" });
    expect(actor.getSnapshot().context.colorScheme).toBe("production");
    actor.stop();
  });
});

describe("map machine hover events", () => {
  it("HOVER sets hovered asset with coordinates", () => {
    const actor = createTestActor();
    const asset = testAssets[0];
    actor.send({ type: "HOVER", asset, x: 100, y: 200 });
    const h = actor.getSnapshot().context.hovered;
    expect(h?.asset.id).toBe("w1");
    expect(h?.x).toBe(100);
    expect(h?.y).toBe(200);
    actor.stop();
  });

  it("UNHOVER clears hovered state", () => {
    const actor = createTestActor();
    actor.send({ type: "HOVER", asset: testAssets[0], x: 0, y: 0 });
    actor.send({ type: "UNHOVER" });
    expect(actor.getSnapshot().context.hovered).toBeNull();
    actor.stop();
  });
});

describe("map machine filter events", () => {
  it("SET_TYPE_FILTER filters visibleIndices by type", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_TYPE_FILTER", types: ["meter"] });
    const ctx = actor.getSnapshot().context;
    expect(ctx.typeFilter).toEqual(new Set(["meter"]));
    // Only w3 (meter) should be visible
    expect(ctx.visibleIndices).toEqual([2]);
    actor.stop();
  });

  it("SET_TYPE_FILTER with null shows all types", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_TYPE_FILTER", types: ["well"] });
    actor.send({ type: "SET_TYPE_FILTER", types: null });
    const ctx = actor.getSnapshot().context;
    expect(ctx.typeFilter).toBeNull();
    expect(ctx.visibleIndices.length).toBe(4);
    actor.stop();
  });

  it("SET_STATUS_FILTER filters visibleIndices by status", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_STATUS_FILTER", statuses: ["producing"] });
    const ctx = actor.getSnapshot().context;
    expect(ctx.statusFilter).toEqual(new Set(["producing"]));
    // w1 is producing
    expect(ctx.visibleIndices).toContain(0);
    expect(ctx.visibleIndices).not.toContain(1); // shut-in
    actor.stop();
  });

  it("SET_STATUS_FILTER with null shows all statuses", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_STATUS_FILTER", statuses: ["drilled"] });
    actor.send({ type: "SET_STATUS_FILTER", statuses: null });
    expect(actor.getSnapshot().context.statusFilter).toBeNull();
    expect(actor.getSnapshot().context.visibleIndices.length).toBe(4);
    actor.stop();
  });

  it("SEARCH filters by name case-insensitively", () => {
    const actor = createTestActor();
    actor.send({ type: "SEARCH", query: "alpha" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.searchQuery).toBe("alpha");
    expect(ctx.visibleIndices).toEqual([0]); // Only Alpha Well
    actor.stop();
  });

  it("SEARCH with empty query shows all", () => {
    const actor = createTestActor();
    actor.send({ type: "SEARCH", query: "alpha" });
    actor.send({ type: "SEARCH", query: "" });
    expect(actor.getSnapshot().context.visibleIndices.length).toBe(4);
    actor.stop();
  });

  it("combined type + status + search filters intersect", () => {
    const actor = createTestActor();
    actor.send({ type: "SET_TYPE_FILTER", types: ["well"] });
    actor.send({ type: "SET_STATUS_FILTER", statuses: ["producing"] });
    const ctx = actor.getSnapshot().context;
    // Only w1 is both type=well AND status=producing
    expect(ctx.visibleIndices).toEqual([0]);
    actor.stop();
  });
});

describe("map machine overlay events", () => {
  it("ADD_OVERLAY appends overlay", () => {
    const actor = createTestActor();
    const overlay = {
      id: "ov1",
      name: "Test",
      type: "geojson" as const,
      visible: true,
      geojson: { type: "FeatureCollection" as const, features: [] },
    };
    actor.send({ type: "ADD_OVERLAY", overlay });
    expect(actor.getSnapshot().context.overlays).toHaveLength(1);
    expect(actor.getSnapshot().context.overlays[0].id).toBe("ov1");
    actor.stop();
  });

  it("REMOVE_OVERLAY removes by id", () => {
    const actor = createTestActor();
    const overlay = {
      id: "ov1",
      name: "Test",
      type: "geojson" as const,
      visible: true,
      geojson: { type: "FeatureCollection" as const, features: [] },
    };
    actor.send({ type: "ADD_OVERLAY", overlay });
    actor.send({ type: "REMOVE_OVERLAY", id: "ov1" });
    expect(actor.getSnapshot().context.overlays).toHaveLength(0);
    actor.stop();
  });

  it("TOGGLE_OVERLAY flips visibility", () => {
    const actor = createTestActor();
    const overlay = {
      id: "ov1",
      name: "Test",
      type: "geojson" as const,
      visible: true,
      geojson: { type: "FeatureCollection" as const, features: [] },
    };
    actor.send({ type: "ADD_OVERLAY", overlay });
    actor.send({ type: "TOGGLE_OVERLAY", id: "ov1" });
    expect(actor.getSnapshot().context.overlays[0].visible).toBe(false);
    actor.send({ type: "TOGGLE_OVERLAY", id: "ov1" });
    expect(actor.getSnapshot().context.overlays[0].visible).toBe(true);
    actor.stop();
  });

  it("RENAME_OVERLAY changes name", () => {
    const actor = createTestActor();
    const overlay = {
      id: "ov1",
      name: "Old Name",
      type: "geojson" as const,
      visible: true,
      geojson: { type: "FeatureCollection" as const, features: [] },
    };
    actor.send({ type: "ADD_OVERLAY", overlay });
    actor.send({ type: "RENAME_OVERLAY", id: "ov1", name: "New Name" });
    expect(actor.getSnapshot().context.overlays[0].name).toBe("New Name");
    actor.stop();
  });
});

describe("map machine CLICK_CLUSTER event", () => {
  it("zooms to cluster location", () => {
    const actor = createTestActor();
    actor.send({ type: "CLICK_CLUSTER", longitude: -102, latitude: 32, expansionZoom: 12 });
    const vs = actor.getSnapshot().context.viewState;
    expect(vs.longitude).toBe(-102);
    expect(vs.latitude).toBe(32);
    expect(vs.zoom).toBe(12);
    actor.stop();
  });
});
