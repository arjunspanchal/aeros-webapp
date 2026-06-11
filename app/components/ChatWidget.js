'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const bottomRef = useRef(null);

  const { messages, input, handleInputChange, handleSubmit, append, isLoading, error } = useChat({
    api: '/api/chat',
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hi, I'm **PackAI** 👋\n\nTell me what you're building — a café, restaurant, cloud kitchen or hotel — and I'll help you work out the packaging it needs. Or ask me about any product in the Aeros range.",
      },
    ],
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

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

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[22rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:w-96">
          {/* Header */}
          <div className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold">Aeros PackAI</p>
              <p className="text-xs text-white/70">Packaging assistant · Always online</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '420px', minHeight: '280px' }}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ' +
                    (m.role === 'user'
                      ? 'rounded-br-sm bg-ink-900 text-white'
                      : 'rounded-bl-sm bg-gray-100 text-gray-800')
                  }
                >
                  <MessageContent content={m.content} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3">
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

          {/* Suggested questions — shown only before user sends anything */}
          {messages.length === 1 && (
            <div className="border-t border-gray-100 px-4 py-2 flex flex-wrap gap-1.5">
              {[
                'I\'m opening a café — what packaging will I need?',
                'How do I deliver a hot beverage safely?',
                'Do you have 12oz double wall cups?',
                'Show me clearance deals',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => append({ role: 'user', content: q })}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 transition hover:bg-ink-100 hover:border-ink-200 hover:text-ink-900"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-3"
          >
            <input
              id="chat-input"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about our products…"
              autoComplete="off"
              className="flex-1 rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-ink-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink-200"
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

// Render markdown-lite: bold (**text**), newlines
function MessageContent({ content }) {
  if (!content) return null;
  const parts = content.split(/(\*\*[^*]+\*\*|\n)/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) => {
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
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
