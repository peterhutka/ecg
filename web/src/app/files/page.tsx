import { Suspense } from "react";
import FilesClient from "./FilesClient/FilesClient";

export default function FilesPage() {
  return (
    <Suspense fallback={null}>
      <FilesClient />
    </Suspense>
  );
}
