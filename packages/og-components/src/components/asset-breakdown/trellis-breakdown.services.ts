import type { Asset } from "../../types";
import { filterAssetsByScope, groupAssetsByMeta } from "./asset-breakdown.services";
import type { AssetScope } from "./asset-breakdown.types";
import {
  resolveTrellisAssets,
  type TrellisSelection,
  type TrellisState,
  trellisSelectionKey,
} from "./trellis.services";

export type TrellisGrouping = NonNullable<TrellisState["grouping"]>;

/** Old saved views infer their arrangement; mixed selections remain custom, never silently regrouped. */
export const getTrellisGrouping = (state: TrellisState): TrellisGrouping => {
  const requested = state.grouping;
  if (
    requested &&
    (requested.kind === "custom" ||
      state.selections.every((selection) =>
        requested.kind === "asset"
          ? selection.kind === "asset"
          : selection.kind === "dimension" && selection.dimensionKey === requested.dimensionKey,
      ))
  )
    return requested;
  if (state.selections.every((selection) => selection.kind === "asset")) return { kind: "asset" };
  const first = state.selections[0];
  if (
    first?.kind === "dimension" &&
    state.selections.every(
      (selection) => selection.kind === "dimension" && selection.dimensionKey === first.dimensionKey,
    )
  )
    return { kind: "dimension", dimensionKey: first.dimensionKey };
  return { kind: "custom" };
};

export const getTrellisIncludedAssets = (
  assets: readonly Asset[],
  state: TrellisState,
  scope?: AssetScope,
): Asset[] => {
  const ids = new Set(
    state.includedAssetIds ??
      state.selections.flatMap((selection) => resolveTrellisAssets(assets, selection, scope).map((asset) => asset.id)),
  );
  return filterAssetsByScope(assets, scope).filter((asset) => ids.has(asset.id));
};

const buildSelections = (
  assets: readonly Asset[],
  grouping: Exclude<TrellisGrouping, { kind: "custom" }>,
): TrellisSelection[] =>
  grouping.kind === "asset"
    ? assets.map((asset) => ({ kind: "asset", assetId: asset.id }))
    : groupAssetsByMeta(assets, { key: grouping.dimensionKey }).map((group) => ({
        kind: "dimension",
        dimensionKey: grouping.dimensionKey,
        value: group.value,
      }));

/** Replaces panel boundaries without changing inclusion. Never widens the parent scope. */
export const regroupTrellis = (
  assets: readonly Asset[],
  state: TrellisState,
  grouping: TrellisGrouping,
  scope?: AssetScope,
): TrellisState => {
  const included = getTrellisIncludedAssets(assets, state, scope);
  return {
    ...state,
    grouping,
    includedAssetIds: included.map((asset) => asset.id),
    selections: grouping.kind === "custom" ? state.selections : buildSelections(included, grouping),
  };
};

export const setTrellisIncludedAssets = (
  assets: readonly Asset[],
  state: TrellisState,
  assetIds: readonly string[],
  scope?: AssetScope,
): TrellisState => {
  const grouping = getTrellisGrouping(state);
  return regroupTrellis(assets, { ...state, includedAssetIds: [...assetIds] }, grouping, scope);
};

/** Single preparation boundary shared by preview, charts, counts and Apply. */
export const getTrellisPreparationScope = (
  assets: readonly Asset[],
  state: TrellisState,
  scope?: AssetScope,
): { scope: AssetScope; selections: TrellisSelection[] } => {
  const included = getTrellisIncludedAssets(assets, state, scope);
  return {
    scope: { ...scope, assetIds: included.map((asset) => asset.id) },
    selections: included.length === 0 ? [] : state.selections,
  };
};

export const customizeTrellisPanel = (
  state: TrellisState,
  index: number,
  label: string,
  assetIds: readonly string[],
): TrellisState => {
  const previous = state.selections[index];
  if (!previous) return state;
  return {
    ...state,
    grouping: { kind: "custom" },
    selections: state.selections.map((selection, position) =>
      position === index
        ? {
            kind: "custom",
            id: previous.kind === "custom" ? previous.id : trellisSelectionKey(previous),
            label,
            assetIds: [...new Set(assetIds)],
          }
        : selection,
    ),
  };
};

export const describeTrellisGrouping = (state: TrellisState): string => {
  const grouping = getTrellisGrouping(state);
  return grouping.kind === "asset"
    ? "one panel per asset"
    : grouping.kind === "dimension"
      ? `grouped by ${grouping.dimensionKey}`
      : "custom panels";
};
