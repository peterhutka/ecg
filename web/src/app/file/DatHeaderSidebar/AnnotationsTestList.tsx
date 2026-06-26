"use client";

import { Badge } from "@cloudscape-design/components";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { WFDBAnnotation } from "../../../lib/wfdb-atr";

type AnnotationsTestListProps = {
  annotations: WFDBAnnotation[];
  isLoading?: boolean;
  samplingRateHz?: number;
  selectedSample?: number | null;
  onSelectAnnotation?: (annotation: WFDBAnnotation) => void;
};

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 32;
const TABLE_COLUMNS = "72px 162px minmax(0, 1fr)";

function annotationLabel(annotation: WFDBAnnotation) {
  switch (annotation.symbol) {
    case "+":
      return "Beat (+)";
    case "/":
      return "Paced beat (/)";
    case "N":
      return "Normal beat (N)";
    case "V":
      return "PVC (V)";
    default:
      return `Annotation (${annotation.symbol})`;
  }
}

function annotationDescription(annotation: WFDBAnnotation) {
  switch (annotation.symbol) {
    case "+":
      return "Rhythm annotation marker from WFDB. Often marks a rhythm context or change point.";
    case "/":
      return "Paced beat annotation. In paced records, this marks a beat produced by the pacemaker.";
    case "N":
      return "Normal beat annotation.";
    case "V":
      return "Premature ventricular contraction annotation.";
    default:
      return `WFDB annotation symbol ${annotation.symbol}.`;
  }
}

function formatTime(sample: number, samplingRateHz?: number) {
  if (!samplingRateHz || !Number.isFinite(samplingRateHz) || samplingRateHz <= 0) {
    return "—";
  }

  const totalSeconds = sample / samplingRateHz;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds.toFixed(1)}s`);
  return parts.join(" ");
}

function formatCellValue(value: number | string | undefined) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function hasCellValue(value: number | string | undefined) {
  return value !== undefined && value !== null && value !== "";
}

function buildDetails(annotation: WFDBAnnotation) {
  const parts: string[] = [];

  if (hasCellValue(annotation.subtype)) {
    parts.push(`Subtype ${formatCellValue(annotation.subtype)}`);
  }
  if (hasCellValue(annotation.chan)) {
    parts.push(`Chan ${formatCellValue(annotation.chan)}`);
  }
  if (hasCellValue(annotation.num)) {
    parts.push(`Num ${formatCellValue(annotation.num)}`);
  }
  if (hasCellValue(annotation.auxNote)) {
    parts.push(`Aux ${formatCellValue(annotation.auxNote)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function AnnotationsTestList({
  annotations,
  isLoading,
  samplingRateHz,
  selectedSample,
  onSelectAnnotation,
}: AnnotationsTestListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: annotations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const statusText = isLoading
    ? "Loading annotations..."
    : annotations.length === 0
      ? "No annotations available."
      : `${annotations.length.toLocaleString()} rows`;

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-background-container-content)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px 8px",
          flexShrink: 0,
          borderBottom: "1px solid var(--color-border-divider-default)",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--color-text-body-secondary)" }}>{statusText}</div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: TABLE_COLUMNS,
          alignItems: "center",
          minWidth: 0,
          padding: "4px 16px 3px",
          background: "var(--color-background-container-content)",
          borderBottom: "1px solid var(--color-border-divider-default)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--color-text-body-secondary)",
          height: HEADER_HEIGHT,
          boxSizing: "border-box",
        }}
      >
        <div>Time</div>
        <div>Event</div>
        <div>Details</div>
      </div>

      <div
        ref={parentRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            minWidth: 0,
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const annotation = annotations[item.index];
            const details = annotationDescription(annotation);
            const isSelected = selectedSample === annotation.sample;

            return (
              <div
                key={item.key}
                onClick={() => onSelectAnnotation?.(annotation)}
                onKeyDown={(event) => {
                  if (!onSelectAnnotation) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectAnnotation(annotation);
                  }
                }}
                role={onSelectAnnotation ? "button" : undefined}
                tabIndex={onSelectAnnotation ? 0 : undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${item.start}px)`,
                  borderBottom: "1px solid var(--color-border-divider-default)",
                  padding: "3px 16px",
                  boxSizing: "border-box",
                  display: "grid",
                  gridTemplateColumns: TABLE_COLUMNS,
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  fontSize: 13,
                  background: isSelected ? "rgba(29, 78, 216, 0.12)" : "rgba(216, 220, 225, 0.12)",
                  cursor: onSelectAnnotation ? "pointer" : "default",
                  outline: "none",
                }}
              >
                <div
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--color-text-body-secondary)",
                  }}
                >
                  {formatTime(annotation.sample, samplingRateHz)}
                </div>
                <div style={{ width: "fit-content", justifySelf: "start" }}>
                  <Badge
                    color="blue"
                    nativeAttributes={{
                      title: details,
                      "aria-label": details,
                      style: {
                        fontSize: 12,
                      },
                    }}
                  >
                    {annotationLabel(annotation)}
                  </Badge>
                </div>
                <div
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--color-text-body-secondary)",
                  }}
                  title={annotation.auxNote ?? annotationDescription(annotation)}
                >
                  {buildDetails(annotation)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
