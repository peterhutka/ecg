export function buildFilesRoute(path: string) {
  return path ? `/files?path=${encodeURIComponent(path)}` : "/files";
}

export function htmlPreviewSource(content: string) {
  const styles = `
    <style>
      :root {
        color-scheme: light;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #f6f8fb;
        color: #16191f;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        padding: 32px 24px 40px;
        box-sizing: border-box;
      }
      body > * {
        max-width: 760px;
        margin-left: auto;
        margin-right: auto;
      }
      img, video, table {
        max-width: 100%;
      }
      a {
        color: #0972d3;
      }
    </style>
  `;

  if (content.includes("<head>")) {
    return content.replace("<head>", `<head>${styles}`);
  }
  if (content.includes("<body>")) {
    return content.replace("<body>", `<head>${styles}</head><body>`);
  }
  return `<!doctype html><html><head>${styles}</head><body>${content}</body></html>`;
}
