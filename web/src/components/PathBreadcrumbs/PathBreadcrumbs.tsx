"use client";

import { BreadcrumbGroup } from "@cloudscape-design/components";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

function partsOf(path: string) {
  return path ? path.split("/").filter(Boolean) : [];
}

export default function PathBreadcrumbs({ path }: { path: string }) {
  const router = useRouter();
  const parts = useMemo(() => partsOf(path), [path]);
  const items = useMemo(
    () => [
      { text: "Files", href: "/files" },
      ...parts.map((part, index) => {
        const nextPath = parts.slice(0, index + 1).join("/");
        return {
          text: part,
          href: `/files?path=${encodeURIComponent(nextPath)}`,
        };
      }),
    ],
    [parts],
  );
  const handleFollow = useCallback(
    (event: { preventDefault: () => void; detail: { href?: string } }) => {
      event.preventDefault();
      const href = event.detail.href ?? "/files";
      const nextPath =
        href === "/files" ? "" : new URL(href, "http://localhost").searchParams.get("path") ?? "";
      router.push(nextPath ? `/files?path=${encodeURIComponent(nextPath)}` : "/files");
    },
    [router],
  );

  return (
    <BreadcrumbGroup
      ariaLabel="Breadcrumbs"
      items={items}
      onFollow={handleFollow}
    />
  );
}
