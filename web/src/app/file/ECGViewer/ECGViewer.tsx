"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { WFDBAnnotation } from "../../../lib/wfdb-atr";
import { buildWFDBRhythmSpans } from "../../../lib/wfdb-atr";
import type { WFDBDecodedRecord, WFDBDecodedSignal } from "../../../lib/wfdb-dat";
import { useECGCanvas } from "../../../hooks/use-ecg-canvas";
import type { ECGSignalFilters, ECGViewport } from "../../../lib/ecg/ecg.types";
import { ECG_CANVAS_LAYOUT } from "../../../hooks/use-ecg-canvas-utils";

const EMPTY_SIGNALS: WFDBDecodedSignal[] = [];
const EMPTY_ANNOTATIONS: WFDBAnnotation[] = [];
const TARGET_SECONDS = 20;
const TARGET_CANVAS_WIDTH = 1000;

function createViewport(
  decoded: WFDBDecodedRecord | null,
  signals: WFDBDecodedSignal[],
  startSample = 0,
): ECGViewport {
  const samplingRateHz = decoded?.header.samplingRateHz ?? 1;
  const signalViewport: ECGViewport["signals"] = Object.fromEntries(
    signals.map((signal) => [signal.name, { amplitudeScale: 1 }]),
  );

  return {
    time: {
      startSample,
      samplesPerPixel: (samplingRateHz * TARGET_SECONDS) / TARGET_CANVAS_WIDTH,
      samplingRateHz,
    },
    signals: signalViewport,
  };
}

function ECGViewer({
  decoded,
  annotations = [],
  includeAnnotations = false,
  amplitudeZoom = 1,
  filters = null,
  focusSample = null,
  focusRevision = 0,
  selectedSample = null,
}: {
  decoded: WFDBDecodedRecord | null;
  annotations?: WFDBAnnotation[];
  includeAnnotations?: boolean;
  amplitudeZoom?: number;
  filters?: ECGSignalFilters | null;
  focusSample?: number | null;
  focusRevision?: number;
  selectedSample?: number | null;
}) {
  const signals = useMemo(() => decoded?.signals ?? EMPTY_SIGNALS, [decoded]);
  const [startSample, setStartSample] = useState(0);
  const dragStateRef = useRef<{
    pointerId: number;
    lastX: number;
  } | null>(null);
  const startSampleRef = useRef(startSample);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    startSampleRef.current = startSample;
  }, [startSample]);

  const baseViewport = useMemo(() => createViewport(decoded, signals), [decoded, signals]);
  const viewport = useMemo<ECGViewport>(
    () => ({
      ...baseViewport,
      time: {
        ...baseViewport.time,
        startSample,
      },
      signals: Object.fromEntries(
        Object.entries(baseViewport.signals).map(([signalId, signal]) => [
          signalId,
          { amplitudeScale: signal.amplitudeScale * amplitudeZoom },
        ]),
      ),
    }),
    [amplitudeZoom, baseViewport, startSample],
  );

  const rhythmSpans = useMemo(() => {
    return buildWFDBRhythmSpans(annotations, decoded?.header.sampleCount);
  }, [annotations, decoded?.header.sampleCount]);

  const canvasRef = useECGCanvas({
    signals,
    annotations: includeAnnotations ? annotations : EMPTY_ANNOTATIONS,
    rhythmSpans,
    filters,
    laneHeight: ECG_CANVAS_LAYOUT.signalLaneHeight,
    viewport,
    selectedSample,
  });

  useEffect(() => {
    if (focusSample === null || !decoded) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const visibleSamples = rect.width * baseViewport.time.samplesPerPixel;
    const centeredStartSample = focusSample - visibleSamples / 2;
    const sampleCount = decoded.header.sampleCount ?? 0;
    const maxStartSample = Math.max(0, sampleCount - visibleSamples);
    const nextStartSample = Math.max(0, Math.min(centeredStartSample, maxStartSample));
    setStartSample(nextStartSample);
    startSampleRef.current = nextStartSample;
  }, [baseViewport.time.samplesPerPixel, canvasRef, decoded, focusRevision, focusSample]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const clampStartSample = (candidate: number) => {
      const sampleCount = decoded?.header.sampleCount ?? 0;
      const rect = canvas.getBoundingClientRect();
      const visibleSamples = rect.width * baseViewport.time.samplesPerPixel;
      const maxStartSample = Math.max(0, sampleCount - visibleSamples);

      return Math.max(0, Math.min(candidate, maxStartSample));
    };

    const scheduleStartSample = (candidate: number) => {
      startSampleRef.current = clampStartSample(candidate);

      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setStartSample(startSampleRef.current);
      });
    };

    const finishDrag = (pointerId: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) {
        return;
      }

      dragStateRef.current = null;
      canvas.style.cursor = "grab";
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
      };
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.lastX;
      dragState.lastX = event.clientX;
      const nextStartSample = startSampleRef.current - deltaX * baseViewport.time.samplesPerPixel;
      scheduleStartSample(nextStartSample);
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishDrag(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finishDrag(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [baseViewport.time.samplesPerPixel, canvasRef, decoded?.header.sampleCount]);

  return (
    <div
      style={{
        height:
          ECG_CANVAS_LAYOUT.topAxisHeight +
          Math.max(1, signals.length) * ECG_CANVAS_LAYOUT.signalLaneHeight +
          Math.max(0, signals.length - 1) * ECG_CANVAS_LAYOUT.signalLaneGap +
          ECG_CANVAS_LAYOUT.bottomPadding,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--color-border-divider-default)",
        background: "#d9dce1",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

export default memo(ECGViewer);
