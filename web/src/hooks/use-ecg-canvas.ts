"use client";

import { useEffect, useRef } from "react";
import type { WFDBAnnotation } from "../lib/wfdb-atr";
import type { WFDBRhythmSpan } from "../lib/wfdb-atr";
import type { WFDBDecodedSignal } from "../lib/wfdb-dat";
import type { ECGSignalFilters, ECGViewport } from "../lib/ecg/ecg.types";
import { paintECGCanvas } from "./use-ecg-canvas-utils";

const EMPTY_ANNOTATIONS: WFDBAnnotation[] = [];

type UseEcgCanvasOptions = {
  backgroundColor?: string;
  lineColor?: string;
  guideColor?: string;
  signals?: WFDBDecodedSignal[];
  annotations?: WFDBAnnotation[];
  rhythmSpans?: WFDBRhythmSpan[];
  filters?: ECGSignalFilters | null;
  laneHeight?: number;
  viewport?: ECGViewport;
  selectedSample?: number | null;
};

export function useECGCanvas({
  backgroundColor = "#d9dce1",
  lineColor = "#c81e1e",
  guideColor = "#b1b6bf",
  signals = [],
  annotations = EMPTY_ANNOTATIONS,
  rhythmSpans,
  filters,
  laneHeight = 100,
  viewport,
  selectedSample = null,
}: UseEcgCanvasOptions = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintECGCanvas(context, rect, {
        backgroundColor,
        lineColor,
        guideColor,
        signals,
        annotations,
        rhythmSpans,
        filters,
        laneHeight,
        viewport,
        selectedSample,
      });
    };

    paint();

    const observer = new ResizeObserver(() => {
      paint();
    });

    observer.observe(canvas);
    window.addEventListener("resize", paint);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", paint);
    };
  }, [annotations, backgroundColor, filters, guideColor, laneHeight, lineColor, rhythmSpans, selectedSample, signals, viewport]);

  return canvasRef;
}
