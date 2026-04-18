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

  it("bisecting with a flat segment still resumes the original curve", () => {
    const base = [hyperbolic({ tStart: 0 })];
    const { segments: next } = insertSegmentAt(base, 15, "flat", 5);
    const sorted = [...next].sort((a, b) => a.tStart - b.tStart);
    const resume = sorted[2];
    expect(resume.qiAnchored).toBe(true);
    expect(resume.params.qi).toBeCloseTo(evalAtTime(base, 20), 6);
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
