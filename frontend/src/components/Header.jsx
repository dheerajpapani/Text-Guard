import React, { useEffect } from 'react';
import { Home, MessageCircle, TerminalSquare } from 'lucide-react';

export default function Header({ onNavigate = () => {} }) {
  // ensure the app runs in light mode (removes leftover 'dark' class)
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div className="sticky top-0 z-20 w-full border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        {/* Logo */}
        <button
          onClick={() => onNavigate('/')}
          className="select-none text-2xl font-bold tracking-tight text-gray-900 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          style={{ fontFamily: "'Grand Hotel', cursive" }}
          aria-label="InstaMod Home"
        >
          InstaMod
        </button>

        {/* Actions (no dark tiles, just clean icon buttons) */}
        <nav className="flex items-center gap-2 text-gray-700">
          <IconButton ariaLabel="Home" title="Home" onClick={() => onNavigate('/')}>
            <Home size={20} />
          </IconButton>
          <IconButton ariaLabel="Messages" title="Messages" onClick={() => onNavigate('/chat')}>
            <MessageCircle size={20} />
          </IconButton>
          <IconButton ariaLabel="Admin Console" title="Admin Console" onClick={() => onNavigate('/admin')}>
            <TerminalSquare size={20} />
          </IconButton>

          {/* Avatar */}
          <button
            title="Demo User"
            aria-label="Demo User"
            className="ml-1 inline-flex h-9 w-9 select-none items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            IM
          </button>
        </nav>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, title, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
    >
      <span className="pointer-events-none leading-none">
        {children /* lucide icons inherit currentColor; crisp on white */}
      </span>
    </button>
  );
}
