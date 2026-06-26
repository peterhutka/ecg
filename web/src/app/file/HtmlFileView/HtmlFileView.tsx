"use client";

import { AppLayout, Box, Container, SpaceBetween } from "@cloudscape-design/components";
import PathBreadcrumbs from "../../../components/PathBreadcrumbs/PathBreadcrumbs";
import { htmlPreviewSource } from "../html/html-file-utils";

export default function HtmlFileView({ path, content }: { path: string; content: string }) {
  return (
    <AppLayout
      navigationHide
      content={
        <Box padding="l">
          <SpaceBetween size="m">
            <PathBreadcrumbs path={path} />
            <Container>
              <iframe title={path} srcDoc={htmlPreviewSource(content)} style={{ width: "100%", height: "78vh", border: 0 }} />
            </Container>
          </SpaceBetween>
        </Box>
      }
    />
  );
}
