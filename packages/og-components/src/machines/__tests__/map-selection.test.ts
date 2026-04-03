import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { mapMachine } from "..";
import type { LassoOverlayFeature } from "..";
import type { Asset } from "../../types";

const makeAsset = (id: string): Asset => {
  return {
    id,
    name: id,
    type: "well",
    status: "producing",
    coordinates: { lat: 31, lng: -103 },
    properties: {},
  };
};

const testAssets = [makeAsset("w1"), makeAsset("w2"), makeAsset("w3"), makeAsset("w4")];

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
  // Transition from idle to ready
  actor.send({ type: "LOAD_ASSETS", assets: testAssets });
  return actor;
};

describe("map machine selection events", () => {
  it("SELECT replaces selection by default", () => {
    const actor = createTestActor();
    actor.send({ type: "SELECT", id: "w1" });
    expect(actor.getSnapshot().context.selectedIds).toEqual(new Set(["w1"]));

    actor.send({ type: "SELECT", id: "w2" });
    expect(actor.getSnapshot().context.selectedIds).toEqual(new Set(["w2"]));
    actor.stop();
  });

  it("SELECT with multi=true adds to selection", () => {
    const actor = createTestActor();
    actor.send({ type: "SELECT", id: "w1" });
    actor.send({ type: "SELECT", id: "w2", multi: true });
    expect(actor.getSnapshot().context.selectedIds).toEqual(new Set(["w1", "w2"]));
    actor.stop();
  });

  it("SELECT_MANY replaces entire selection", () => {
    const actor = createTestActor();
    actor.send({ type: "SELECT", id: "w1" });
    actor.send({ type: "SELECT_MANY", ids: ["w2", "w3"] });
    expect(actor.getSnapshot().context.selectedIds).toEqual(new Set(["w2", "w3"]));
    actor.stop();
  });

  it("SELECT_MANY with empty array clears selection", () => {
    const actor = createTestActor();
    actor.send({ type: "SELECT_MANY", ids: ["w1", "w2"] });
    actor.send({ type: "SELECT_MANY", ids: [] });
    expect(actor.getSnapshot().context.selectedIds).toEqual(new Set());
    actor.stop();
  });

  it("DESELECT removes a single id", () => {
    const actor = createTestActor();
    actor.send({ type: "SELECT_MANY", ids: ["w1", "w2", "w3"] });
    actor.send({ type: "DESELECT", id: "w2" });
    expect(actor.getSnapshot().context.selectedIds).toEqual(new Set(["w1", "w3"]));
    actor.stop();
  });

  it("CLEAR_SELECTION empties selection and lasso state", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: ["w1", "w2"], overlayFeatures: [] });
    actor.send({ type: "CLEAR_SELECTION" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedIds).toEqual(new Set());
    expect(ctx.showSelectionSummary).toBe(false);
    expect(ctx.lassoOverlayFeatures).toEqual([]);
    actor.stop();
  });
});

const mockOverlayFeature: LassoOverlayFeature = {
  overlayId: "ov1",
  overlayName: "Test Overlay",
  featureIndex: 0,
  properties: {},
  geometryType: "Point",
};

describe("map machine lasso events", () => {
  it("LASSO_SELECT sets selection and shows summary", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: ["w1", "w2"], overlayFeatures: [] });
    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedIds).toEqual(new Set(["w1", "w2"]));
    expect(ctx.showSelectionSummary).toBe(true);
    expect(ctx.lassoOverlayFeatures).toEqual([]);
    actor.stop();
  });

  it("LASSO_SELECT with additive=true merges with existing selection", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: ["w1", "w2"], overlayFeatures: [] });
    actor.send({ type: "LASSO_SELECT", ids: ["w3"], overlayFeatures: [mockOverlayFeature], additive: true });
    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedIds).toEqual(new Set(["w1", "w2", "w3"]));
    expect(ctx.lassoOverlayFeatures).toHaveLength(1);
    actor.stop();
  });

  it("LASSO_SELECT without additive replaces selection", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: ["w1", "w2"], overlayFeatures: [] });
    actor.send({ type: "LASSO_SELECT", ids: ["w3"], overlayFeatures: [] });
    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedIds).toEqual(new Set(["w3"]));
    actor.stop();
  });

  it("LASSO_CLEAR resets all lasso state", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: ["w1", "w2"], overlayFeatures: [mockOverlayFeature] });
    actor.send({ type: "LASSO_CLEAR" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.selectedIds).toEqual(new Set());
    expect(ctx.showSelectionSummary).toBe(false);
    expect(ctx.lassoOverlayFeatures).toEqual([]);
    actor.stop();
  });

  it("SELECT hides selection summary (switching from lasso to single select)", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: ["w1", "w2"], overlayFeatures: [] });
    expect(actor.getSnapshot().context.showSelectionSummary).toBe(true);
    actor.send({ type: "SELECT", id: "w1" });
    expect(actor.getSnapshot().context.showSelectionSummary).toBe(false);
    actor.stop();
  });

  it("LASSO_SELECT with empty ids and no overlay features hides summary", () => {
    const actor = createTestActor();
    actor.send({ type: "LASSO_SELECT", ids: [], overlayFeatures: [] });
    expect(actor.getSnapshot().context.showSelectionSummary).toBe(false);
    actor.stop();
  });
});
