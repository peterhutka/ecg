// Viewport state for ECG rendering: shared time window plus per-signal amplitude scaling.
export type ECGViewport = {
  // Horizontal window into the recording.
  time: {
    // Left edge of the visible window in samples.
    startSample: number;
    // Zoom level in samples per on-screen pixel.
    samplesPerPixel: number;
    // Sampling rate used to convert samples to seconds.
    samplingRateHz: number;
  };
  // Per-signal rendering overrides.
  signals: {
    [signalId: string]: {
      // Vertical scale factor for that signal only.
      amplitudeScale: number;
    };
  };
};

export type ECGSignalFilters = {
  // Optional high-pass cutoff in Hz.
  highPassHz?: number;
  // Optional low-pass cutoff in Hz.
  lowPassHz?: number;
};
