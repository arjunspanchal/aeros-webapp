'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

const WELCOME =
  "Hi, I'm **PackAI** 👋\n\nTell me what you're building — a café, restaurant, cloud kitchen or hotel — and I'll help you work out the packaging it needs. Or ask me about any product in the Aeros range.";

const STARTERS = [
  "I'm opening a café — what packaging will I need?",
  'How do I deliver a hot beverage safely?',
  'Do you have 12oz double wall cups?',
  'Show me clearance deals',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const { messages, input, handleInputChange, handleSubmit, append, isLoading, error } = useChat({
    api: '/api/chat',
    initialMessages: [{ id: 'welcome', role: 'assistant', content: WELCOME }],
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Focus the input when the panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Page sections (e.g. the PackAI homepage block) can open the chat —
  // optionally pre-asking a question — via a window event.
  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      const q = e?.detail?.question;
      if (q) append({ role: 'user', content: q });
    };
    window.addEventListener('aeros:open-chat', onOpen);
    return () => window.removeEventListener('aeros:open-chat', onOpen);
  }, [append]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close PackAI' : 'Open PackAI'}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ink-900 text-white shadow-lg transition hover:bg-ink-800 focus:outline-none focus:ring-4 focus:ring-ink-200"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat panel — mobile-safe width (never wider than viewport minus the margins) */}
      {open && (
        <div
          role="dialog"
          aria-label="PackAI chat"
          className="fixed bottom-24 right-4 sm:right-6 z-50 flex w-[calc(100vw-2rem)] max-w-[24rem] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Aeros PackAI</p>
              <p className="text-xs text-white/70">Packaging assistant · Free</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'min(60vh, 460px)', minHeight: '260px' }}>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ' +
                    (m.role === 'user'
                      ? 'rounded-br-sm bg-ink-900 text-white'
                      : 'rounded-bl-sm bg-ink-100 text-ink-800')
                  }
                >
                  <MessageContent content={m.content} isUser={m.role === 'user'} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-ink-100 px-4 py-3">
                  <TypingDots />
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                Something went wrong. Please try again.
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Starter questions — shown only before the user sends anything */}
          {messages.length === 1 && (
            <div className="border-t border-ink-100 px-4 py-2 flex flex-wrap gap-1.5">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => append({ role: 'user', content: q })}
                  className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-600 transition hover:bg-ink-100 hover:border-ink-400 hover:text-ink-900"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-ink-200 bg-white px-3 py-3">
            <input
              ref={inputRef}
              id="chat-input"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask PackAI anything…"
              autoComplete="off"
              className="flex-1 rounded-full border border-ink-200 bg-ink-50 px-4 py-2 text-sm text-ink-900 focus:border-ink-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink-200"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white transition hover:bg-ink-800 disabled:opacity-40"
            >
              <svg className="h-4 w-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// Markdown-lite renderer: **bold**, [text](url) links, and newlines.
// Links open in a new tab and are the load-bearing UX — product links must
// be clickable, not raw markdown.
function MessageContent({ content, isUser }) {
  if (!content) return null;
  // Split on the three constructs we render, keeping the delimiters.
  const parts = content.split(/(\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\)|\*\*[^*]+\*\*|\n)/g);
  const linkClass = isUser
    ? 'underline underline-offset-2 hover:opacity-80'
    : 'font-medium text-ink-900 underline underline-offset-2 decoration-ink-400 hover:decoration-ink-900';
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (!part) return null;
        const link = /^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/.exec(part);
        if (link) {
          return (
            <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {link[1]}
            </a>
          );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part === '\n') return <br key={i} />;
        return part;
      })}
    </p>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1" aria-label="PackAI is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-ink-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
