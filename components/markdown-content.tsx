"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default function MarkdownContent({content}:{content:string}){
  return <div className="message-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a:({node,...props})=><a {...props} target="_blank" rel="noopener noreferrer"/>,
    table:({node,...props})=><div className="markdown-table"><table {...props}/></div>,
    img:({node,...props})=><img {...props} loading="lazy" decoding="async" alt={props.alt||"交付截图"}/>,
  }}>{content}</Markdown></div>;
}
