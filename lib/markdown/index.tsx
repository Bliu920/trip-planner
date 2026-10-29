"use client";

import { useId } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./markdown.css";

const components: Components = {
  a: ({ href, title, children }) => href ? <a href={href} title={title} target={href.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a> : <span>{children}</span>,
  pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
  table: ({ children }) => <div className="markdown-table" role="region" aria-label="Table" tabIndex={0}><table>{children}</table></div>,
};
const plugins = [remarkGfm];

export function MarkdownText({ text, id }: { text: string; id?: string }) {
  const prefix = useId();
  // Render structured reply text.
  return <div id={id} className="chat-markdown">
    <Markdown skipHtml remarkPlugins={plugins} remarkRehypeOptions={{ clobberPrefix: `${prefix}-` }} components={components}>{text}</Markdown>
  </div>;
}
