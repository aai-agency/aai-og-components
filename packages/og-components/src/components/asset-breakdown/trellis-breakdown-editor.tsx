import { Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { COMPARISON_SERIES_COLORS } from "../../constants/colors";
import type { Asset } from "../../types";
import type { AssetDimension } from "./asset-breakdown.types";
import type { PreparedTrellis, TrellisState } from "./trellis.services";
import { trellisSelectionKey } from "./trellis.services";
import {
  customizeTrellisPanel,
  getTrellisGrouping,
  getTrellisIncludedAssets,
  regroupTrellis,
  setTrellisIncludedAssets,
} from "./trellis-breakdown.services";

const control =
  "rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

interface TrellisBreakdownEditorProps {
  /** Already restricted to the parent scope. */
  assets: readonly Asset[];
  dimensions: readonly AssetDimension[];
  value: TrellisState;
  prepared: PreparedTrellis;
  summary: string;
  onChange: (value: TrellisState) => void;
  onDone: () => void;
}

export const TrellisBreakdownEditor = ({
  assets,
  dimensions,
  value,
  prepared,
  summary,
  onChange,
  onDone,
}: TrellisBreakdownEditorProps) => {
  const [query, setQuery] = useState("");
  const [editingPanel, setEditingPanel] = useState<number | null>(null);
  const panelPrefix = useId();
  const nextPanel = useRef(0);
  const included = getTrellisIncludedAssets(assets, value);
  const includedIds = new Set(included.map((asset) => asset.id));
  // Freeze inclusion independently before customizing a panel or removing one.
  const state = { ...value, includedAssetIds: [...includedIds] };
  const grouping = getTrellisGrouping(value);
  const groupingValue = grouping.kind === "dimension" ? `meta:${grouping.dimensionKey}` : grouping.kind;
  const visibleAssets = assets.filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()));
  const unassigned = included.filter((asset) => !prepared.assetIds.includes(asset.id));
  const availableDimensions =
    grouping.kind === "dimension" && !dimensions.some((dimension) => dimension.key === grouping.dimensionKey)
      ? [...dimensions, { key: grouping.dimensionKey }]
      : dimensions;

  return (
    <section
      aria-label="Breakdown editor"
      className="border-b border-border bg-muted/30 px-[22px] py-4 text-foreground"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-semibold">Arrange your breakdown</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose the assets first, then decide which ones share a chart.
          </p>
        </div>
        <button
          type="button"
          title="Close the editor and view your charts"
          onClick={onDone}
          className={`${control} bg-primary text-primary-foreground`}
        >
          Done
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <details className="rounded-lg border border-border bg-background p-3">
          <summary
            className="cursor-pointer text-xs font-semibold"
            title="Choose which assets can appear in the breakdown"
          >
            1. Assets included{" "}
            <span className="ml-2 font-normal text-muted-foreground">
              {included.length} of {assets.length}
            </span>
          </summary>
          <input
            aria-label="Find included assets"
            placeholder="Find an asset…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className={`${control} mt-3 w-full`}
          />
          <div className="my-2 flex gap-2">
            <button
              type="button"
              title="Include every asset within the parent scope"
              className={control}
              onClick={() =>
                onChange(
                  setTrellisIncludedAssets(
                    assets,
                    state,
                    assets.map((asset) => asset.id),
                  ),
                )
              }
            >
              Select all assets
            </button>
            <button
              type="button"
              title="Exclude all assets from this breakdown"
              className={control}
              onClick={() => onChange(setTrellisIncludedAssets(assets, state, []))}
            >
              Clear assets
            </button>
          </div>
          <div className="grid max-h-44 gap-1 overflow-auto">
            {visibleAssets.map((asset) => (
              <label key={asset.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-2 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Include ${asset.name}`}
                  checked={includedIds.has(asset.id)}
                  onChange={() =>
                    onChange(
                      setTrellisIncludedAssets(
                        assets,
                        state,
                        includedIds.has(asset.id)
                          ? [...includedIds].filter((id) => id !== asset.id)
                          : [...includedIds, asset.id],
                      ),
                    )
                  }
                  className="accent-primary"
                />
                {asset.name}
              </label>
            ))}
            {visibleAssets.length === 0 && (
              <p className="text-xs text-muted-foreground">No assets match your search.</p>
            )}
          </div>
        </details>
        <div className="rounded-lg border border-border bg-background p-3">
          <label className="block text-xs font-semibold">
            2. Split panels by
            <select
              aria-label="Split panels by"
              title="Rebuild panels from the included assets using this grouping"
              value={groupingValue}
              onChange={(event) => {
                const choice = event.currentTarget.value;
                const next =
                  choice === "asset"
                    ? { kind: "asset" as const }
                    : choice === "custom"
                      ? { kind: "custom" as const }
                      : { kind: "dimension" as const, dimensionKey: choice.slice(5) };
                onChange(regroupTrellis(assets, state, next));
                setEditingPanel(null);
              }}
              className={`${control} mt-2 w-full font-normal`}
            >
              <option value="asset">Individual asset — one chart each</option>
              {availableDimensions
                .filter((dimension) => dimension.key !== "")
                .map((dimension) => (
                  <option key={dimension.key} value={`meta:${dimension.key}`}>
                    {dimension.label ?? dimension.key} — one chart per value
                  </option>
                ))}
              <option value="custom">Custom panels — choose members below</option>
            </select>
          </label>
          <p className="mb-0 mt-2 text-[11px] text-muted-foreground">
            Changing this rebuilds panels from the included assets.
          </p>
        </div>
      </div>
      <div className="mb-3 mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="m-0 text-xs font-semibold">3. Panel preview</h4>
          <p className="mb-0 mt-1 text-[11px] text-muted-foreground">
            {summary}.{" "}
            {value.layout === "overlay"
              ? "Each card becomes one series in the overlay."
              : "Each card below becomes one chart."}
          </p>
        </div>
        <button
          type="button"
          disabled={included.length === 0}
          title="Add a custom panel, then choose its members"
          className={`${control} inline-flex items-center gap-1.5`}
          onClick={() => {
            nextPanel.current += 1;
            setEditingPanel(value.selections.length);
            onChange({
              ...state,
              grouping: { kind: "custom" },
              selections: [
                ...state.selections,
                {
                  kind: "custom",
                  id: `${panelPrefix}.${nextPanel.current}`,
                  label: `Custom panel ${nextPanel.current}`,
                  assetIds: [],
                },
              ],
            });
          }}
        >
          <Plus size={13} aria-hidden="true" />
          Add panel
        </button>
      </div>
      {unassigned.length > 0 && (
        <p role="note" className="text-xs text-muted-foreground">
          {unassigned.length} included {unassigned.length === 1 ? "asset is" : "assets are"} not in a panel yet. Add a
          panel or customize its members below.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prepared.panels.map((panel, position) => {
          const index = value.selections.findIndex((selection) => trellisSelectionKey(selection) === panel.id);
          const selection = value.selections[index];
          const previewKey = `${index}:${selection?.kind === "custom" ? selection.id : panel.id}`;
          const expanded = editingPanel === index;
          const memberAssets = included.filter((asset) => panel.assetIds.includes(asset.id));
          return (
            <section
              key={previewKey}
              aria-label={`Panel ${position + 1}: ${panel.label}`}
              className="min-w-0 rounded-lg border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Panel {position + 1}
                    {selection?.kind === "custom" && " · custom"}
                  </span>
                  <h5 className="mb-0 mt-1 flex items-center gap-1.5 break-words text-xs font-semibold">
                    <span
                      aria-hidden="true"
                      style={{
                        background: COMPARISON_SERIES_COLORS[position % COMPARISON_SERIES_COLORS.length],
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        flexShrink: 0,
                      }}
                    />
                    {panel.label}
                  </h5>
                </div>
                <button
                  type="button"
                  aria-label={`Remove panel ${position + 1}`}
                  title={`Remove ${panel.label} without changing included assets`}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    onChange({
                      ...state,
                      grouping: { kind: "custom" },
                      selections: state.selections.filter((_, at) => at !== index),
                    });
                    setEditingPanel(null);
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
              <p className="mb-2 mt-2 text-[11px] font-medium">
                {memberAssets.length} {memberAssets.length === 1 ? "asset" : "assets"}
                {panel.series ? ` → 1 ${value.layout === "overlay" ? "series" : "chart"}` : " · no chart yet"}
              </p>
              <ul className="m-0 grid max-h-24 list-none gap-1 overflow-auto p-0 text-[11px] leading-4 text-muted-foreground">
                {memberAssets.map((asset) => (
                  <li key={asset.id} className="break-words">
                    {asset.name}
                  </li>
                ))}
              </ul>
              {memberAssets.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Choose members to draw this chart.</p>
              )}
              <button
                type="button"
                title={`Choose the assets combined in ${panel.label}`}
                aria-expanded={expanded}
                className={`${control} mt-3 w-full`}
                onClick={() => setEditingPanel(expanded ? null : index)}
              >
                {expanded ? "Hide members" : "Customize members"}
              </button>
              {expanded && (
                <fieldset className="mt-3 grid max-h-48 gap-1 overflow-auto border-0 p-0">
                  <legend className="mb-1 text-[11px] font-semibold">Members of this panel</legend>
                  {included.map((asset) => (
                    <label key={asset.id} className="flex cursor-pointer items-center gap-2 py-1.5 text-[11px]">
                      <input
                        type="checkbox"
                        aria-label={`Panel ${position + 1}: ${asset.name}`}
                        checked={panel.assetIds.includes(asset.id)}
                        onChange={() =>
                          onChange(
                            customizeTrellisPanel(
                              state,
                              index,
                              panel.label,
                              panel.assetIds.includes(asset.id)
                                ? panel.assetIds.filter((id) => id !== asset.id)
                                : [...panel.assetIds, asset.id],
                            ),
                          )
                        }
                        className="accent-primary"
                      />
                      {asset.name}
                    </label>
                  ))}
                </fieldset>
              )}
            </section>
          );
        })}
      </div>
      {prepared.panels.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-background p-5 text-center text-xs text-muted-foreground">
          No panels yet. Include assets and choose a grouping, or add a custom panel.
        </p>
      )}
    </section>
  );
};
