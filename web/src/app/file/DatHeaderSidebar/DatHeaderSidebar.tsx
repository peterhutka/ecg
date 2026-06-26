"use client";

import { Box, SpaceBetween, Tabs } from "@cloudscape-design/components";
import { useState } from "react";
import type { WFDBDecodedAtr } from "../../../lib/wfdb-atr";
import type { HeaField } from "../dat/dat-file-utils";
import DatKeyValueRows from "../DatKeyValueRows/DatKeyValueRows";
import AnnotationsTestList from "./AnnotationsTestList";

type DatHeaderSidebarProps = {
  headerLoading: boolean;
  annotationsLoading: boolean;
  annotations: WFDBDecodedAtr | null;
  samplingRateHz?: number;
  selectedAnnotationSample?: number | null;
  onSelectAnnotation?: (sample: number) => void;
  headerExists: boolean;
  heaFields: HeaField[];
  heaSignals: Array<{
    file: string;
    signalName?: string;
    fields: HeaField[];
  }>;
};

export default function DatHeaderSidebar({
  headerLoading,
  annotationsLoading,
  annotations,
  samplingRateHz,
  selectedAnnotationSample,
  onSelectAnnotation,
  headerExists,
  heaFields,
  heaSignals,
}: DatHeaderSidebarProps) {
  const [sidebarTabId, setSidebarTabId] = useState("headers");

  const headersTab = (
    <div
      style={{
        minHeight: 0,
        flex: "1 1 0",
        overflow: "auto",
        padding: "0 16px 16px",
      }}
    >
      <SpaceBetween size="m">
        {headerLoading ? (
          <Box color="text-body-secondary">Loading header...</Box>
        ) : headerExists ? (
          <div
            style={{
              paddingTop: 8,
              borderTop: "1px solid var(--color-border-divider-default)",
            }}
          >
            <DatKeyValueRows fields={heaFields} />
            {heaSignals.length > 0 ? (
              <SpaceBetween size="s">
                <Box fontSize="heading-xs" fontWeight="bold">
                  Signals
                </Box>
                {heaSignals.map((signal, index) => (
                  <div
                    key={`${signal.file}-${signal.signalName ?? "signal"}-${index}`}
                    style={{
                      borderTop:
                        "1px solid var(--color-border-divider-default)",
                      paddingTop: 10,
                    }}
                  >
                    <SpaceBetween size="xs">
                      <Box fontSize="body-s" fontWeight="bold">
                        {signal.signalName ?? signal.file}
                      </Box>
                      <DatKeyValueRows fields={signal.fields} />
                    </SpaceBetween>
                  </div>
                ))}
              </SpaceBetween>
            ) : null}
          </div>
        ) : (
          <Box color="text-body-secondary">No header found.</Box>
        )}
      </SpaceBetween>
    </div>
  );

  const otherTab = (
    <div
      style={{
        minHeight: 0,
        flex: "1 1 0",
        overflow: "hidden",
        padding: "0 16px 16px",
      }}
    >
      <Box color="text-body-secondary">No other groups yet.</Box>
    </div>
  );

  const annotationsTab = (
    <div
      style={{
        height: "calc(100vh - 56px)",
        overflow: "hidden",
      }}
    >
      <AnnotationsTestList
        annotations={annotations?.annotations ?? []}
        isLoading={annotationsLoading}
        samplingRateHz={samplingRateHz}
        selectedSample={selectedAnnotationSample}
        onSelectAnnotation={
          onSelectAnnotation
            ? (annotation) => onSelectAnnotation(annotation.sample)
            : undefined
        }
      />
    </div>
  );

  return (
    <div
      style={{
        height: "100vh",
        maxHeight: "100vh",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Tabs
          fitHeight
          disableContentPaddings
          activeTabId={sidebarTabId}
          onChange={({ detail }) => setSidebarTabId(detail.activeTabId)}
          ariaLabel="Header sections"
          tabs={[
            {
              id: "headers",
              label: "Headers",
              content: headersTab,
            },
            {
              id: "annotations",
              label: "Annotations",
              content: annotationsTab,
            },
            {
              id: "other",
              label: "Other",
              content: otherTab,
            },
          ]}
        />
      </div>
    </div>
  );
}
