"use client";

import {
  AppLayout,
  Box,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Slider,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import PathBreadcrumbs from "../../../components/PathBreadcrumbs/PathBreadcrumbs";
import type { ECGSignalFilters } from "../../../lib/ecg/ecg.types";
import { parseWFDBAtr } from "../../../lib/wfdb-atr-parser";
import { parseWFDBHeader } from "../../../lib/wfdb-header";
import { parseWFDBDat } from "../../../lib/wfdb-dat";
import { headerToFields, siblingAnnotationPath, siblingHeaderPath, signalToFields } from "../dat/dat-file-utils";
import DatHeaderSidebar from "../DatHeaderSidebar/DatHeaderSidebar";
import DatLoadStatus from "../DatLoadStatus/DatLoadStatus";
import ECGViewer from "../ECGViewer/ECGViewer";
import { useStreamFile } from "../../../hooks/use-stream-file";

function formatFilterSummary(filters: ECGSignalFilters | null) {
  if (!filters || (filters.highPassHz === undefined && filters.lowPassHz === undefined)) {
    return "Filters";
  }

  const parts = [];
  if (filters.highPassHz !== undefined) {
    parts.push(`HP ${filters.highPassHz} Hz`);
  }
  if (filters.lowPassHz !== undefined) {
    parts.push(`LP ${filters.lowPassHz} Hz`);
  }
  return `Filters · ${parts.join(" / ")}`;
}

export default function DatFileView({ path, size }: { path: string; size: number }) {
  const [toolsWidth, setToolsWidth] = useState(480);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [amplitudeZoom, setAmplitudeZoom] = useState(1);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<ECGSignalFilters | null>(null);
  const [draftFilters, setDraftFilters] = useState<ECGSignalFilters>({});
  const [highPassEnabled, setHighPassEnabled] = useState(false);
  const [lowPassEnabled, setLowPassEnabled] = useState(false);
  const [selectedAnnotationSample, setSelectedAnnotationSample] = useState<number | null>(null);
  const [annotationFocusRevision, setAnnotationFocusRevision] = useState(0);

  // Keep the details panel at roughly 40% of the viewport width.
  useEffect(() => {
    const updateToolsWidth = () => {
      setToolsWidth(Math.max(360, Math.round(window.innerWidth * 0.4)));
    };

    updateToolsWidth();
    window.addEventListener("resize", updateToolsWidth);
    return () => window.removeEventListener("resize", updateToolsWidth);
  }, []);

  useEffect(() => {
    setSelectedAnnotationSample(null);
    setAnnotationFocusRevision(0);
  }, [path]);

  useEffect(() => {
    if (!filtersModalOpen) {
      return;
    }

    const nextFilters = appliedFilters ?? { highPassHz: 0.5, lowPassHz: 40 };
    setDraftFilters(nextFilters);
    setHighPassEnabled(nextFilters.highPassHz !== undefined);
    setLowPassEnabled(nextFilters.lowPassHz !== undefined);
  }, [appliedFilters, filtersModalOpen]);

  const { data: headerText, isLoading: headerLoading } = useQuery<string>({
    queryKey: ["file-header", path],
    enabled: Boolean(path),
    queryFn: async () => {
      const response = await fetch(
        `http://127.0.0.1:8000/file/raw?path=${encodeURIComponent(siblingHeaderPath(path))}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load header");
      }
      return response.text();
    },
  });

  const { data: atrBytes, isLoading: annotationsLoading } = useQuery<Uint8Array | null>({
    queryKey: ["file-atr-bytes", path],
    enabled: Boolean(path),
    queryFn: async () => {
      const response = await fetch(
        `http://127.0.0.1:8000/file/raw?path=${encodeURIComponent(siblingAnnotationPath(path))}`,
      );
      if (!response.ok) {
        return null;
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  });

  const header = headerText ? parseWFDBHeader(headerText) : null;
  const heaFields = header ? headerToFields(header) : [];
  const heaSignals =
    header?.signals.map((signal) => ({
      file: signal.file,
      signalName: signal.signalName,
      fields: signalToFields(signal),
    })) ?? [];

  const { state: datState, bytes } = useStreamFile({
    enabled: Boolean(path),
    totalBytes: size,
    url: `http://127.0.0.1:8000/file/raw?path=${encodeURIComponent(path)}`,
  });

  const decoded = useMemo(() => {
    if (datState.status !== "loaded" || !headerText || !bytes) {
      return null;
    }

    const parsedHeader = parseWFDBHeader(headerText);
    if (!parsedHeader) {
      return null;
    }

    return parseWFDBDat(bytes, parsedHeader);
  }, [bytes, datState.status, headerText]);

  const parsedAtrResult = useMemo(() => {
    if (!atrBytes) {
      return { value: null, durationMs: null };
    }

    const value = parseWFDBAtr(atrBytes, path);
    return { value, durationMs: null };
  }, [atrBytes, path]);

  useEffect(() => {
    if (parsedAtrResult.value) {
      console.log(
        `Parsed ATR in ${parsedAtrResult.durationMs ?? 0}ms (${parsedAtrResult.value.annotations.length} annotations)`,
      );
    }
  }, [parsedAtrResult]);

  const handleSelectAnnotation = (sample: number) => {
    setSelectedAnnotationSample(sample);
    setAnnotationFocusRevision((current) => current + 1);
  };

  const applyFilters = () => {
    const nextFilters: ECGSignalFilters = {};
    if (highPassEnabled && draftFilters.highPassHz !== undefined) {
      nextFilters.highPassHz = draftFilters.highPassHz;
    }
    if (lowPassEnabled && draftFilters.lowPassHz !== undefined) {
      nextFilters.lowPassHz = draftFilters.lowPassHz;
    }
    setAppliedFilters(Object.keys(nextFilters).length > 0 ? nextFilters : null);
    setFiltersModalOpen(false);
  };

  if (!path) {
    return <Box padding="l">No file selected</Box>;
  }

  return (
    <AppLayout
      navigationHide
      toolsOpen={toolsOpen}
      toolsWidth={toolsWidth}
      onToolsChange={(event) => setToolsOpen(event.detail.open)}
      tools={
        <DatHeaderSidebar
          headerLoading={headerLoading}
          annotationsLoading={annotationsLoading}
          annotations={parsedAtrResult.value}
          samplingRateHz={header?.samplingRateHz}
          selectedAnnotationSample={selectedAnnotationSample}
          onSelectAnnotation={handleSelectAnnotation}
          headerExists={Boolean(header)}
          heaFields={heaFields}
          heaSignals={heaSignals}
        />
      }
      content={
        <Box padding="xs">
          <SpaceBetween size="s">
            <PathBreadcrumbs path={path} />

            <DatLoadStatus state={datState} />

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Checkbox
                checked={includeAnnotations}
                onChange={({ detail }) => setIncludeAnnotations(detail.checked)}
              >
                Include annotations
              </Checkbox>

              <Button onClick={() => setFiltersModalOpen(true)}>{formatFilterSummary(appliedFilters)}</Button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(140px, 180px)",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Box fontSize="body-s" color="text-body-secondary">
                Amplitude zoom
              </Box>
              <Slider
                value={amplitudeZoom}
                min={0.5}
                max={3}
                step={0.1}
                onChange={({ detail }) => setAmplitudeZoom(detail.value)}
                ariaLabel="Amplitude zoom"
                valueFormatter={(value) => `${value.toFixed(1)}x`}
              />
            </div>

            <ECGViewer
              decoded={decoded}
              annotations={parsedAtrResult.value?.annotations ?? []}
              includeAnnotations={includeAnnotations}
              filters={appliedFilters}
              amplitudeZoom={amplitudeZoom}
              focusSample={selectedAnnotationSample}
              focusRevision={annotationFocusRevision}
              selectedSample={selectedAnnotationSample}
            />

            <Modal
              visible={filtersModalOpen}
              onDismiss={() => setFiltersModalOpen(false)}
              header="ECG filters"
              closeAriaLabel="Close filters modal"
              footer={
                <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="link" onClick={() => setFiltersModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" onClick={applyFilters}>
                      Apply filters
                    </Button>
                  </SpaceBetween>
                </Box>
              }
            >
              <SpaceBetween size="m">
                <Box color="text-body-secondary">
                  Enable a filter with its checkbox, then adjust the cutoff value. The filters will only be applied
                  to the visible viewport.
                </Box>

                <FormField
                  label={
                    <Checkbox checked={highPassEnabled} onChange={({ detail }) => setHighPassEnabled(detail.checked)}>
                      High-pass
                    </Checkbox>
                  }
                  description="Removes baseline drift."
                >
                  <Input
                    type="number"
                    step={0.05}
                    value={String(draftFilters.highPassHz ?? 0.5)}
                    onChange={({ detail }) =>
                      setDraftFilters((current) => ({
                        ...current,
                        highPassHz: Number.parseFloat(detail.value),
                      }))
                    }
                    disabled={!highPassEnabled}
                    ariaLabel="High-pass cutoff in Hz"
                    inputMode="decimal"
                  />
                </FormField>

                <FormField
                  label={
                    <Checkbox checked={lowPassEnabled} onChange={({ detail }) => setLowPassEnabled(detail.checked)}>
                      Low-pass
                    </Checkbox>
                  }
                  description="Removes high-frequency noise."
                >
                  <Input
                    type="number"
                    step={1}
                    value={String(draftFilters.lowPassHz ?? 40)}
                    onChange={({ detail }) =>
                      setDraftFilters((current) => ({
                        ...current,
                        lowPassHz: Number.parseFloat(detail.value),
                      }))
                    }
                    disabled={!lowPassEnabled}
                    ariaLabel="Low-pass cutoff in Hz"
                    inputMode="decimal"
                  />
                </FormField>
              </SpaceBetween>
            </Modal>
          </SpaceBetween>
        </Box>
      }
    />
  );
}
