"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown } from "lucide-react";
import { messageSummary } from "../lib/message-summary";
export default function MessageBody({ content, summary }: { content: string; summary?: string }) {
  return <details className="message-details"><summary><span className="message-summary">{summary || messageSummary(content)}</span><span className="message-expand"><span className="when-closed">展开</span><span className="when-open">收起</span><ChevronDown size={13}/></span></summary>
    <div className="message-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer"/>,
      table: ({ node, ...props }) => <div className="markdown-table"><table {...props}/></div>,
    }}>{content}</Markdown></div>
  </details>;
}
