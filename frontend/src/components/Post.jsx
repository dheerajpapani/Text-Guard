import React, { useState } from 'react';
import Composer from './Composer.jsx';
import { callModerationAPI } from '../lib/api';
import { Heart, MessageCircle } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

export default function Post({ post, showToast = () => {} }) {
  const [comments, setComments] = useState(post.initialComments || []);

  async function addComment(text) {
    const res = await callModerationAPI(text, 'comment');
    if (res.action === 'block') {
      showToast('This comment cannot be posted as it violates guidelines.', 'error');
      return { blocked: true };
    }
    if (res.action === 'review') showToast('Comment sent — pending review', 'info');

    const newComment = { id: Date.now(), author: 'DemoUser', text, pending: res.action === 'review' };
    setComments(prev => [...prev, newComment]);
    return { ok: true };
  }

  return (
    <article className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-3">
        <img src={post.avatar} alt={post.author} className="h-9 w-9 rounded-full ring-1 ring-gray-200" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-gray-900">{post.author}</div>
          <div className="text-xs text-gray-500">{post.time}</div>
        </div>
      </header>

      {/* Media */}
      <div className="bg-gray-100">
        <div className="relative w-full aspect-square">
          <img
            src={`https://picsum.photos/seed/post-${post.id}/800/800`}
            alt="Post content"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        </div>
      </div>

      {/* Actions — icon-only (no circular tiles) */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-4">
          <ActionIcon ariaLabel="Like"><Heart size={22} strokeWidth={2} /></ActionIcon>
          <ActionIcon ariaLabel="Comment"><MessageCircle size={22} strokeWidth={2} /></ActionIcon>
        </div>
      </div>

      {/* Caption */}
      <div className="px-3 pt-2 pb-1 text-sm text-gray-900">
        <span className="font-semibold">{post.author}</span>
        <span className="ml-2">{post.caption}</span>
      </div>

      {/* Comments */}
      <div className="space-y-2 px-3 pb-2">
        {comments.length > 2 && (
          <button className="text-sm font-medium text-gray-500 hover:text-gray-700" type="button">
            View all {comments.length} comments
          </button>
        )}
        {comments.slice(-2).map(c => (
          <div key={c.id} className="text-sm text-gray-900">
            <span className="font-semibold">{c.author}</span>
            <span className="ml-2">{c.text}</span>
            {c.pending && <span className="ml-2 text-xs text-gray-400">(Pending)</span>}
          </div>
        ))}
      </div>

      {/* Comment Input */}
      <div className="border-t border-gray-100 px-3 py-3">
        <Composer placeholder="Add a comment..." onSend={addComment} />
      </div>
    </article>
  );
}

function ActionIcon({ children, ariaLabel }) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      whileTap={{ scale: 0.92 }}
      className="inline-flex items-center justify-center text-gray-700 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-md"
    >
      {children}
    </motion.button>
  );
}
