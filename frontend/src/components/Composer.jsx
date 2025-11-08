import React, { useState } from 'react';
import { Send } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

/**
 * Composer — clean, modern input bar for comments/messages
 * - Keeps your original logic (onSend, Enter-to-send, etc.)
 * - Replaces "Post" text with a sleek animated send icon
 * - Soft transitions and light-only design (Insta aesthetic)
 */
export default function Composer({ onSend, placeholder = "Add a comment..." }) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const content = text.trim();
    if (!content || isSending) return;

    setIsSending(true);
    try {
      const result = await onSend(content);
      if (!result || !result.blocked) setText('');
    } catch (error) {
      console.error("Error in onSend:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative flex items-center gap-2"
    >
      {/* Input Field */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isSending}
        className="
          flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm
          text-gray-900 placeholder-gray-400 shadow-inner transition-all
          focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-300
          disabled:opacity-50
        "
      />

      {/* Send Button */}
      <motion.button
        type="submit"
        whileTap={{ scale: 0.9 }}
        disabled={isSending || text.trim().length === 0}
        className={`
          relative inline-flex items-center justify-center rounded-full
          bg-gradient-to-br from-blue-500 to-indigo-500 text-white
          shadow-md transition-all duration-200 ease-out
          hover:shadow-lg hover:from-blue-600 hover:to-indigo-600
          focus:outline-none focus:ring-2 focus:ring-blue-400
          ${isSending ? 'opacity-50 cursor-wait' : 'opacity-100'}
          h-9 w-9
        `}
      >
        {isSending ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="border-t-2 border-white rounded-full w-4 h-4"
          />
        ) : (
          <Send size={18} />
        )}
      </motion.button>
    </form>
  );
}
