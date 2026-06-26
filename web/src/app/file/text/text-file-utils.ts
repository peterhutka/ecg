export function buildFilesRoute(path: string) {
  return path ? `/files?path=${encodeURIComponent(path)}` : "/files";
}
