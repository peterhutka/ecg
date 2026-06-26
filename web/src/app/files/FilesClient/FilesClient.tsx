"use client";

import {
  Box,
  Button,
  Container,
  Badge,
  Icon,
  Header,
  Table,
  SpaceBetween,
} from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import PathBreadcrumbs from "../../../components/PathBreadcrumbs/PathBreadcrumbs";

type FileEntry = {
  path: string;
  type: "dir" | "file";
};

type FilesResponse = {
  files: FileEntry[];
};

function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function nameOf(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function stemOf(name: string) {
  const index = name.lastIndexOf(".");
  if (index <= 0) {
    return name;
  }
  return name.slice(0, index);
}

function extOf(name: string) {
  const index = name.lastIndexOf(".");
  if (index <= 0) {
    return "";
  }
  return name.slice(index + 1);
}

function extColor(ext: string) {
  const palette = [
    "blue",
    "green",
    "grey",
    "severity-low",
    "severity-medium",
    "severity-neutral",
  ] as const;
  let hash = 0;
  for (const char of ext) {
    hash = (hash * 31 + char.charCodeAt(0)) % palette.length;
  }
  return palette[hash];
}

export default function FilesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = searchParams.get("path") ?? "";

  const { data } = useQuery<FilesResponse>({
    queryKey: ["files"],
    queryFn: async () => {
      const response = await fetch("http://127.0.0.1:8000/files");
      if (!response.ok) {
        throw new Error("Failed to load files");
      }
      return response.json();
    },
  });

  function setPath(nextPath: string) {
    router.push(nextPath ? `/files?path=${nextPath}` : "/files");
  }

  const items = data?.files ?? [];
  const dirs = items
    .filter((file) => file.type === "dir" && parentPath(file.path) === path)
    .sort((a, b) => a.path.localeCompare(b.path));

  const groups = new Map<string, FileEntry[]>();

  for (const file of items) {
    if (file.type !== "file" || parentPath(file.path) !== path) {
      continue;
    }
    const stem = stemOf(nameOf(file.path));
    const group = groups.get(stem);
    if (group) {
      group.push(file);
    } else {
      groups.set(stem, [file]);
    }
  }

  const files = [...groups.entries()]
    .map(([stem, groupedFiles]) => ({
      stem,
      files: groupedFiles.sort((a, b) => {
        const extCompare = extOf(nameOf(a.path)).localeCompare(extOf(nameOf(b.path)));
        if (extCompare !== 0) {
          return extCompare;
        }
        return a.path.localeCompare(b.path);
      }),
    }))
    .sort((a, b) => a.stem.localeCompare(b.stem));

  const rows = [
    ...dirs.map((item) => ({
      kind: "dir" as const,
      key: item.path,
      name: nameOf(item.path),
      path: item.path,
    })),
    ...files.map((item) => ({
      kind: "file" as const,
      key: item.stem,
      name: item.stem,
      files: item.files,
    })),
  ];

  return (
    <Box padding="xl">
      <Container>
        <SpaceBetween size="m">
          <Header variant="h1">Files</Header>
          <PathBreadcrumbs path={path} />

          <div
            style={{
              border: "1px solid var(--color-border-divider-default)",
              borderRadius: 8,
              padding: 4,
              background: "var(--color-background-container-content)",
            }}
          >
            <Table
              wrapLines={false}
              stripedRows
              contentDensity="compact"
              loading={!data}
              empty={<Box padding="m">No entries here.</Box>}
              items={rows}
              trackBy={(item) => item.key}
              columnDefinitions={[
                {
                  id: "name",
                  header: "Name",
                  cell: (item) => (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon
                        name={item.kind === "dir" ? "folder" : "file"}
                        size="small"
                        variant="subtle"
                      />
                      {item.kind === "dir" ? (
                        <Button variant="inline-link" onClick={() => setPath(item.path)}>
                          {item.name}
                        </Button>
                      ) : (
                        <span>{item.name}</span>
                      )}
                    </div>
                  ),
                },
                {
                  id: "extensions",
                  header: "Extensions",
                  cell: (item) =>
                    item.kind === "file" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {item.files.map((file) => {
                          const ext = extOf(nameOf(file.path)) || "no ext";
                          return (
                            <Badge
                              key={file.path}
                              color={extColor(ext)}
                              nativeAttributes={{
                                role: "button",
                                tabIndex: 0,
                                onClick: () => {
                                  router.push(`/file?path=${encodeURIComponent(file.path)}`);
                                },
                                onKeyDown: (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    router.push(`/file?path=${encodeURIComponent(file.path)}`);
                                  }
                                },
                                style: { cursor: "pointer" },
                              }}
                            >
                              {ext}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      ""
                    ),
                },
              ]}
            />
          </div>
        </SpaceBetween>
      </Container>
    </Box>
  );
}
