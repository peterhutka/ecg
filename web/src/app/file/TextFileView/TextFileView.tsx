"use client";

import { AppLayout, Box, SpaceBetween } from "@cloudscape-design/components";
import PathBreadcrumbs from "../../../components/PathBreadcrumbs/PathBreadcrumbs";

export default function TextFileView({ path, content }: { path: string; content: string }) {
  return (
    <AppLayout
      navigationHide
      content={
        <Box padding="l">
          <SpaceBetween size="m">
            <PathBreadcrumbs path={path} />
            <div style={{ border: "1px solid var(--color-border-divider-default)", borderRadius: 8, padding: 16 }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{content}</pre>
            </div>
          </SpaceBetween>
        </Box>
      }
    />
  );
}
