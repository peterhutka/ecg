"use client";

import { Box } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import DatFileView from "../DatFileView/DatFileView";
import HtmlFileView from "../HtmlFileView/HtmlFileView";
import TextFileView from "../TextFileView/TextFileView";
import UnsupportedFileView from "../UnsupportedFileView/UnsupportedFileView";

type FileResponse = {
  path: string;
  extension: string;
  size: number;
  supported: boolean;
  content?: string | null;
};

export default function FileClient() {
  const path = useSearchParams().get("path") ?? "";
  const { data: meta, isLoading, isError, error } = useQuery<FileResponse>({
    queryKey: ["file", path],
    enabled: Boolean(path),
    queryFn: async () => {
      const response = await fetch(`http://127.0.0.1:8000/file?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error("Failed to load file");
      return response.json();
    },
  });

  if (!path) {
    return <Box padding="l">No file selected</Box>;
  }

  if (isError) {
    return <Box padding="l">{error instanceof Error ? error.message : "Failed to load file metadata."}</Box>;
  }

  if (isLoading || !meta) {
    return <Box padding="l">Loading file metadata...</Box>;
  }

  switch (meta.extension) {
    case "txt":
      return <TextFileView path={path} content={meta.content ?? ""} />;
    case "htm":
    case "html":
      return <HtmlFileView path={path} content={meta.content ?? ""} />;
    case "dat":
      return <DatFileView path={path} size={meta.size} />;
    default:
      return <UnsupportedFileView path={path} extension={meta.extension ?? ""} />;
  }
}
