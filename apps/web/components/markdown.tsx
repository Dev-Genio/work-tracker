"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders assistant markdown answers. Styled with the typography plugin,
 * tuned for our dark theme and compact chat bubbles.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm prose-invert max-w-none",
        // tighten the default prose vertical rhythm for chat
        "prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1.5",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-pre:my-2 prose-pre:bg-muted/60 prose-pre:border prose-pre:text-xs",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-code:bg-muted/60 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:font-medium",
        "prose-a:text-primary prose-a:underline-offset-2",
        "prose-table:text-xs prose-th:px-2 prose-td:px-2 prose-table:my-2",
        "prose-hr:my-3",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
