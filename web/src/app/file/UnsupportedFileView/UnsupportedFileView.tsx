"use client";

import { AppLayout, Box, SpaceBetween } from "@cloudscape-design/components";
import PathBreadcrumbs from "../../../components/PathBreadcrumbs/PathBreadcrumbs";

export default function UnsupportedFileView({ path, extension }: { path: string; extension: string }) {
  return (
    <AppLayout
      navigationHide
      content={
        <Box padding="l">
          <SpaceBetween size="m">
            <PathBreadcrumbs path={path} />
            <Box color="text-body-secondary">Unsupported file type: {extension || "unknown"}</Box>
          </SpaceBetween>
        </Box>
      }
    />
  );
}
