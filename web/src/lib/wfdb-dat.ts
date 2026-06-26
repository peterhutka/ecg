import type { WFDBHeaderType, WFDBSignalType } from "./wfdb-header";
import { decodeFormat212 } from "./wfdb-dat/decoders/decode-format-212";

// One decoded waveform channel with the header metadata attached.
export type WFDBDecodedSignal = {
  // Display name used in the UI.
  name: string;
  // Backing data file name from the header.
  file: string;
  // WFDB packed format used to decode the raw bytes.
  format: string;
  // Digital-to-physical scaling factor.
  gain: number;
  // ADC resolution in bits.
  adcResolutionBits: number;
  // Digital baseline used during conversion.
  adcZero: number;
  // Decoded sample values for this channel.
  samples: number[];
};

// Complete decoded waveform payload for a record.
export type WFDBDecodedRecord = {
  // Original parsed header.
  header: WFDBHeaderType;
  // One channel per signal in the record.
  signals: WFDBDecodedSignal[];
  // Raw bytes fetched from the backend for future reuse.
  rawBytes: Uint8Array;
};

function signalName(signal: WFDBSignalType, index: number) {
  return signal.signalName ?? `${signal.file}#${index + 1}`;
}

export function parseWFDBDat(
  rawBytes: Uint8Array,
  header: WFDBHeaderType,
): WFDBDecodedRecord | null {
  if (header.signals.length === 0) {
    return null;
  }

  const formats = new Set(header.signals.map((signal) => signal.format));
  if (formats.size !== 1 || !formats.has("212")) {
    return null;
  }

  const decodedSamples = decodeFormat212(rawBytes);
  if (!decodedSamples) {
    return null;
  }

  const signalCount = header.signals.length;
  if (decodedSamples.length % signalCount !== 0) {
    return null;
  }

  const samplesPerSignal = decodedSamples.length / signalCount;
  const signals: WFDBDecodedSignal[] = header.signals.map((signal, signalIndex) => {
    const samples: number[] = [];
    for (let sampleIndex = 0; sampleIndex < samplesPerSignal; sampleIndex += 1) {
      samples.push(decodedSamples[sampleIndex * signalCount + signalIndex]);
    }

    return {
      name: signalName(signal, signalIndex),
      file: signal.file,
      format: signal.format,
      gain: signal.gain,
      adcResolutionBits: signal.adcResolutionBits,
      adcZero: signal.adcZero,
      samples,
    };
  });

  return {
    header,
    signals,
    rawBytes,
  };
}
