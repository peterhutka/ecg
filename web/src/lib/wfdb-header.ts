// Minimal per-signal metadata extracted from a WFDB header line.
export type WFDBSignalType = {
  // Backing data file for this signal.
  file: string;
  // WFDB packed sample format, such as 212.
  format: string;
  // Digital-to-physical scaling factor.
  gain: number;
  // ADC resolution in bits.
  adcResolutionBits: number;
  // Digital baseline value used by the recording.
  adcZero: number;
  // Optional initial sample value stored in the header.
  initialValue?: number;
  // Optional checksum for validation.
  checksum?: number;
  // Optional block size for older WFDB layouts.
  blockSize?: number;
  // Optional human-readable signal label.
  signalName?: string;
};

// Minimal WFDB header model used by the app.
export type WFDBHeaderType = {
  // Record identifier shared by the header, waveform, and annotations.
  recordName: string;
  // Number of signals declared in the header.
  signalCount: number;
  // Sampling rate in Hertz.
  samplingRateHz: number;
  // Total number of samples in the record.
  sampleCount: number;
  // Optional start time from the header.
  baseTime?: string;
  // Optional start date from the header.
  baseDate?: string;
  // Free-form comments from the header.
  comments: string[];
  // Per-signal metadata entries.
  signals: WFDBSignalType[];
  // Original header text for raw display.
  raw: string;
};

function isTimeLike(value: string) {
  return /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
}

function isDateLike(value: string) {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWfdbNumericPrefix(value: string) {
  const match = value.match(/^-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHeaderLine(line: string) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 4 || parts.length > 6) {
    return null;
  }

  const signalCount = parseNumber(parts[1]);
  const samplingRateHz = parseNumber(parts[2]);
  const sampleCount = parseNumber(parts[3]);
  if (signalCount === null || samplingRateHz === null || sampleCount === null) {
    return null;
  }

  let baseTime: string | undefined;
  let baseDate: string | undefined;
  if (parts[4]) {
    if (isTimeLike(parts[4])) {
      baseTime = parts[4];
      if (parts[5]) {
        baseDate = parts[5];
      }
    } else if (isDateLike(parts[4])) {
      baseDate = parts[4];
    } else {
      return null;
    }
  }

  return {
    recordName: parts[0],
    signalCount,
    samplingRateHz,
    sampleCount,
    baseTime,
    baseDate,
  };
}

function parseSignalLine(line: string) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 9) {
    return null;
  }

  const gain = parseWfdbNumericPrefix(parts[2]);
  const adcResolutionBits = parseNumber(parts[3]);
  const adcZero = parseNumber(parts[4]);
  if (gain === null || adcResolutionBits === null || adcZero === null) {
    return null;
  }

  return {
    file: parts[0],
    format: parts[1],
    gain,
    adcResolutionBits,
    adcZero,
    initialValue: parseNumber(parts[5]) ?? undefined,
    checksum: parseNumber(parts[6]) ?? undefined,
    blockSize: parseNumber(parts[7]) ?? undefined,
    signalName: parts.slice(8).join(" "),
  };
}

export function parseWFDBHeader(headerText: string): WFDBHeaderType | null {
  const lines = headerText.split(/\r?\n/);
  const firstLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstLineIndex === -1) {
    return null;
  }

  const headerLine = parseHeaderLine(lines[firstLineIndex]);
  if (!headerLine) {
    return null;
  }

  const comments: string[] = [];
  const signals: WFDBSignalType[] = [];

  for (const line of lines.slice(firstLineIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      const comment = trimmed.slice(1).trim();
      if (comment) {
        comments.push(comment);
      }
      continue;
    }

    const signal = parseSignalLine(trimmed);
    if (!signal) {
      return null;
    }
    signals.push(signal);
  }

  if (signals.length !== headerLine.signalCount) {
    if (!(headerLine.signalCount === 0 && signals.length === 0)) {
      return null;
    }
  }

  return {
    ...headerLine,
    comments,
    signals,
    raw: headerText,
  };
}
