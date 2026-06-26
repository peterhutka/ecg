"use client";

import { Box, ProgressBar } from "@cloudscape-design/components";
import { formatSize } from "../dat/dat-file-utils";

import type { StreamFileState } from "../../../hooks/use-stream-file";

export default function DatLoadStatus({ state }: { state: StreamFileState }) {
  if (state.status === "loading") {
    return (
      <ProgressBar
        label="Loading ECG data"
        description="Streaming file bytes into browser memory"
        value={state.totalBytes > 0 ? (state.loadedBytes / state.totalBytes) * 100 : 0}
        additionalInfo={`${formatSize(state.loadedBytes)} / ${formatSize(state.totalBytes)}`}
      />
    );
  }

  if (state.status === "loaded") {
    return null;
  }

  if (state.status === "error") {
    return <Box color="text-body-secondary">{state.message}</Box>;
  }

  return <Box color="text-body-secondary">Preparing file stream...</Box>;
}
