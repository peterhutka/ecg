"use client";

import { useEffect, useState } from "react";

export type StreamFileState =
  | { status: "idle" }
  | { status: "loading"; loadedBytes: number; totalBytes: number }
  | { status: "loaded"; totalBytes: number }
  | { status: "error"; message: string };

type UseStreamFileOptions = {
  url: string;
  totalBytes: number;
  enabled?: boolean;
};

function concatChunks(chunks: Uint8Array[]) {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function useStreamFile({ url, totalBytes, enabled = true }: UseStreamFileOptions) {
  const [state, setState] = useState<StreamFileState>({ status: "idle" });
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function load() {
      setState({ status: "loading", loadedBytes: 0, totalBytes });
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error("Failed to stream file");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          chunks.push(value);
          loadedBytes += value.length;
          if (active) {
            setState({ status: "loading", loadedBytes, totalBytes });
          }
        }
      }

      if (active) {
        const nextBytes = concatChunks(chunks);
        setBytes(nextBytes);
        setState({ status: "loaded", totalBytes: totalBytes || nextBytes.length });
      }
    }

    load().catch((error: unknown) => {
      if (!active) {
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load file";
      setBytes(null);
      setState({ status: "error", message });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, totalBytes, url]);

  return {
    state: enabled ? state : ({ status: "idle" } as const),
    bytes: enabled ? bytes : null,
  };
}
