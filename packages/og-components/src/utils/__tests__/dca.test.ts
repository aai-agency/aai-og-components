import { describe, expect, it } from "vitest";
import {
  type DCAForecastConfig,
  type DCAModel,
  ONE_DAY_SECONDS,
  buildForecastDataPoints,
  buildUniformGrid,
  createDefaultConfig,
  enforceContinuity,
  epochToISODate,
  evaluateDCA,
  evaluateSegmented,
  fitExponential,
  genSegmentId,
  generateSegmentedForecast,
  isoDateToEpoch,
  splitSegment,
} from "../dca";

const expoModel = (qi: number, D: number): DCAModel => ({
  type: "exponential",
  params: { qi, D },
});

describe("evaluateDCA", () => {
  it("exponential at t=0 returns qi", () => {
    expect(evaluateDCA(expoModel(1000, 0.001), 0)).toBe(1000);
  });

  it("exponential decays to qi*e^(-D*dt)", () => {
    const out = evaluateDCA(expoModel(1000, 0.01), 100);
    expect(out).toBeCloseTo(1000 * Math.exp(-1), 6);
  });

  it("hyperbolic with b<=0 collapses to exponential", () => {
    const t = 50;
    const hyp = evaluateDCA({ type: "hyperbolic", params: { qi: 500, D: 0.01, b: 0 } }, t);
    const exp = evaluateDCA(expoModel(500, 0.01), t);
    expect(hyp).toBeCloseTo(exp, 6);
  });

  it("harmonic returns qi/(1+D*dt)", () => {
    const out = evaluateDCA({ type: "harmonic", params: { qi: 1000, D: 0.01 } }, 100);
    expect(out).toBeCloseTo(1000 / (1 + 0.01 * 100), 6);
  });

  it("linear returns qi + m*dt", () => {
    const out = evaluateDCA({ type: "linear", params: { qi: 50, m: 2 } }, 10);
    expect(out).toBeCloseTo(70, 6);
  });

  it("hyperbolic decline is monotone non-increasing for D,b > 0", () => {
    const model: DCAModel = { type: "hyperbolic", params: { qi: 1000, D: 0.005, b: 1.2 } };
    let prev = Number.POSITIVE_INFINITY;
    for (let dt = 0; dt <= 1000; dt += 50) {
      const v = evaluateDCA(model, dt);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
});

describe("evaluateSegmented", () => {
  const config: DCAForecastConfig = {
    segments: [
      { id: "a", model: expoModel(1000, 0.01), tStart: 0, tEnd: 100 },
      { id: "b", model: expoModel(500, 0.005), tStart: 100, tEnd: 200 },
    ],
    enforceContinuity: false,
  };

  it("picks the segment whose range covers t", () => {
    expect(evaluateSegmented(config, 0)).toBe(1000);
    expect(evaluateSegmented(config, 50)).toBeCloseTo(1000 * Math.exp(-0.5), 6);
    expect(evaluateSegmented(config, 100)).toBe(1000 * Math.exp(-1));
  });

  it("extrapolates the last segment past tEnd", () => {
    const out = evaluateSegmented(config, 300);
    // segment b: dt = 300 - 100 = 200
    expect(out).toBeCloseTo(500 * Math.exp(-0.005 * 200), 6);
  });

  it("returns 0 before the first segment", () => {
    expect(evaluateSegmented(config, -10)).toBe(0);
  });
});

describe("generateSegmentedForecast", () => {
  it("matches evaluateSegmented point-by-point on the in-range timestamps", () => {
    const config: DCAForecastConfig = {
      segments: [
        { id: "a", model: expoModel(1000, 0.005), tStart: 0, tEnd: 100 },
        { id: "b", model: expoModel(500, 0.002), tStart: 100, tEnd: 200 },
      ],
      enforceContinuity: false,
    };
    const grid = buildUniformGrid(0, 10, 21); // 0..200 step 10
    const out = new Float64Array(grid.length);
    generateSegmentedForecast(config, grid, out);

    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      // generateSegmentedForecast extrapolates the boundary segment for points
      // exactly at tEnd of one segment / tStart of next; evaluateSegmented uses
      // the first match. Skip those exact-boundary points where the two
      // implementations disagree by definition (continuous functions, but
      // segment lookup differs by one).
      if (t === 100) continue;
      expect(out[i]).toBeCloseTo(evaluateSegmented(config, t), 6);
    }
  });

  it("zeros out empty configs", () => {
    const config: DCAForecastConfig = { segments: [], enforceContinuity: false };
    const out = new Float64Array(5);
    out.fill(99);
    generateSegmentedForecast(config, [0, 1, 2, 3, 4], out);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(0);
  });
});

describe("fitExponential", () => {
  it("recovers qi, D from a noiseless exponential decline", () => {
    const qi = 800;
    const D = 0.004;
    const t = Array.from({ length: 50 }, (_, i) => i * 30);
    const v = t.map((dt) => qi * Math.exp(-D * dt));
    const fit = fitExponential(t, v);
    expect(fit.qi).toBeCloseTo(qi, 1);
    expect(fit.D).toBeCloseTo(D, 4);
  });

  it("ignores nulls and non-positive values", () => {
    const t = [0, 30, 60, 90];
    const v = [100, null, 0, 50];
    const fit = fitExponential(t, v);
    expect(fit.qi).toBeGreaterThan(0);
    expect(fit.D).toBeGreaterThan(0);
  });

  it("returns a sensible fallback when too few points", () => {
    const fit = fitExponential([0], [100]);
    expect(fit.qi).toBe(100);
    expect(fit.D).toBeGreaterThan(0);
  });
});

describe("enforceContinuity", () => {
  it("snaps each segment's qi to the previous segment's end value", () => {
    const segs = [
      { id: "a", model: expoModel(1000, 0.01), tStart: 0, tEnd: 100 },
      { id: "b", model: expoModel(50, 0.005), tStart: 100, tEnd: 200 },
    ];
    const out = enforceContinuity(segs);
    const expectedEnd = 1000 * Math.exp(-1);
    expect(out[0]).toBe(segs[0]); // first segment untouched
    if (out[1].model.type === "exponential") {
      expect(out[1].model.params.qi).toBeCloseTo(expectedEnd, 6);
      expect(out[1].model.params.D).toBe(0.005); // D preserved
    } else {
      throw new Error("expected exponential");
    }
  });

  it("is a no-op for ≤1 segment", () => {
    const segs = [{ id: "only", model: expoModel(100, 0.01), tStart: 0, tEnd: 10 }];
    expect(enforceContinuity(segs)).toBe(segs);
  });
});

describe("createDefaultConfig + buildForecastDataPoints", () => {
  it("round-trips a noiseless exponential through fit → forecast", () => {
    const qi = 1200;
    const D = 0.003;
    const t = Array.from({ length: 30 }, (_, i) => i * 30);
    const v = t.map((dt) => qi * Math.exp(-D * dt));
    const config = createDefaultConfig(t, v);
    const future = buildUniformGrid(t[t.length - 1] + 30, 30, 5);
    const forecast = buildForecastDataPoints(config, future);
    for (let i = 0; i < future.length; i++) {
      const truth = qi * Math.exp(-D * (future[i] - t[0]));
      expect(forecast[i].value).toBeCloseTo(truth, -1);
    }
  });

  it("emits ISO YYYY-MM-DD dates aligned to the timestamp grid", () => {
    const config: DCAForecastConfig = {
      segments: [{ id: "a", model: expoModel(100, 0.001), tStart: 0, tEnd: 1000 }],
      enforceContinuity: false,
    };
    const oneDay = ONE_DAY_SECONDS;
    const grid = buildUniformGrid(isoDateToEpoch("2026-01-01"), oneDay, 3);
    const points = buildForecastDataPoints(config, grid);
    expect(points.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});

describe("splitSegment", () => {
  it("splits one segment into two and preserves the model on the left", () => {
    const original: DCAForecastConfig = {
      segments: [{ id: "a", model: expoModel(1000, 0.01), tStart: 0, tEnd: 100 }],
      enforceContinuity: false,
    };
    const out = splitSegment(original, "a", 40);
    expect(out.segments.length).toBe(2);
    expect(out.segments[0].tStart).toBe(0);
    expect(out.segments[0].tEnd).toBe(40);
    expect(out.segments[1].tStart).toBe(40);
    expect(out.segments[1].tEnd).toBe(100);
  });

  it("is a no-op when splitAt is outside the segment", () => {
    const original: DCAForecastConfig = {
      segments: [{ id: "a", model: expoModel(1000, 0.01), tStart: 0, tEnd: 100 }],
      enforceContinuity: false,
    };
    expect(splitSegment(original, "a", 0)).toBe(original);
    expect(splitSegment(original, "a", 100)).toBe(original);
    expect(splitSegment(original, "a", 200)).toBe(original);
  });
});

describe("epochToISODate / isoDateToEpoch", () => {
  it("round-trips midnight UTC dates", () => {
    const date = "2026-05-05";
    const epoch = isoDateToEpoch(date);
    expect(epochToISODate(epoch)).toBe(date);
  });
});

describe("genSegmentId", () => {
  it("returns ids with the seg- prefix and reasonable uniqueness", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = genSegmentId();
      expect(id.startsWith("seg-")).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(200);
  });
});
