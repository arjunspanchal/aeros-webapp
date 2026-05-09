"use client";

// Generic module shell: persistent left sidebar (md+) + main content pane.
// Mobile collapses the sidebar; a floating "☰" button opens it as a drawer.
//
// Caller passes a sidebar JSX (typically <ModuleSidebar sections={...} />)
// and the module label that shows in the mobile drawer header.

import { useState } from "react";

export default function ModuleShell({ sidebar, label = "Menu", children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
      {/* Desktop sidebar — fixed-width left rail, persistent. */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        {sidebar}
      </aside>

      {/* Mobile drawer toggle — only visible below md. Floats above content. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Open ${label} menu`}
        className="md:hidden fixed bottom-4 right-4 z-30 rounded-full bg-gray-900 px-4 py-3 text-xs font-semibold text-white shadow-lg hover:bg-gray-800"
      >
        ☰ {label}
      </button>

      {/* Mobile drawer — slides in from left. */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-white shadow-xl dark:bg-gray-950"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
            <div onClick={() => setDrawerOpen(false)}>{sidebar}</div>
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
    </div>
  );
}
