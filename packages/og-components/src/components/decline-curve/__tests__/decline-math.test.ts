import { describe, expect, it } from "vitest";
import {
  bendSegmentToTarget,
  computeForecast,
  createBuffers,
  evalAtTime,
  evalSegment,
  insertSegmentAt,
  nextSegmentId,
} from "../decline-math";
import type { Segment, SegmentParams } from "../decline-math";

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

describe("bendSegmentToTarget", () => {
  // Round-trip helper: solve for params, then check evalSegment lands on target.
  const verify = (
    eq: Segment["equation"],
    qiStart: number,
    targetEnd: number,
    dt: number,
    initialParams: Partial<SegmentParams> = {},
  ) => {
    const seg: Segment = {
      id: "x",
      tStart: 0,
      equation: eq,
      params: { qi: qiStart, di: 0.05, b: 0.9, slope: 0, ...initialParams },
    };
    return bendSegmentToTarget(seg, qiStart, targetEnd, dt);
  };

  it("exponential: bends di so qi · e^(−di·dt) = target", () => {
    const r = verify("exponential", 1000, 600, 30);
    expect(r).not.toBeNull();
    expect(r?.changedParam).toBe("di");
    const landed = evalSegment(r!.segment.equation, r!.segment.params, 30);
    expect(landed).toBeCloseTo(600, 6);
  });

  it("harmonic: bends di to land at target", () => {
    const r = verify("harmonic", 800, 200, 100);
    expect(r).not.toBeNull();
    expect(r?.changedParam).toBe("di");
    const landed = evalSegment("harmonic", r!.segment.params, 100);
    expect(landed).toBeCloseTo(200, 6);
  });

  it("hyperbolic: bends di while holding b fixed", () => {
    const r = verify("hyperbolic", 1500, 400, 365, { b: 0.85 });
    expect(r).not.toBeNull();
    expect(r?.changedParam).toBe("di");
    expect(r?.segment.params.b).toBe(0.85); // b untouched
    const landed = evalSegment("hyperbolic", r!.segment.params, 365);
    expect(landed).toBeCloseTo(400, 5);
  });

  it("stretchedExponential: bends di while holding n=b fixed", () => {
    const r = verify("stretchedExponential", 1000, 250, 200, { b: 0.6 });
    expect(r).not.toBeNull();
    expect(r?.changedParam).toBe("di");
    expect(r?.segment.params.b).toBe(0.6);
    const landed = evalSegment("stretchedExponential", r!.segment.params, 200);
    expect(landed).toBeCloseTo(250, 5);
  });

  it("linear: bends slope to land at target (any direction)", () => {
    const up = verify("linear", 100, 500, 40);
    expect(up).not.toBeNull();
    expect(up?.changedParam).toBe("slope");
    expect(evalSegment("linear", up!.segment.params, 40)).toBeCloseTo(500, 6);

    const down = verify("linear", 500, 100, 40);
    expect(down?.segment.params.slope).toBeLessThan(0);
    expect(evalSegment("linear", down!.segment.params, 40)).toBeCloseTo(100, 6);
  });

  it("flowback: bends slope (same shape as linear)", () => {
    const r = verify("flowback", 50, 1200, 60, { slope: 25 });
    expect(r).not.toBeNull();
    expect(r?.changedParam).toBe("slope");
    expect(evalSegment("flowback", r!.segment.params, 60)).toBeCloseTo(1200, 6);
  });

  it("flat / constrained / choked: only succeed when target ≈ qi", () => {
    expect(verify("flat", 800, 800, 30)?.changedParam).toBe("qi");
    expect(verify("constrained", 800, 800, 30)?.changedParam).toBe("qi");
    expect(verify("choked", 800, 800, 30)?.changedParam).toBe("qi");
    expect(verify("flat", 800, 600, 30)).toBeNull();
    expect(verify("constrained", 800, 600, 30)).toBeNull();
    expect(verify("choked", 800, 600, 30)).toBeNull();
  });

  it("shutIn: only succeeds when target ≈ 0", () => {
    expect(verify("shutIn", 0, 0, 5)).not.toBeNull();
    expect(verify("shutIn", 0, 100, 5)).toBeNull();
  });

  it("rejects targets that would require a negative decline rate", () => {
    // Target above qi for a decline equation can't be solved with di ≥ 0.
    expect(verify("exponential", 500, 800, 30)).toBeNull();
    expect(verify("harmonic", 500, 800, 30)).toBeNull();
    expect(verify("hyperbolic", 500, 800, 30)).toBeNull();
    expect(verify("stretchedExponential", 500, 800, 30)).toBeNull();
  });

  it("rejects non-positive targets for decline equations", () => {
    expect(verify("exponential", 1000, 0, 30)).toBeNull();
    expect(verify("hyperbolic", 1000, -50, 30)).toBeNull();
    expect(verify("stretchedExponential", 1000, 0, 30)).toBeNull();
  });

  it("rejects zero or negative dt", () => {
    expect(verify("exponential", 1000, 500, 0)).toBeNull();
    expect(verify("linear", 100, 500, -10)).toBeNull();
  });

  it("preserves segment id, equation, tStart, and other unrelated fields", () => {
    const seg: Segment = {
      id: "preserved",
      tStart: 42,
      equation: "hyperbolic",
      params: { qi: 1000, di: 0.05, b: 0.8, slope: 0 },
      qiAnchored: true,
      note: "keep me",
      color: "#abcdef",
    };
    const r = bendSegmentToTarget(seg, 1000, 400, 100);
    expect(r).not.toBeNull();
    expect(r?.segment.id).toBe("preserved");
    expect(r?.segment.tStart).toBe(42);
    expect(r?.segment.equation).toBe("hyperbolic");
    expect(r?.segment.qiAnchored).toBe(true);
    expect(r?.segment.note).toBe("keep me");
    expect(r?.segment.color).toBe("#abcdef");
    expect(r?.segment.params.b).toBe(0.8);
  });
});
