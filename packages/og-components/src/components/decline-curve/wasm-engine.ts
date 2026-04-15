/**
 * Engine facade for decline curve math.
 *
 * The piecewise multi-equation model runs in TypeScript. Segment count is
 * typically small (<10) so per-point cost is dominated by the equation eval,
 * not dispatch. A WASM path for pure hyperbolic runs can be reintroduced
 * later if profiling shows it matters.
 */

import {
  type DeclineMathBuffers,
  type Segment,
  computeForecast as tsComputeForecast,
  computeVariance as tsComputeVariance,
  updateForecastAndVariance as tsUpdateForecastAndVariance,
} from "./decline-math";

let wasmReady = false;

export const initWasm = async (): Promise<boolean> => {
  // Piecewise model runs in TS only for now. Always returns false.
  return false;
};

export const isWasmReady = (): boolean => wasmReady;

export const engineComputeForecast = (buffers: DeclineMathBuffers, segments: Segment[]): Float64Array => {
  return tsComputeForecast(buffers, segments);
};

export const engineComputeVariance = (buffers: DeclineMathBuffers): void => {
  tsComputeVariance(buffers);
};

export const engineUpdateForecastAndVariance = (buffers: DeclineMathBuffers, segments: Segment[]): Float64Array => {
  return tsUpdateForecastAndVariance(buffers, segments);
};
