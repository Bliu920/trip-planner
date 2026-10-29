import { CircleAlert } from "lucide-react";
import type { Reminder } from "./model";

export function Reminders({ items }: { items?: Reminder[] }) {
  if (!items?.length) return null;
  return <ul className="pp-reminders" aria-label="To check">
    {items.map(item => <li key={item.id}><CircleAlert size={14} aria-hidden="true" />
      <span>{item.text}{item.sources?.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">{source.label}{item.sources!.length > 1 ? ` ${index + 1}` : ""}</a>)}</span>
    </li>)}
  </ul>;
}
