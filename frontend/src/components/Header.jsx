import React, { useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, Type } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Check Text', icon: Type },
  { to: '/review', label: 'Review', icon: ShieldAlert },
];

export default function Header() {
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <header className="sticky top-0 z-20 px-3 py-3 sm:px-5">
      <div className="tg-shell tg-header-wrap mx-auto flex items-center justify-between px-4 py-3 sm:px-6">
        <NavLink to="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/18 bg-[linear-gradient(145deg,_rgba(49,203,195,0.92),_rgba(76,92,211,0.84))] text-white shadow-[0_0_28px_rgba(88,113,255,0.25)]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">Text Guard</div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Signal Review System</div>
          </div>
        </NavLink>

        <nav className="relative flex items-center gap-1 rounded-full border border-white/10 bg-white/6 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="relative"
              >
                <div className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition ${isActive ? 'text-white' : 'text-slate-300 hover:text-white'}`}>
                  {isActive ? (
                    <Motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full border border-cyan-300/16 bg-[linear-gradient(135deg,_rgba(73,211,190,0.22),_rgba(255,255,255,0.08))] shadow-[0_0_20px_rgba(73,211,190,0.14),inset_0_1px_0_rgba(255,255,255,0.1)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative z-10">
                    <ItemIcon size={16} />
                  </span>
                  <span className="relative z-10">{item.label}</span>
                </div>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
