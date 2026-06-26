import type { WFDBHeaderType, WFDBSignalType } from "../../../lib/wfdb-header";

export type HeaField = {
  label: string;
  value: string;
};

export const heaViewOptions = [
  { label: "Parsed", value: "parsed" },
  { label: "Raw", value: "raw" },
];

export const headerSidebarTabs = [
  { label: "Headers", value: "headers" },
  { label: "Annotations", value: "annotations" },
  { label: "Other", value: "other" },
];

export function buildFilesRoute(path: string) {
  return path ? `/files?path=${encodeURIComponent(path)}` : "/files";
}

export function formatSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(2)} ${units[unit]}`;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

export function headerToFields(header: WFDBHeaderType): HeaField[] {
  const rows: HeaField[] = [
    { label: "Record", value: header.recordName },
    { label: "Signals", value: String(header.signalCount) },
    { label: "Sampling rate", value: `${header.samplingRateHz} Hz` },
    { label: "Samples", value: String(header.sampleCount) },
    {
      label: "Total time",
      value: formatDuration(header.sampleCount / header.samplingRateHz),
    },
  ];

  if (header.baseTime) {
    rows.push({ label: "Start time", value: header.baseTime });
  }
  if (header.baseDate) {
    rows.push({ label: "Start date", value: header.baseDate });
  }
  if (header.comments.length > 0) {
    rows.push({ label: "Comments", value: header.comments.join(" | ") });
  }

  return rows;
}

export function signalToFields(signal: WFDBSignalType): HeaField[] {
  const rows: HeaField[] = [
    { label: "File", value: signal.file },
    { label: "Format", value: signal.format },
    { label: "Gain", value: String(signal.gain) },
    { label: "Bits", value: String(signal.adcResolutionBits) },
    { label: "Baseline", value: String(signal.adcZero) },
  ];

  if (signal.initialValue !== undefined) {
    rows.push({ label: "Initial", value: String(signal.initialValue) });
  }
  if (signal.checksum !== undefined) {
    rows.push({ label: "Checksum", value: String(signal.checksum) });
  }
  if (signal.blockSize !== undefined) {
    rows.push({ label: "Block size", value: String(signal.blockSize) });
  }

  return rows;
}

export function siblingHeaderPath(path: string) {
  const index = path.lastIndexOf(".");
  if (index <= 0) {
    return `${path}.hea`;
  }
  return `${path.slice(0, index)}.hea`;
}

export function siblingAnnotationPath(path: string) {
  const index = path.lastIndexOf(".");
  if (index <= 0) {
    return `${path}.atr`;
  }
  return `${path.slice(0, index)}.atr`;
}

export function concatChunks(chunks: Uint8Array[], totalBytes: number) {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
