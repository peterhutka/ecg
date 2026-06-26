"use client";

import { Box } from "@cloudscape-design/components";
import type { HeaField } from "../dat/dat-file-utils";

export default function DatKeyValueRows({ fields }: { fields: HeaField[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {fields.map((field) => (
        <div
          key={`${field.label}-${field.value}`}
          style={{
            display: "grid",
            gridTemplateColumns: "108px minmax(0, 1fr)",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <Box color="text-body-secondary" fontSize="body-s">
            {field.label}
          </Box>
          <Box fontSize="body-s">{field.value}</Box>
        </div>
      ))}
    </div>
  );
}
