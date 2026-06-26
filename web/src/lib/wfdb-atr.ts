// One decoded WFDB annotation entry from an .atr file.
export type WFDBAnnotation = {
  // Annotation position in samples from the start of the record.
  sample: number;
  // Human-readable annotation symbol, such as N, V, /, or +.
  symbol: string;
  // Optional numeric store value from the WFDB annotation payload.
  labelStore?: number;
  // Optional annotation subtype.
  subtype?: number;
  // Optional channel index when the annotation targets a specific signal.
  chan?: number;
  // Optional annotation number field.
  num?: number;
  // Optional auxiliary text attached to the annotation.
  auxNote?: string;
};

// Minimal decoded annotation payload for one record.
export type WFDBDecodedAtr = {
  // Record identifier shared with the .hea and .dat files.
  recordName: string;
  // The annotation extension, fixed here to atr.
  extension: "atr";
  // All decoded annotation events in timeline order.
  annotations: WFDBAnnotation[];
};

export type WFDBRhythmSpan = {
  // Sample where the rhythm context starts.
  startSample: number;
  // Sample where the rhythm context ends; null means it runs to the end of the record.
  endSample: number | null;
  // Rhythm label extracted from the aux payload, such as AFIB or N.
  label: string;
  // Source annotation that started this span.
  annotation: WFDBAnnotation;
};

function getRhythmLabel(annotation: WFDBAnnotation) {
  if (annotation.symbol !== "+" || !annotation.auxNote?.startsWith("(")) {
    return null;
  }

  const label = annotation.auxNote.slice(1).trim();
  return label.length > 0 ? label : null;
}

export function buildWFDBRhythmSpans(
  annotations: WFDBAnnotation[],
  sampleCount?: number,
): WFDBRhythmSpan[] {
  const spans: WFDBRhythmSpan[] = [];
  let activeSpan: WFDBRhythmSpan | null = null;

  for (const annotation of annotations) {
    const label = getRhythmLabel(annotation);
    if (!label) {
      continue;
    }

    if (activeSpan) {
      activeSpan.endSample = annotation.sample;
      spans.push(activeSpan);
    }

    activeSpan = {
      startSample: annotation.sample,
      endSample: sampleCount ?? null,
      label,
      annotation,
    };
  }

  if (activeSpan) {
    spans.push(activeSpan);
  }

  return spans;
}
