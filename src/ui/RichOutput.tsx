import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { artifactExtension, downloadOutput } from '../output/artifacts'

export function RichOutput({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`rich-output text-sm leading-7 text-ink ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 mt-2 border-b border-line pb-3 text-2xl font-black tracking-tight text-ink">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-7 text-lg font-extrabold tracking-tight text-ink">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-5 text-base font-bold text-ink">{children}</h3>,
          p: ({ children }) => <p className="my-3 text-ink-soft">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-ink-soft">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-ink-soft">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-4 rounded-r-xl border-l-4 border-accent bg-accent-ring px-4 py-1 italic text-ink-soft">{children}</blockquote>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-accent underline decoration-accent/35 underline-offset-2 hover:decoration-accent">{children}</a>,
          code: ({ className: codeClass, children }) => codeClass
            ? <code className="block overflow-x-auto rounded-xl bg-[#0f2026] p-4 font-mono text-xs leading-6 text-[#dcebed]">{children}</code>
            : <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[.88em] text-ink">{children}</code>,
          table: ({ children }) => <div className="my-5 overflow-x-auto rounded-xl border border-line"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-surface-2 text-ink">{children}</thead>,
          th: ({ children }) => <th className="border-b border-line px-3 py-2.5 font-bold">{children}</th>,
          td: ({ children }) => <td className="border-b border-line-soft px-3 py-2.5 align-top text-ink-soft">{children}</td>,
          hr: () => <hr className="my-6 border-line" />,
        }}
      >{content}</ReactMarkdown>
    </div>
  )
}

export function OutputActions({ content, format, title, compact = false }: { content: string; format: string; title: string; compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'exporting' | 'copied' | 'error'>('idle')
  const extension = artifactExtension(format).toUpperCase()

  const copy = async () => {
    try { setStatus('copying'); await navigator.clipboard.writeText(content); setStatus('copied'); setTimeout(() => setStatus('idle'), 1600) }
    catch { setStatus('error') }
  }
  const download = async () => {
    try { setStatus('exporting'); await downloadOutput(content, format, title); setStatus('idle') }
    catch { setStatus('error') }
  }

  return <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'border-t border-line pt-3'}`}>
    <button type="button" onClick={() => void download()} disabled={status === 'exporting'} className="rounded-full bg-solid px-3.5 py-2 text-[11px] font-bold text-on-solid disabled:opacity-50">{status === 'exporting' ? 'Building file…' : `Download ${extension}`}</button>
    <button type="button" onClick={() => void copy()} className="rounded-full bg-surface-2 px-3.5 py-2 text-[11px] font-bold text-ink-soft hover:text-ink">{status === 'copied' ? 'Copied' : 'Copy answer'}</button>
    {status === 'error' && <span className="text-[11px] font-semibold text-warn">Could not create the file. Try again.</span>}
  </div>
}
