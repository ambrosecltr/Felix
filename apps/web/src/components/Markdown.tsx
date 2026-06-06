import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders Felix's markdown replies with compact, kid-friendly styling. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="whitespace-normal text-sm leading-5 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_li>*:first-child]:mt-0 [&_li>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="my-1" {...props} />,
          h1: (props) => <h1 className="mb-1 mt-3 text-base font-semibold" {...props} />,
          h2: (props) => <h2 className="mb-1 mt-3 text-sm font-semibold" {...props} />,
          h3: (props) => <h3 className="mb-1 mt-2 text-sm font-semibold" {...props} />,
          ul: (props) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...props} />,
          ol: (props) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...props} />,
          li: (props) => (
            <li
              className="pl-0.5 leading-5 marker:text-muted-foreground [&>p]:my-0 [&>p+p]:mt-1 [&>ol]:mt-1 [&>ul]:mt-1"
              {...props}
            />
          ),
          strong: (props) => <strong className="font-semibold" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          a: (props) => (
            <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
          ),
          blockquote: (props) => (
            <blockquote className="my-1.5 border-l-2 border-border pl-3 text-muted-foreground" {...props} />
          ),
          hr: () => <hr className="my-2 border-border" />,
          code: ({ className, children, ...props }) => {
            const isBlock = (className ?? "").includes("language-");
            if (isBlock) {
              return (
                <code className="block" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="my-1.5 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-foreground"
              {...props}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
