import React, { useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

/**
 * Modern toast — half-page floating sheet style
 * - Clean glassy background, rounded corners, slight blur
 * - Auto-dismiss in 3 seconds
 * - Type-based icon + color accent
 * - Fully responsive bottom placement
 */
export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 size={22} />,
    error: <AlertCircle size={22} />,
    info: <Info size={22} />,
  };

  const colors = {
    success: 'from-green-500/80 to-emerald-400/80',
    error: 'from-red-500/80 to-rose-500/80',
    info: 'from-blue-500/80 to-indigo-500/80',
  }[type];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="
          fixed bottom-6 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2
          backdrop-blur-md rounded-2xl px-4 py-3 shadow-lg text-white
          bg-gradient-to-br
        "
        style={{ backgroundImage: undefined }}
      >
        <div
          className={`flex items-center gap-3 bg-gradient-to-br ${colors} rounded-xl px-4 py-3`}
        >
          <span className="shrink-0">{icons[type]}</span>
          <span className="flex-1 text-sm font-medium leading-snug">
            {message}
          </span>
          <button
            onClick={onClose}
            className="ml-2 text-lg font-bold text-white/80 hover:text-white focus:outline-none"
            aria-label="Close notification"
          >
            &times;
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
