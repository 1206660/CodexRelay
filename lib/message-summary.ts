/** Compatibility preview for legacy messages; this is extraction, not AI summarization. */
export function messageSummary(content: string) {
  const line = content.split(/\r?\n/).find(l => l.trim() && !/^\s*```/.test(l)) ?? "查看消息详情";
  return line.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().slice(0, 160) || "查看消息详情";
}
