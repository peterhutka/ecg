import {
  AppLayout,
  Box,
  Container,
  Header,
  SpaceBetween,
} from "@cloudscape-design/components";

export default function Home() {
  return (
    <AppLayout
      content={
        <Box padding="xl" className="hello-shell">
          <Container>
            <SpaceBetween size="m">
              <Header
                variant="h1"
                description="Cloudscape is wired in and ready for the ECG workflow."
              >
                Hello ECG
              </Header>
              <Box color="text-body-secondary">
                The frontend is now a minimal Next.js app with AWS Cloudscape
                styling ready for ECG visualization, annotations, and feature
                workflows.
              </Box>
            </SpaceBetween>
          </Container>
        </Box>
      }
      navigationHide
      toolsHide
      headerSelector="body"
      ariaLabels={{
        navigation: "Navigation",
        navigationClose: "Close navigation",
        navigationToggle: "Toggle navigation",
        tools: "Tools",
        toolsClose: "Close tools",
        toolsToggle: "Toggle tools",
      }}
    />
  );
}
