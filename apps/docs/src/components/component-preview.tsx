import { type ReactNode, useState } from "react";
import { CodeBlock } from "./code-block";

interface ComponentPreviewProps {
  children: ReactNode;
  code: string;
}

export function ComponentPreview({ children, code }: ComponentPreviewProps) {
  const [tab, setTab] = useState<"preview" | "code">("preview");

  return (
    <div className="rounded-lg border border-neutral-200 overflow-hidden">
      <div className="flex border-b border-neutral-200 bg-neutral-50">
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            tab === "preview"
              ? "text-neutral-900 border-b-2 border-neutral-900 -mb-px bg-white"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setTab("code")}
          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            tab === "code"
              ? "text-neutral-900 border-b-2 border-neutral-900 -mb-px bg-white"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Code
        </button>
      </div>
      {tab === "preview" ? (
        <div className="p-0">{children}</div>
      ) : (
        <CodeBlock code={code} />
      )}
    </div>
  );
}
