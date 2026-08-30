import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { FONT_FAMILY, PRIMARY, TEXT_FAINT, TEXT_HEADING, TEXT_MUTED, TEXT_SECONDARY } from "../../theme";
import { Tooltip } from "../ui/tooltip";
import type { AssetDimension, DrilldownPrimitive, DrilldownRecord } from "./asset-breakdown.types";

export interface RecordDrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  records: readonly DrilldownRecord[];
  /** Additional dynamic grouping/sorting keys read directly from `record.meta[key]`. */
  dimensions?: readonly AssetDimension[];
  defaultGroupBy?: string;
  defaultSortBy?: string;
  onRecordSelect?: (record: DrilldownRecord) => void;
}

const recordValue = (record: DrilldownRecord, key: string): DrilldownPrimitive => {
  if (key === "asset") return record.assetName ?? record.assetId ?? null;
  if (key === "date") return record.date ?? null;
  if (key === "value") return record.value ?? null;
  if (key === "label") return record.label;
  return record.meta?.[key] ?? null;
};

const compareRecords = (left: DrilldownRecord, right: DrilldownRecord, key: string): number => {
  const a = recordValue(left, key);
  const b = recordValue(right, key);
  if (typeof a === "number" && typeof b === "number") return b - a;
  return String(a ?? "").localeCompare(String(b ?? ""));
};

const valueLabel = (value: DrilldownPrimitive): string => (value == null || value === "" ? "Not set" : String(value));

export const RecordDrilldownDialog = ({
  open,
  onOpenChange,
  title,
  description,
  records,
  dimensions = [],
  defaultGroupBy = "asset",
  defaultSortBy = "date",
  onRecordSelect,
}: RecordDrilldownDialogProps) => {
  const [groupBy, setGroupBy] = useState(defaultGroupBy);
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const options = [
    { key: "asset", label: "Asset" },
    { key: "date", label: "Date" },
    { key: "value", label: "Value" },
    ...dimensions.map((dimension) => ({ key: dimension.key, label: dimension.label ?? dimension.key })),
  ];
  const grouped = useMemo(() => {
    const sorted = [...records].sort((left, right) => compareRecords(left, right, sortBy));
    const map = new Map<string, DrilldownRecord[]>();
    for (const record of sorted) {
      const label = valueLabel(recordValue(record, groupBy));
      const values = map.get(label) ?? [];
      values.push(record);
      map.set(label, values);
    }
    return Array.from(map).sort(([left], [right]) => left.localeCompare(right));
  }, [records, groupBy, sortBy]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(9, 9, 11, 0.45)" }} />
        <Dialog.Content
          style={{
            position: "fixed",
            zIndex: 71,
            top: "50%",
            left: "50%",
            width: "min(720px, calc(100vw - 28px))",
            maxHeight: "min(760px, calc(100vh - 28px))",
            transform: "translate(-50%, -50%)",
            overflow: "hidden",
            border: "1px solid #e4e4e7",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 24px 80px rgba(9, 9, 11, 0.24)",
            fontFamily: FONT_FAMILY,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "start",
              justifyContent: "space-between",
              gap: 12,
              padding: "16px 16px 12px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div>
              <Dialog.Title style={{ margin: 0, color: TEXT_HEADING, fontSize: 16 }}>{title}</Dialog.Title>
              <Dialog.Description style={{ margin: "4px 0 0", color: TEXT_MUTED, fontSize: 11 }}>
                {description ?? `${records.length} contributing record${records.length === 1 ? "" : "s"}`}
              </Dialog.Description>
            </div>
            <Tooltip label="Close drill-down">
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close drill-down"
                  style={{
                    display: "grid",
                    width: 30,
                    height: 30,
                    placeItems: "center",
                    border: 0,
                    borderRadius: 6,
                    background: "transparent",
                    color: TEXT_MUTED,
                    cursor: "pointer",
                  }}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </Tooltip>
          </header>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              padding: "10px 16px",
              borderBottom: "1px solid #f4f4f5",
              background: "#fafafa",
            }}
          >
            <label style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700 }}>
              GROUP BY
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.currentTarget.value)}
                style={{
                  display: "block",
                  minHeight: 31,
                  marginTop: 4,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  background: "#ffffff",
                  padding: "4px 28px 4px 8px",
                  color: TEXT_SECONDARY,
                }}
              >
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700 }}>
              SORT BY
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.currentTarget.value)}
                style={{
                  display: "block",
                  minHeight: 31,
                  marginTop: 4,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  background: "#ffffff",
                  padding: "4px 28px 4px 8px",
                  color: TEXT_SECONDARY,
                }}
              >
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
                <option value="label">Label</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: "min(590px, calc(100vh - 190px))", overflow: "auto", padding: 12 }}>
            {grouped.length === 0 ? (
              <div style={{ padding: 28, color: TEXT_FAINT, textAlign: "center" }}>No contributing records</div>
            ) : (
              grouped.map(([group, items]) => (
                <section key={group} style={{ marginBottom: 14 }}>
                  <h4
                    style={{
                      margin: "0 0 6px",
                      color: TEXT_FAINT,
                      fontSize: 10,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {group} · {items.length}
                  </h4>
                  <div style={{ display: "grid", gap: 5 }}>
                    {items.map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        disabled={!onRecordSelect}
                        onClick={() => onRecordSelect?.(record)}
                        title={onRecordSelect ? `Open ${record.label}` : undefined}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          gap: 10,
                          alignItems: "center",
                          padding: "9px 10px",
                          border: "1px solid #f0f0f1",
                          borderRadius: 7,
                          background: "#ffffff",
                          color: TEXT_SECONDARY,
                          cursor: onRecordSelect ? "pointer" : "default",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <strong
                            style={{
                              display: "block",
                              overflow: "hidden",
                              color: TEXT_HEADING,
                              fontSize: 12,
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {record.label}
                          </strong>
                          <small style={{ display: "block", marginTop: 2, color: TEXT_FAINT, fontSize: 10 }}>
                            {[record.assetName ?? record.assetId, record.date].filter(Boolean).join(" · ")}
                          </small>
                        </span>
                        {record.value != null ? (
                          <span style={{ color: PRIMARY, fontSize: 12, fontWeight: 700 }}>
                            {record.value.toLocaleString()} {record.unit}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

RecordDrilldownDialog.displayName = "RecordDrilldownDialog";
