import type { ECGSignalFilters, ECGViewport } from "../lib/ecg/ecg.types";
import type { WFDBAnnotation, WFDBRhythmSpan } from "../lib/wfdb-atr";
import type { WFDBDecodedSignal } from "../lib/wfdb-dat";
import { buildTimeAxisTicks } from "../lib/ecg/ecg-axis";

export const ECG_CANVAS_LAYOUT = {
  topAxisHeight: 28,
  leftAxisWidth: 56,
  signalLaneHeight: 150,
  signalLaneGap: 8,
  bottomPadding: 16,
  milliVoltLabelPaddingPx: 12,
  plotBackground: "#d9dce1",
  gutterBackground: "#e6e9ee",
  guideColor: "#aab2be",
  majorGridColor: "#b1b9c6",
  minorGridColor: "#c8cfdb",
  axisTextColor: "#4b5563",
  waveformColor: "#c81e1e",
  annotationColor: "#1d4ed8",
} as const;

export type ECGCanvasPaintOptions = {
  backgroundColor: string;
  lineColor: string;
  guideColor: string;
  signals: WFDBDecodedSignal[];
  annotations?: WFDBAnnotation[];
  rhythmSpans?: WFDBRhythmSpan[];
  filters?: ECGSignalFilters | null;
  laneHeight: number;
  viewport?: ECGViewport;
  selectedSample?: number | null;
};

function getVisibleWindow(samples: number[], startSample: number, endSample: number) {
  const start = Math.max(0, startSample);
  const end = Math.min(endSample, samples.length);
  return samples.slice(start, end);
}

function getWaveformStride(samplesPerPixel: number) {
  return Math.max(1, Math.floor(samplesPerPixel));
}

function alignStartSample(startSample: number, stride: number) {
  const normalizedStart = Math.max(0, Math.floor(startSample));
  const remainder = normalizedStart % stride;
  return remainder === 0 ? normalizedStart : normalizedStart + (stride - remainder);
}

function getEffectiveGain(signal: WFDBDecodedSignal) {
  // WFDB treats gain 0/missing as uncalibrated; default to 200 for display.
  return Number.isFinite(signal.gain) && signal.gain > 0 ? signal.gain : 200;
}

function sampleToMilliVolts(signal: WFDBDecodedSignal, sampleValue: number) {
  return (sampleValue - signal.adcZero) / getEffectiveGain(signal);
}

function applyLowPassFilter(samples: number[], samplingRateHz: number, cutoffHz: number) {
  if (samples.length === 0) {
    return samples;
  }
  if (!Number.isFinite(samplingRateHz) || samplingRateHz <= 0 || !Number.isFinite(cutoffHz) || cutoffHz <= 0) {
    return samples;
  }

  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / samplingRateHz;
  const alpha = dt / (rc + dt);
  const filtered = new Array<number>(samples.length);
  filtered[0] = samples[0] ?? 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = filtered[index - 1] ?? 0;
    const current = samples[index] ?? previous;
    filtered[index] = previous + alpha * (current - previous);
  }

  return filtered;
}

function applyHighPassFilter(samples: number[], samplingRateHz: number, cutoffHz: number) {
  if (samples.length === 0) {
    return samples;
  }
  if (!Number.isFinite(samplingRateHz) || samplingRateHz <= 0 || !Number.isFinite(cutoffHz) || cutoffHz <= 0) {
    return samples;
  }

  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / samplingRateHz;
  const alpha = rc / (rc + dt);
  const filtered = new Array<number>(samples.length);
  filtered[0] = samples[0] ?? 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previousFiltered = filtered[index - 1] ?? 0;
    const previousInput = samples[index - 1] ?? previousFiltered;
    const current = samples[index] ?? previousInput;
    filtered[index] = alpha * (previousFiltered + current - previousInput);
  }

  return filtered;
}

function applyViewportFilters(samples: number[], samplingRateHz: number, filters?: ECGSignalFilters | null) {
  if (!filters) {
    return samples;
  }

  let filtered = samples;
  if (filters.highPassHz !== undefined) {
    filtered = applyHighPassFilter(filtered, samplingRateHz, filters.highPassHz);
  }
  if (filters.lowPassHz !== undefined) {
    filtered = applyLowPassFilter(filtered, samplingRateHz, filters.lowPassHz);
  }
  return filtered;
}

function getVisibleLaneSamples(
  signal: WFDBDecodedSignal,
  viewport: ECGViewport | undefined,
  startSample: number,
  endSample: number,
  filters?: ECGSignalFilters | null,
) {
  const visibleStart = Math.max(0, Math.floor(startSample));
  const visibleEnd = Math.min(signal.samples.length, Math.ceil(endSample));
  const visibleRawSamples = getVisibleWindow(signal.samples, visibleStart, visibleEnd);
  const visibleMilliVolts = visibleRawSamples.map((sampleValue) => sampleToMilliVolts(signal, sampleValue));
  const filteredMilliVolts = applyViewportFilters(
    visibleMilliVolts,
    viewport?.time.samplingRateHz ?? 1,
    filters,
  );

  return {
    visibleStart,
    visibleEnd,
    visibleMilliVolts: filteredMilliVolts,
  };
}

function chooseAmplitudeStep(milliVoltRange: number) {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  let bestStep = 0.5;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const step of candidates) {
    const labelCount = 2 * Math.floor(milliVoltRange / step) + 1;
    const score = Math.abs(labelCount - 5) + (labelCount < 3 ? 2 : 0);
    if (score < bestScore || (score === bestScore && step < bestStep)) {
      bestScore = score;
      bestStep = step;
    }
  }

  return bestStep;
}

function getLaneAmplitudeScale(samplesMilliVolts: number[], laneHeight: number, amplitudeScale: number) {
  const finiteSamples = samplesMilliVolts.filter(Number.isFinite);
  const usableHalfHeight = Math.max(1, (laneHeight - ECG_CANVAS_LAYOUT.milliVoltLabelPaddingPx * 2) / 2);

  if (finiteSamples.length === 0) {
    return {
      milliVoltRange: 1,
      pixelsPerMilliVolt: usableHalfHeight * amplitudeScale,
      majorStep: 0.5,
    };
  }

  let maxAbs = 0;
  for (const sample of finiteSamples) {
    const abs = Math.abs(sample);
    if (abs > maxAbs) {
      maxAbs = abs;
    }
  }

  if (maxAbs <= 1) {
    return {
      milliVoltRange: 1,
      pixelsPerMilliVolt: usableHalfHeight * amplitudeScale,
      majorStep: 0.5,
    };
  }

  const sortedAbs = [...finiteSamples].map((value) => Math.abs(value)).sort((left, right) => left - right);
  const p95Index = Math.floor((sortedAbs.length - 1) * 0.95);
  const p95Abs = sortedAbs[p95Index] ?? maxAbs;
  const milliVoltRange = Math.max(1, p95Abs * 1.1);
  const majorStep = chooseAmplitudeStep(milliVoltRange);

  return {
    milliVoltRange,
    pixelsPerMilliVolt: (usableHalfHeight / milliVoltRange) * amplitudeScale,
    majorStep,
  };
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign = "left",
) {
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(text, x, y);
}

function pickAmplitudeLabelTicks(allTicks: number[]) {
  if (allTicks.length <= 7) {
    return allTicks;
  }

  return allTicks.filter((tick) => Math.abs(tick % (Math.abs(allTicks[0]) >= 10 ? 5 : 1)) < 1e-6);
}

function drawAmplitudeLabels(
  context: CanvasRenderingContext2D,
  plotLeft: number,
  laneScales: Array<{
    top: number;
    bottom: number;
    centerY: number;
    milliVoltRange: number;
    pixelsPerMilliVolt: number;
    majorStep: number;
  }>,
  plotTop: number,
  plotBottom: number,
) {
  for (const lane of laneScales) {
    const labelStep = lane.majorStep;
    const topValue = Math.floor(lane.milliVoltRange / labelStep) * labelStep || labelStep;
    const allTicks: number[] = [];

    for (let value = topValue; value >= -topValue - 1e-6; value -= labelStep) {
      allTicks.push(Number(value.toFixed(6)));
    }

    const selectedTicks = pickAmplitudeLabelTicks(allTicks);

    for (const value of selectedTicks) {
      const y = lane.centerY - value * lane.pixelsPerMilliVolt;
      if (y < Math.max(plotTop + 8, lane.top + 8) || y > Math.min(plotBottom - 8, lane.bottom - 8)) {
        continue;
      }

      const label = value > 0 ? `+${value.toFixed(1)}` : value < 0 ? value.toFixed(1) : "0";
      drawText(context, label, plotLeft - 6, y, "right");

      context.beginPath();
      context.moveTo(plotLeft - 4, y + 0.5);
      context.lineTo(plotLeft + 2, y + 0.5);
      context.stroke();
    }
  }
}

function shouldDrawMinorAmplitudeGrid(pixelsPerMilliVolt: number) {
  return pixelsPerMilliVolt >= 40;
}

function paintLaneGrid(
  context: CanvasRenderingContext2D,
  laneRect: { left: number; top: number; width: number; height: number },
  timeTicks: NonNullable<ReturnType<typeof buildTimeAxisTicks>> | null,
  milliVoltRange: number,
  pixelsPerMilliVolt: number,
  majorStep: number,
  majorGridColor: string,
  minorGridColor: string,
  guideColor: string,
) {
  const { left, top, width, height } = laneRect;
  const right = left + width;
  const bottom = top + height;
  const centerY = top + height / 2;

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();

  if (timeTicks) {
    context.strokeStyle = majorGridColor;
    context.lineWidth = 1.1;
    for (const tick of timeTicks.majorTicks) {
      context.beginPath();
      context.moveTo(tick.x + 0.5, top);
      context.lineTo(tick.x + 0.5, bottom);
      context.stroke();
    }

    context.strokeStyle = minorGridColor;
    context.lineWidth = 0.8;
    for (const tick of timeTicks.minorTicks) {
      context.beginPath();
      context.moveTo(tick.x + 0.5, top);
      context.lineTo(tick.x + 0.5, bottom);
      context.stroke();
    }
  }

  context.strokeStyle = guideColor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, centerY + 0.5);
  context.lineTo(right, centerY + 0.5);
  context.stroke();

  context.strokeStyle = majorGridColor;
  context.lineWidth = 1.1;
  const topValue = Math.floor(milliVoltRange / majorStep) * majorStep || majorStep;
  for (let mv = topValue; mv >= -topValue - 1e-6; mv -= majorStep) {
    const y = centerY - mv * pixelsPerMilliVolt;
    if (y < top || y > bottom) {
      continue;
    }
    context.beginPath();
    context.moveTo(left, y + 0.5);
    context.lineTo(right, y + 0.5);
    context.stroke();
  }

  context.strokeStyle = minorGridColor;
  context.lineWidth = 0.8;
  const minorStep = majorStep / 5;
  if (shouldDrawMinorAmplitudeGrid(pixelsPerMilliVolt) && minorStep > 0) {
    for (let mv = topValue; mv >= -topValue - 1e-6; mv -= minorStep) {
      const isMajor = Math.abs(mv / majorStep - Math.round(mv / majorStep)) < 0.0001;
      if (isMajor) {
        continue;
      }
      const y = centerY - mv * pixelsPerMilliVolt;
      if (y < top || y > bottom) {
        continue;
      }
      context.beginPath();
      context.moveTo(left, y + 0.5);
      context.lineTo(right, y + 0.5);
      context.stroke();
    }
  }

  context.restore();
}

function paintLaneWaveform(
  context: CanvasRenderingContext2D,
  laneRect: { left: number; top: number; width: number; height: number },
  signal: WFDBDecodedSignal,
  viewport: ECGViewport,
  startSample: number,
  endSample: number,
  pixelsPerMilliVolt: number,
  lineColor: string,
  filters?: ECGSignalFilters | null,
) {
  const { left, top, width, height } = laneRect;
  const centerY = top + height / 2;

  const { visibleStart, visibleEnd, visibleMilliVolts } = getVisibleLaneSamples(
    signal,
    viewport,
    startSample,
    endSample,
    filters,
  );
  if (visibleStart >= visibleEnd || visibleMilliVolts.length === 0) {
    return;
  }
  const amplitudeScale = viewport.signals[signal.name]?.amplitudeScale ?? 1;
  const waveformStride = getWaveformStride(viewport.time.samplesPerPixel);
  const alignedStart = alignStartSample(startSample, waveformStride);

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();

  context.strokeStyle = lineColor;
  context.lineWidth = 1.5;
  context.beginPath();
  let started = false;
  for (let sampleIndex = alignedStart; sampleIndex < visibleEnd; sampleIndex += waveformStride) {
    const visibleIndex = sampleIndex - visibleStart;
    const milliVolts = visibleMilliVolts[visibleIndex];
    if (milliVolts === undefined) {
      continue;
    }

    const y = centerY - milliVolts * amplitudeScale * pixelsPerMilliVolt;
    const drawX = left + (sampleIndex - startSample) / viewport.time.samplesPerPixel;
    if (!started) {
      context.moveTo(drawX + 0.5, y);
      started = true;
    } else {
      context.lineTo(drawX + 0.5, y);
    }
  }
  context.stroke();
  context.restore();
}

function paintAnnotationMarkers(
  context: CanvasRenderingContext2D,
  laneRect: { left: number; top: number; width: number; height: number },
  annotations: WFDBAnnotation[],
  viewport: ECGViewport,
  startSample: number,
  endSample: number,
  annotationColor: string,
) {
  const { left, top, width, height } = laneRect;
  const visibleStart = Math.max(0, Math.floor(startSample));
  const visibleEnd = Math.max(visibleStart, Math.ceil(endSample));
  const samplesPerPixel = viewport.time.samplesPerPixel;
  if (samplesPerPixel <= 0) {
    return;
  }

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();

  context.strokeStyle = annotationColor;
  context.lineWidth = 1;
  context.setLineDash([4, 4]);

  for (const annotation of annotations) {
    if (annotation.sample < visibleStart || annotation.sample > visibleEnd) {
      continue;
    }

    const x = left + (annotation.sample - startSample) / samplesPerPixel;
    context.beginPath();
    context.moveTo(x + 0.5, top);
    context.lineTo(x + 0.5, top + height);
    context.stroke();
  }

  context.setLineDash([]);
  context.restore();
}

function paintSelectedSampleHighlight(
  context: CanvasRenderingContext2D,
  laneRect: { left: number; top: number; width: number; height: number },
  selectedSample: number,
  viewport: ECGViewport,
  startSample: number,
  endSample: number,
) {
  const { left, top, width, height } = laneRect;
  const visibleStart = Math.max(0, Math.floor(startSample));
  const visibleEnd = Math.max(visibleStart, Math.ceil(endSample));
  const samplesPerPixel = viewport.time.samplesPerPixel;
  if (samplesPerPixel <= 0 || selectedSample < visibleStart || selectedSample > visibleEnd) {
    return;
  }

  const x = left + (selectedSample - startSample) / samplesPerPixel;

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();

  context.fillStyle = "rgba(29, 78, 216, 0.08)";
  context.fillRect(x - 5, top, 10, height);

  context.strokeStyle = "rgba(29, 78, 216, 0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + 0.5, top);
  context.lineTo(x + 0.5, top + height);
  context.stroke();

  context.restore();
}

function rhythmBandColor(label: string) {
  const normalized = label.trim().toUpperCase();
  if (normalized === "N") {
    return "rgba(107, 114, 128, 0.16)";
  }
  if (normalized === "AFIB") {
    return "rgba(37, 99, 235, 0.18)";
  }
  return "rgba(234, 179, 8, 0.18)";
}

function paintRhythmBands(
  context: CanvasRenderingContext2D,
  laneRect: { left: number; top: number; width: number; height: number },
  rhythmSpans: WFDBRhythmSpan[],
  viewport: ECGViewport,
  startSample: number,
  endSample: number,
) {
  const { left, top, width, height } = laneRect;
  const visibleStart = Math.max(0, Math.floor(startSample));
  const visibleEnd = Math.max(visibleStart, Math.ceil(endSample));
  const samplesPerPixel = viewport.time.samplesPerPixel;
  if (samplesPerPixel <= 0) {
    return;
  }

  const bandTop = top + height * 0.75;
  const bandHeight = Math.max(1, height * 0.25);

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();

  for (const span of rhythmSpans) {
    const spanEnd = span.endSample ?? Number.POSITIVE_INFINITY;
    if (spanEnd <= visibleStart || span.startSample >= visibleEnd) {
      continue;
    }

    const visibleBandStart = Math.max(span.startSample, visibleStart);
    const visibleBandEnd = Math.min(spanEnd, visibleEnd);
    const bandWidth = (visibleBandEnd - visibleBandStart) / samplesPerPixel;
    if (bandWidth <= 0) {
      continue;
    }

    const x = left + (visibleBandStart - startSample) / samplesPerPixel;
    context.fillStyle = rhythmBandColor(span.label);
    context.fillRect(x, bandTop, bandWidth, bandHeight);
  }

  context.restore();
}

export function paintECGCanvas(
  context: CanvasRenderingContext2D,
  rect: DOMRectReadOnly,
  options: ECGCanvasPaintOptions,
) {
  const {
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
  } = options;
  const {
    topAxisHeight,
    leftAxisWidth,
    signalLaneGap,
    bottomPadding,
    gutterBackground,
    plotBackground,
    majorGridColor,
    minorGridColor,
    axisTextColor,
  } =
    ECG_CANVAS_LAYOUT;
  const plotLeft = leftAxisWidth;
  const plotTop = topAxisHeight;
  const plotWidth = Math.max(1, rect.width - plotLeft);
  const plotBottom = Math.max(plotTop + 1, rect.height - bottomPadding);
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const timeTicks = viewport
    ? buildTimeAxisTicks({
        viewport,
        plotLeft,
        plotWidth,
      })
    : null;

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, rect.width, rect.height);

  context.fillStyle = gutterBackground;
  context.fillRect(0, 0, rect.width, topAxisHeight);
  context.fillRect(0, topAxisHeight, leftAxisWidth, plotHeight);
  context.fillRect(0, plotBottom, rect.width, rect.height - plotBottom);

  context.fillStyle = gutterBackground;
  context.fillRect(leftAxisWidth, topAxisHeight, plotWidth, plotHeight);

  const lanes = Math.max(1, signals.length);
  const laneScales: Array<{
    milliVoltRange: number;
    pixelsPerMilliVolt: number;
    majorStep: number;
  }> = [];

  const startSample = viewport
    ? Math.max(0, Math.floor(viewport.time.startSample))
    : 0;
  const visibleSamples = viewport
    ? Math.max(1, Math.ceil(plotWidth * viewport.time.samplesPerPixel))
    : 1;
  const endSample = startSample + visibleSamples;

  for (let lane = 0; lane < lanes; lane += 1) {
    const signal = signals[lane];
    const laneTop = plotTop + lane * (laneHeight + signalLaneGap);
    if (laneTop >= plotBottom) {
      break;
    }

    const laneSamples = signal
      ? getVisibleLaneSamples(signal, viewport, startSample, endSample, filters).visibleMilliVolts
      : [];
    const amplitudeScale = signal ? viewport?.signals[signal.name]?.amplitudeScale ?? 1 : 1;
    const laneScale = getLaneAmplitudeScale(
      laneSamples,
      laneHeight,
      amplitudeScale,
    );
    laneScales.push(laneScale);

    context.fillStyle = plotBackground;
    context.fillRect(plotLeft, laneTop, plotWidth, laneHeight);

    paintLaneGrid(
      context,
      { left: plotLeft, top: laneTop, width: plotWidth, height: laneHeight },
      timeTicks,
      laneScale.milliVoltRange,
      laneScale.pixelsPerMilliVolt,
      laneScale.majorStep,
      majorGridColor,
      minorGridColor,
      guideColor,
    );
  }

  if (!viewport) {
    context.fillStyle = axisTextColor;
    context.font = "11px sans-serif";
    drawText(context, "0s", plotLeft + 2, topAxisHeight / 2);
    return;
  }

  for (let lane = 0; lane < lanes; lane += 1) {
    const signal = signals[lane];
    if (!signal || signal.samples.length === 0) {
      continue;
    }

    const laneTop = plotTop + lane * (laneHeight + signalLaneGap);
    if (laneTop >= plotBottom) {
      break;
    }

    const laneScale = laneScales[lane];
    if (!laneScale) {
      continue;
    }

    paintLaneWaveform(
      context,
      { left: plotLeft, top: laneTop, width: plotWidth, height: laneHeight },
      signal,
      viewport,
      startSample,
      endSample,
      laneScale.pixelsPerMilliVolt,
      lineColor,
      filters,
    );
  }

  if (viewport && annotations && annotations.length > 0) {
    for (let lane = 0; lane < lanes; lane += 1) {
      const laneTop = plotTop + lane * (laneHeight + signalLaneGap);
      if (laneTop >= plotBottom) {
        break;
      }

      paintAnnotationMarkers(
        context,
        { left: plotLeft, top: laneTop, width: plotWidth, height: laneHeight },
        annotations,
        viewport,
        startSample,
        endSample,
        ECG_CANVAS_LAYOUT.annotationColor,
      );
    }
  }

  if (viewport && rhythmSpans && rhythmSpans.length > 0) {
    for (let lane = 0; lane < lanes; lane += 1) {
      const laneTop = plotTop + lane * (laneHeight + signalLaneGap);
      if (laneTop >= plotBottom) {
        break;
      }

      paintRhythmBands(
        context,
        { left: plotLeft, top: laneTop, width: plotWidth, height: laneHeight },
        rhythmSpans,
        viewport,
        startSample,
        endSample,
      );
    }
  }

  if (viewport && selectedSample !== undefined && selectedSample !== null) {
    for (let lane = 0; lane < lanes; lane += 1) {
      const laneTop = plotTop + lane * (laneHeight + signalLaneGap);
      if (laneTop >= plotBottom) {
        break;
      }

      paintSelectedSampleHighlight(
        context,
        { left: plotLeft, top: laneTop, width: plotWidth, height: laneHeight },
        selectedSample,
        viewport,
        startSample,
        endSample,
      );
    }
  }

  context.fillStyle = axisTextColor;
  context.font = "600 12px sans-serif";

  if (timeTicks) {
    for (const tick of timeTicks.majorTicks) {
      drawText(context, tick.label, tick.x, topAxisHeight / 2, "center");
    }
  }

  drawAmplitudeLabels(
    context,
    plotLeft,
    laneScales.map((laneScale, lane) => ({
      top: plotTop + lane * (laneHeight + signalLaneGap),
      bottom: plotTop + lane * (laneHeight + signalLaneGap) + laneHeight,
      centerY: plotTop + lane * (laneHeight + signalLaneGap) + laneHeight / 2,
      milliVoltRange: laneScale.milliVoltRange,
      pixelsPerMilliVolt: laneScale.pixelsPerMilliVolt,
      majorStep: laneScale.majorStep,
    })),
    plotTop,
    plotBottom,
  );
}
