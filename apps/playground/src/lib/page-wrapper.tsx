import type { ReactNode } from "react";

export const PageWrapper = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => {
  return (
    <div className="px-8 py-12">
      <div className="max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-base text-muted-foreground">{description}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </div>
    </div>
  );
};

export const DemoCard = ({
  title,
  children,
  fullWidth,
}: {
  title?: string;
  children: ReactNode;
  fullWidth?: boolean;
}) => {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-border bg-muted/50">
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
      )}
      <div className={fullWidth ? "" : "p-4"}>{children}</div>
    </div>
  );
};

export const PropTable = ({
  props,
}: {
  props: { name: string; type: string; default?: string; description: string }[];
}) => {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-left px-4 py-2 font-medium">Prop</th>
            <th className="text-left px-4 py-2 font-medium">Type</th>
            <th className="text-left px-4 py-2 font-medium">Default</th>
            <th className="text-left px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono text-xs">{p.name}</td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.type}</td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.default ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
