import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  basePath?: string;
}

export const MarkdownRenderer = ({ content, basePath }: MarkdownRendererProps) => {
  return (
    <div className="markdown-content text-on-surface/80 text-sm leading-relaxed space-y-4">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => <h1 className="text-2xl font-bold font-display mt-8 mb-4 text-primary" {...props} />,
          h2: ({ ...props }) => <h2 className="text-xl font-bold font-display mt-8 mb-3 text-primary/80 border-b border-on-surface/5 pb-2" {...props} />,
          h3: ({ ...props }) => <h3 className="text-lg font-bold font-display mt-6 mb-2" {...props} />,
          h4: ({ ...props }) => <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface/40 mt-6 mb-2" {...props} />,
          p: ({ ...props }) => <p className="mb-4" {...props} />,
          ul: ({ ...props }) => <ul className="list-disc pl-5 mb-4 space-y-2" {...props} />,
          ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-2" {...props} />,
          li: ({ ...props }) => <li className="pl-1" {...props} />,
          blockquote: ({ ...props }) => <blockquote className="border-l-4 border-primary/20 pl-4 italic text-on-surface/60 my-4" {...props} />,
          code: ({ ...props }) => <code className="bg-on-surface/5 px-1.5 py-0.5 rounded font-mono text-[13px] text-primary" {...props} />,
          pre: ({ ...props }) => <pre className="bg-on-surface/[0.03] p-4 rounded-lg border border-on-surface/5 overflow-x-auto my-4 font-mono text-[12px]" {...props} />,
          img: ({ ...props }) => {
            let src = props.src;
            if (src && src.startsWith('./') && basePath) {
              // Convert relative path to media:// protocol path
              src = `media://${basePath}/${src.substring(2)}`;
            }
            return (
              <div className="my-6 space-y-2">
                <img 
                  {...props} 
                  src={src}
                  className="rounded-lg border border-on-surface/5 shadow-ambient max-w-full"
                  loading="lazy"
                />
                {props.alt && <p className="text-[10px] font-bold text-center text-on-surface/30 uppercase tracking-widest">{props.alt}</p>}
              </div>
            );
          },
          hr: () => <hr className="border-on-surface/5 my-8" />,
          strong: ({ node, ...props }) => <strong className="font-bold text-on-surface" {...props} />,
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          a: ({ node, ...props }) => <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
