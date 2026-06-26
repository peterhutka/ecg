import { Suspense } from "react";
import FileClient from "./FileClient/FileClient";

export default function FilePage() {
  return (
    <Suspense fallback={null}>
      <FileClient />
    </Suspense>
  );
}
