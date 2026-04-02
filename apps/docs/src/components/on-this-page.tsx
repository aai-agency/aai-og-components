interface TocItem {
  title: string;
  id: string;
}

interface OnThisPageProps {
  items: TocItem[];
}

export function OnThisPage({ items }: OnThisPageProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-neutral-900">On This Page</p>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
