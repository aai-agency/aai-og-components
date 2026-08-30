import { Columns3, Layers2, SlidersHorizontal } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useRef, useState } from "react";

import type { Asset, TimeSeries } from "../../types";
import { ChartGroup } from "../line-chart/chart-group";
import { filterAssetsByScope } from "./asset-breakdown.services";
import type { AssetDimension, AssetScope } from "./asset-breakdown.types";
import { DrilldownDialog } from "./drilldown-dialog";
import { prepareTrellis, type TrellisMetric, type TrellisState, trellisChartConfigs } from "./trellis.services";
import { describeTrellisGrouping, getTrellisPreparationScope } from "./trellis-breakdown.services";
import { TrellisBreakdownEditor } from "./trellis-breakdown-editor";

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 34,
  padding: "6px 10px",
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  background: "white",
  color: "#3f3f46",
  fontSize: 12,
  cursor: "pointer",
};
const selectStyle: CSSProperties = { ...buttonStyle, maxWidth: "100%", paddingRight: 24 };
const PAGE_SIZE = 12;

export interface AssetTrellisProps {
  assets: readonly Asset[];
  series: readonly TimeSeries[];
  metrics: readonly TrellisMetric[];
  scope?: AssetScope;
  /** Optional labels/allowlist. Omit to discover all direct metadata keys. */
  dimensions?: readonly AssetDimension[];
  value: TrellisState;
  onChange: (value: TrellisState) => void;
  /** Explicit commit. Empty selections are never applied because AssetScope [] means all assets. */
  onApplyScope?: (scope: AssetScope) => void;
}

/** Controlled comparison workspace built from existing ChartGroup panels. */
export const AssetTrellis = ({
  assets,
  series,
  metrics,
  scope,
  dimensions,
  value,
  onChange,
  onApplyScope,
}: AssetTrellisProps) => {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState(0);
  const scopedAssets = useMemo(() => filterAssetsByScope(assets, scope), [assets, scope]);
  const availableDimensions = useMemo(
    () =>
      dimensions ??
      Array.from(new Set(scopedAssets.flatMap((asset) => Object.keys(asset.meta ?? {}))))
        .sort()
        .map((key) => ({ key, label: key })),
    [scopedAssets, dimensions],
  );
  const metric = metrics.find((item) => item.id === value.metricId);
  const preparation = useMemo(() => getTrellisPreparationScope(assets, value, scope), [assets, value, scope]);
  const prepared = useMemo(
    () => prepareTrellis(assets, series, metric, preparation.selections, preparation.scope),
    [assets, series, metric, preparation],
  );
  const aggregationLabel = metric
    ? {
        sum: "summed within each panel",
        average: "averaged within each panel",
        min: "minimum within each panel",
        max: "maximum within each panel",
        first: "first source within each panel",
        last: "last source within each panel",
      }[metric.aggregation]
    : "choose a metric";
  const breakdownSummary = `${prepared.panels.length} panels · ${describeTrellisGrouping(value)} · ${aggregationLabel}`;
  const pageCount = Math.max(1, Math.ceil(prepared.panels.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visiblePanels =
    value.layout === "trellis"
      ? prepared.panels.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
      : prepared.panels;
  const chartSeries = visiblePanels.flatMap((panel) => (panel.series ? [panel.series] : []));
  const chartConfigs = metric ? trellisChartConfigs(visiblePanels, metric, value.layout) : [];
  return (
    <div style={{ color: "#3f3f46", fontSize: 12 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px 16px",
          padding: "14px 22px",
          borderBottom: "1px solid #f4f4f5",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
          Metric
          <select
            aria-label="Comparison metric"
            value={value.metricId}
            onChange={(event) => onChange({ ...value, metricId: event.currentTarget.value })}
            style={selectStyle}
          >
            {!metric && <option value={value.metricId}>Choose a metric</option>}
            {metrics.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          title="Choose included assets and how they form chart panels"
          aria-expanded={editing}
          ref={editButton}
          onClick={() => setEditing(!editing)}
          style={buttonStyle}
        >
          <SlidersHorizontal size={14} />
          Arrange panels
        </button>
        <fieldset
          aria-label="Comparison layout"
          style={{
            display: "flex",
            marginLeft: "auto",
            gap: 2,
            padding: 3,
            border: 0,
            minWidth: 0,
            borderRadius: 8,
            background: "#f4f4f5",
          }}
        >
          {(["trellis", "overlay"] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              aria-pressed={value.layout === layout}
              title={layout === "trellis" ? "Separate synchronized charts" : "Compare all series on one chart"}
              onClick={() => onChange({ ...value, layout })}
              style={{
                ...buttonStyle,
                minHeight: 28,
                border: "none",
                background: value.layout === layout ? "white" : "transparent",
                boxShadow: value.layout === layout ? "0 1px 3px #00000010" : undefined,
                fontWeight: value.layout === layout ? 600 : 400,
              }}
            >
              {layout === "trellis" ? <Columns3 size={14} /> : <Layers2 size={14} />}
              {layout === "trellis" ? "Trellis" : "Overlay"}
            </button>
          ))}
        </fieldset>
      </div>
      {editing && (
        <TrellisBreakdownEditor
          assets={scopedAssets}
          dimensions={availableDimensions}
          value={value}
          prepared={prepared}
          summary={breakdownSummary}
          onChange={(next) => {
            onChange(next);
            setPage(0);
          }}
          onDone={() => {
            setEditing(false);
            editButton.current?.focus();
          }}
        />
      )}
      <div style={{ padding: "16px 22px 20px", background: "#fcfcfd" }}>
        <div
          role="status"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 6,
            marginBottom: 14,
            color: "#71717a",
            fontSize: 11,
          }}
        >
          <span>
            <strong style={{ color: "#3f3f46", fontWeight: 600 }}>{breakdownSummary}</strong>
          </span>
          <span>
            {prepared.assetIds.length} unique assets ·{" "}
            {value.layout === "trellis" ? "Shared time · independent Y scales" : "Shared time and Y scale"}
          </span>
        </div>
        {prepared.overlapCount > 0 && (
          <p
            role="note"
            style={{
              margin: "0 0 14px",
              padding: "9px 12px",
              background: "#f4f4f5",
              borderRadius: 6,
              color: "#52525b",
              fontSize: 11,
            }}
          >
            {prepared.overlapCount} {prepared.overlapCount === 1 ? "asset appears" : "assets appear"} in more than one
            comparison. Panels are not additive; applying uses unique assets only.
          </p>
        )}
        {prepared.panels.some((panel) => panel.partialTimestampCount > 0) && (
          <p role="note" style={{ color: "#71717a", fontSize: 11 }}>
            Some comparisons have incomplete coverage. Values aggregate available observations only; missing
            observations are not treated as zero.
          </p>
        )}
        {prepared.issues.length > 0 ? (
          <div role="alert" style={{ padding: 24 }}>
            {prepared.issues.join(" ")}
          </div>
        ) : chartSeries.length > 0 ? (
          <ChartGroup
            key={`${value.metricId}.${value.layout}`}
            layout={value.layout === "trellis" ? "trellis" : "stack"}
            series={chartSeries}
            charts={chartConfigs}
            typography={{ legendFontSize: 11, legendFontWeight: 600 }}
          />
        ) : (
          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <strong>No panels to display</strong>
            <p style={{ color: "#71717a" }}>Choose assets or metadata groups with data in the current date range.</p>
            <button type="button" onClick={() => setEditing(true)} style={buttonStyle}>
              Arrange panels
            </button>
          </div>
        )}
        {prepared.issues.length === 0 && visiblePanels.some((panel) => !panel.series) && (
          <p style={{ color: "#71717a", fontSize: 11 }}>
            No data in this scope:{" "}
            {visiblePanels
              .filter((panel) => !panel.series)
              .map((panel) => panel.label)
              .join(", ")}
            .
          </p>
        )}
        {value.layout === "trellis" && pageCount > 1 && (
          <nav
            aria-label="Trellis pages"
            style={{ display: "flex", justifyContent: "end", alignItems: "center", gap: 12, marginTop: 14 }}
          >
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              style={buttonStyle}
            >
              Previous
            </button>
            <span>
              {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              style={buttonStyle}
            >
              Next
            </button>
          </nav>
        )}
      </div>
      <footer
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 22px",
          borderTop: "1px solid #e4e4e7",
        }}
      >
        <span style={{ color: "#71717a", fontSize: 11 }}>Exploring here does not change your overview.</span>
        {onApplyScope && (
          <button
            type="button"
            disabled={prepared.assetIds.length === 0 || prepared.issues.length > 0}
            onClick={() => {
              if (prepared.assetIds.length > 0 && prepared.issues.length === 0)
                onApplyScope({ ...scope, assetIds: [...prepared.assetIds] });
            }}
            style={{
              ...buttonStyle,
              background: "#18181b",
              borderColor: "#18181b",
              color: "white",
              opacity: prepared.assetIds.length === 0 || prepared.issues.length > 0 ? 0.4 : 1,
            }}
          >
            Apply to overview
          </button>
        )}
      </footer>
    </div>
  );
};

export interface TrellisDrilldownDialogProps extends Omit<AssetTrellisProps, "value" | "onChange"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Snapshotted on each open. Edits remain local until explicitly applied. */
  initialValue: TrellisState;
}
const TrellisDialogSession = ({
  initialValue,
  ...props
}: Omit<TrellisDrilldownDialogProps, "open" | "onOpenChange" | "title" | "description">) => {
  const [value, setValue] = useState(initialValue);
  return <AssetTrellis {...props} value={value} onChange={setValue} />;
};
export const TrellisDrilldownDialog = ({
  open,
  onOpenChange,
  title,
  description,
  ...props
}: TrellisDrilldownDialogProps) => (
  <DrilldownDialog
    open={open}
    onOpenChange={onOpenChange}
    title={title}
    description={description ?? "Explore the contributors within the current asset and date scope."}
    size="wide"
  >
    {open && (
      <TrellisDialogSession
        {...props}
        onApplyScope={
          props.onApplyScope
            ? (scope) => {
                props.onApplyScope?.(scope);
                onOpenChange(false);
              }
            : undefined
        }
      />
    )}
  </DrilldownDialog>
);
