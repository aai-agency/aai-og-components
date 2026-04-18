import { describe, expect, it } from "vitest";
import {
  computeForecast,
  createBuffers,
  evalAtTime,
  evalSegment,
  insertSegmentAt,
  nextSegmentId,
} from "../decline-math";
import type { Segment } from "../decline-math";

const hyperbolic = (overrides?: Partial<Segment>): Segment => ({
  id: nextSegmentId(),
  tStart: 0,
  equation: "hyperbolic",
  params: { qi: 1000, di: 0.06, b: 0.9, slope: 0 },
  ...overrides,
});

describe("evalSegment", () => {
  it("hyperbolic decline matches the formula", () => {
    const q = evalSegment("hyperbolic", { qi: 1000, di: 0.06, b: 0.9, slope: 0 }, 10);
    expect(q).toBeCloseTo(1000 / (1 + 0.9 * 0.06 * 10) ** (1 / 0.9), 6);
  });

  it("shutIn is always zero regardless of params", () => {
    expect(evalSegment("shutIn", { qi: 1000, di: 0.05, b: 1, slope: 0 }, 5)).toBe(0);
  });

  it("exponential decays", () => {
    const q = evalSegment("exponential", { qi: 500, di: 0.02, b: 0, slope: 0 }, 50);
    expect(q).toBeCloseTo(500 * Math.exp(-0.02 * 50), 6);
  });
});

describe("insertSegmentAt — resumption behavior is value-driven", () => {
  it("any insert ending at 0 anchors the resumption — regardless of equation name", () => {
    // Start on a flat at zero (simulates a well that's already offline, via
    // a custom-named equation or a Flat/Linear that evaluated to 0). When we
    // bisect with ANY equation whose end value is 0, the resumption should
    // anchor to the original projected value, not stay at 0.
    const base: Segment[] = [
      { id: "a", tStart: 0, equation: "flat", params: { qi: 0, di: 0, b: 0, slope: 0 } },
    ];
    // Insert another flat at t=5 with windowWidth=5 — flat at qi=0 ends at 0.
    const { segments: next } = insertSegmentAt(base, 5, "flat", 5);
    const sorted = [...next].sort((a, b) => a.tStart - b.tStart);
    expect(sorted).toHaveLength(3);
    const resume = sorted[2];
    // Resumption anchored even though the inserted equation wasn't named "shutIn"
    expect(resume.qiAnchored).toBe(true);
  });

  it("non-zero insert does NOT anchor — even for equations that historically would have", () => {
    // Exponential insert at a normal rate: end value is positive, so the
    // resumption should hand off continuously (no anchor). Confirms the
    // rule isn't keyed off anything but the end value.
    const base = [hyperbolic({ tStart: 0 })];
    const { segments: next } = insertSegmentAt(base, 10, "exponential", 5);
    const sorted = [...next].sort((a, b) => a.tStart - b.tStart);
    const resume = sorted[2];
    expect(resume.qiAnchored).toBeFalsy();
  });
});

describe("insertSegmentAt — shut-in bisect", () => {
  it("resumption segment inherits qi from the ORIGINAL curve (not the shut-in)", () => {
    const base = [hyperbolic({ tStart: 0 })];
    const { segments: next } = insertSegmentAt(base, 20, "shutIn", 10);
    const sorted = [...next].sort((a, b) => a.tStart - b.tStart);
    expect(sorted).toHaveLength(3);
    const [orig, shut, resume] = sorted;
    expect(orig.equation).toBe("hyperbolic");
    expect(shut.equation).toBe("shutIn");
    expect(shut.tStart).toBe(20);
    expect(resume.equation).toBe("hyperbolic");
    expect(resume.tStart).toBe(30);
    expect(resume.qiAnchored).toBe(true);
    const expectedQi = evalAtTime(base, 30);
    expect(resume.params.qi).toBeCloseTo(expectedQi, 6);
    expect(resume.params.qi).toBeGreaterThan(0);
  });

  it("computeForecast keeps the second half non-zero after a shut-in bisect", () => {
    const base = [hyperbolic({ tStart: 0 })];
    const { segments: next } = insertSegmentAt(base, 20, "shutIn", 10);

    const buffers = createBuffers(100);
    for (let i = 0; i < 100; i++) buffers.time[i] = i;
    computeForecast(buffers, next);

    for (let t = 0; t < 20; t++) expect(buffers.forecast[t]).toBeGreaterThan(0);
    for (let t = 20; t < 30; t++) expect(buffers.forecast[t]).toBe(0);
    for (let t = 30; t < 100; t++) expect(buffers.forecast[t]).toBeGreaterThan(0);

    const resumptionStart = buffers.forecast[30];
    const originalAt30 = evalAtTime(base, 30);
    expect(resumptionStart).toBeCloseTo(originalAt30, 4);
  });

  it("bisecting with a flat segment hands off continuously from the plateau", () => {
    // Flat plateau: holds qi for the window. Resumption should pick up at the
    // same qi the flat ended at (== where it started, since flat is constant),
    // not snap back to where the original hyperbolic would have been.
    const base = [hyperbolic({ tStart: 0 })];
    const qiAtInsert = evalAtTime(base, 15);
    const { segments: next } = insertSegmentAt(base, 15, "flat", 5);
    const sorted = [...next].sort((a, b) => a.tStart - b.tStart);
    const resume = sorted[2];
    expect(resume.qiAnchored).toBeFalsy();

    const buffers = createBuffers(50);
    for (let i = 0; i < 50; i++) buffers.time[i] = i;
    computeForecast(buffers, next);
    // Flat runs 15..20 at qiAtInsert, then hyperbolic resumes from that value.
    expect(buffers.forecast[20]).toBeCloseTo(qiAtInsert, 4);
  });

  it("bisecting with a flowback ramp hands off from the ramp's peak, no drop", () => {
    // Flowback ramps qi up via slope. The resumption must continue from the
    // ramped value — without this, Flowback visibly jumped back down to the
    // original curve at tEnd.
    const base = [hyperbolic({ tStart: 0 })];
    const qiAtInsert = evalAtTime(base, 15);
    const flowbackSlope = 25;
    const windowWidth = 8;
    const { segments: next } = insertSegmentAt(base, 15, "flowback", windowWidth);
    const sorted = [...next].sort((a, b) => a.tStart - b.tStart);
    expect(sorted).toHaveLength(3);
    const [, flow, resume] = sorted;
    expect(flow.equation).toBe("flowback");
    expect(resume.equation).toBe("hyperbolic");
    expect(resume.qiAnchored).toBeFalsy();

    const buffers = createBuffers(50);
    for (let i = 0; i < 50; i++) buffers.time[i] = i;
    computeForecast(buffers, next);
    const peak = qiAtInsert + flowbackSlope * windowWidth;
    // At the handoff t=23, the hyperbolic resumption starts at the flowback's peak.
    expect(buffers.forecast[23]).toBeCloseTo(peak, 4);
    // Before insert: original hyperbolic at t=22
    expect(buffers.forecast[22]).toBeCloseTo(qiAtInsert + flowbackSlope * 7, 4);
  });
});

describe("computeForecast — qiAnchored", () => {
  it("honors qiAnchored on non-first segments", () => {
    const segments: Segment[] = [
      { id: "a", tStart: 0, equation: "exponential", params: { qi: 1000, di: 0.01, b: 0, slope: 0 } },
      { id: "b", tStart: 50, equation: "shutIn", params: { qi: 0, di: 0, b: 0, slope: 0 }, qiAnchored: true },
      { id: "c", tStart: 60, equation: "exponential", params: { qi: 800, di: 0.01, b: 0, slope: 0 }, qiAnchored: true },
    ];
    const buffers = createBuffers(100);
    for (let i = 0; i < 100; i++) buffers.time[i] = i;
    computeForecast(buffers, segments);
    expect(buffers.forecast[50]).toBe(0);
    expect(buffers.forecast[60]).toBeCloseTo(800, 6);
    expect(buffers.forecast[70]).toBeCloseTo(800 * Math.exp(-0.01 * 10), 6);
  });

  it("non-anchored segments inherit C0-continuous qi", () => {
    const segments: Segment[] = [
      { id: "a", tStart: 0, equation: "exponential", params: { qi: 1000, di: 0.02, b: 0, slope: 0 } },
      { id: "b", tStart: 50, equation: "exponential", params: { qi: 0, di: 0.01, b: 0, slope: 0 } },
    ];
    const buffers = createBuffers(100);
    for (let i = 0; i < 100; i++) buffers.time[i] = i;
    computeForecast(buffers, segments);
    const handoffValue = 1000 * Math.exp(-0.02 * 50);
    expect(buffers.forecast[50]).toBeCloseTo(handoffValue, 6);
  });
});
