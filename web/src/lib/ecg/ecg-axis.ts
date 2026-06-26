import type { ECGViewport } from "./ecg.types";

const TIME_LABEL_EPSILON = 1e-6;

export type ECGTimeTick = {
  seconds: number;
  x: number;
  label: string;
};

export type ECGTimeAxisTicks = {
  majorStepSeconds: number;
  minorStepSeconds: number;
  majorTicks: ECGTimeTick[];
  minorTicks: ECGTimeTick[];
};

type BuildTimeAxisTicksOptions = {
  viewport: ECGViewport;
  plotLeft: number;
  plotWidth: number;
  minimumMajorSpacingPx?: number;
  minorDivisions?: number;
};

function niceCeilStep(rawStepSeconds: number) {
  if (!Number.isFinite(rawStepSeconds) || rawStepSeconds <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(rawStepSeconds));
  const power = 10 ** exponent;
  const fraction = rawStepSeconds / power;

  if (fraction <= 1) {
    return 1 * power;
  }
  if (fraction <= 2) {
    return 2 * power;
  }
  if (fraction <= 5) {
    return 5 * power;
  }
  return 10 * power;
}

function getTimeLabelPrecision(stepSeconds: number) {
  if (stepSeconds >= 1) {
    return 0;
  }
  if (stepSeconds >= 0.1) {
    return 1;
  }
  if (stepSeconds >= 0.01) {
    return 2;
  }
  return 3;
}

export function formatTimeLabel(seconds: number, stepSeconds: number) {
  const precision = getTimeLabelPrecision(stepSeconds);

  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds - hours * 3600) / 60);
    const remainingSeconds = seconds - hours * 3600 - minutes * 60;
    return `${hours}h ${minutes}m ${remainingSeconds.toFixed(precision)}s`;
  }

  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds - minutes * 60;
    return `${minutes}m ${remainingSeconds.toFixed(precision)}s`;
  }

  return `${seconds.toFixed(precision)}s`;
}

export function buildTimeAxisTicks({
  viewport,
  plotLeft,
  plotWidth,
  minimumMajorSpacingPx = 72,
  minorDivisions = 5,
}: BuildTimeAxisTicksOptions): ECGTimeAxisTicks {
  const samplingRateHz = viewport.time.samplingRateHz;
  if (samplingRateHz <= 0 || plotWidth <= 0 || viewport.time.samplesPerPixel <= 0) {
    return {
      majorStepSeconds: 1,
      minorStepSeconds: 0.2,
      majorTicks: [],
      minorTicks: [],
    };
  }

  const secondsPerPixel = viewport.time.samplesPerPixel / samplingRateHz;
  const startSeconds = viewport.time.startSample / samplingRateHz;
  const visibleSeconds = plotWidth * secondsPerPixel;
  const endSeconds = startSeconds + visibleSeconds;

  const majorStepSeconds = niceCeilStep(secondsPerPixel * minimumMajorSpacingPx);
  const minorStepSeconds = majorStepSeconds / minorDivisions;

  const majorTicks: ECGTimeTick[] = [];
  const minorTicks: ECGTimeTick[] = [];

  const majorStartIndex = Math.ceil((startSeconds - TIME_LABEL_EPSILON) / majorStepSeconds);
  const majorEndIndex = Math.floor((endSeconds + TIME_LABEL_EPSILON) / majorStepSeconds);

  for (let index = majorStartIndex; index <= majorEndIndex; index += 1) {
    const seconds = index * majorStepSeconds;
    majorTicks.push({
      seconds,
      x: plotLeft + (seconds - startSeconds) / secondsPerPixel,
      label: formatTimeLabel(seconds, majorStepSeconds),
    });
  }

  if (minorStepSeconds > 0) {
    const minorStartIndex = Math.ceil((startSeconds - TIME_LABEL_EPSILON) / minorStepSeconds);
    const minorEndIndex = Math.floor((endSeconds + TIME_LABEL_EPSILON) / minorStepSeconds);

    for (let index = minorStartIndex; index <= minorEndIndex; index += 1) {
      const seconds = index * minorStepSeconds;
      const isMajorTick =
        Math.abs(seconds / majorStepSeconds - Math.round(seconds / majorStepSeconds)) <
        TIME_LABEL_EPSILON;

      if (isMajorTick) {
        continue;
      }

      minorTicks.push({
        seconds,
        x: plotLeft + (seconds - startSeconds) / secondsPerPixel,
        label: "",
      });
    }
  }

  return {
    majorStepSeconds,
    minorStepSeconds,
    majorTicks,
    minorTicks,
  };
}
