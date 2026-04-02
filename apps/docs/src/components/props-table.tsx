interface Prop {
  name: string;
  type: string;
  default?: string;
  description: string;
}

interface PropsTableProps {
  props: Prop[];
}

export function PropsTable({ props }: PropsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 text-left font-medium text-neutral-900">Prop</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-900">Type</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-900">Default</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-900">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3">
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono text-neutral-900">{prop.name}</code>
              </td>
              <td className="px-4 py-3">
                <code className="text-xs font-mono text-neutral-600">{prop.type}</code>
              </td>
              <td className="px-4 py-3">
                {prop.default ? (
                  <code className="text-xs font-mono text-neutral-600">{prop.default}</code>
                ) : (
                  <span className="text-xs text-neutral-400">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-600">{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
