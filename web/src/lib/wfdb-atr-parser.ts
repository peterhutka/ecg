import type { WFDBAnnotation, WFDBDecodedAtr } from "./wfdb-atr";

// WFDB / MIT-BIH label-store to annotation-symbol mapping.
// A few of these are widely used beat/rhythm markers in WFDB, but they are
// still WFDB-specific codes rather than a universal ECG vendor standard.
const ANN_SYMBOLS: Record<number, string> = {
  1: "N", // Normal beat
  2: "L", // Left bundle branch block beat
  3: "R", // Right bundle branch block beat
  4: "a", // Aberrated atrial premature beat
  5: "V", // Premature ventricular contraction
  6: "F", // Fusion of ventricular and normal beat
  7: "J", // Nodal (junctional) premature beat
  8: "A", // Atrial premature beat
  9: "S", // Supraventricular premature beat
  10: "E", // Ventricular escape beat
  11: "j", // Nodal (junctional) escape beat
  12: "/", // Paced beat
  13: "Q", // Unclassifiable beat
  14: "~", // Signal-quality / noise marker
  16: "|", // WFDB artifact marker
  18: "s", // Supraventricular escape beat
  19: "T", // Ventricular flutter wave
  20: "*", // Ventricular flutter/fibrillation
  21: "D", // WFDB-defined beat code
  22: '"', // WFDB comment / note marker
  23: "=", // Rhythm change marker
  24: "p", // Non-conducted P-wave
  25: "B", // Bundle branch block beat
  26: "^", // ST/T change marker
  27: "t", // T-wave change marker
  28: "+", // Rhythm annotation marker
  29: "u", // WFDB-defined beat code
  30: "?", // Unknown / not yet classified beat
  31: "!", // Ventricular bigeminy marker
  32: "[", // WFDB-defined block marker
  33: "]", // WFDB-defined block marker
  34: "e", // Atrial escape beat
  35: "n", // Nodal escape beat
  36: "@", // Rhythm annotation with auxiliary note
  37: "x", // Ventricular tachycardia marker
  38: "f", // Fusion of paced and normal beat
  39: "(", // Start of auxiliary rhythm label text
  40: ")", // End of auxiliary rhythm label text
  41: "r", // R-on-T premature ventricular contraction
};

type ParserState = {
  sample: number;
  num?: number;
  subtype?: number;
  chan?: number;
};

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32Pdp11(bytes: Uint8Array, offset: number) {
  const high = readUint16LE(bytes, offset);
  const low = readUint16LE(bytes, offset + 2);
  return (high << 16) | low;
}

function symbolFor(labelStore: number) {
  return ANN_SYMBOLS[labelStore] ?? `code-${labelStore}`;
}

// Decode a compact WFDB MIT-format annotation stream into a structured record.
export function parseWFDBAtr(rawBytes: Uint8Array, recordName: string): WFDBDecodedAtr | null {
  if (rawBytes.length < 2) {
    return null;
  }

  const annotations: WFDBAnnotation[] = [];
  const state: ParserState = { sample: 0 };
  let offset = 0;

  while (offset + 1 < rawBytes.length) {
    const word = readUint16LE(rawBytes, offset);
    offset += 2;

    const labelStore = word >> 10;
    const deltaOrValue = word & 0x03ff;

    if (labelStore === 0 && deltaOrValue === 0) {
      break;
    }

    if (labelStore === 59) {
      if (deltaOrValue !== 0 || offset + 4 > rawBytes.length) {
        return null;
      }

      state.sample += readUint32Pdp11(rawBytes, offset);
      offset += 4;
      continue;
    }

    if (labelStore === 60) {
      state.num = deltaOrValue;
      continue;
    }

    if (labelStore === 61) {
      state.subtype = deltaOrValue;
      continue;
    }

    if (labelStore === 62) {
      state.chan = deltaOrValue;
      continue;
    }

    if (labelStore === 63) {
      if (offset + deltaOrValue > rawBytes.length) {
        return null;
      }

      const auxBytes = rawBytes.slice(offset, offset + deltaOrValue);
      offset += deltaOrValue;
      if (deltaOrValue % 2 === 1) {
        offset += 1;
      }

      const decoder = new TextDecoder();
      const auxNote = decoder.decode(auxBytes).replace(/\0+$/, "");
      const previous = annotations[annotations.length - 1];
      if (previous) {
        previous.auxNote = auxNote;
      }
      continue;
    }

    state.sample += deltaOrValue;
    annotations.push({
      sample: state.sample,
      labelStore,
      symbol: symbolFor(labelStore),
      subtype: state.subtype,
      chan: state.chan,
      num: state.num,
    });

    state.subtype = undefined;
  }

  return {
    recordName,
    extension: "atr",
    annotations,
  };
}
