import React, { useEffect, useRef, useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import Composer from '../components/Composer.jsx';
import { callModerationAPI } from '../lib/api';

/**
 * Chat — modern direct message layout
 * - No logic changed, only layout and motion
 * - Sidebar: compact conversation list
 * - Main area: smooth message animations
 * - Sender toggle: sliding switch with labels
 * - Responsive + fluid height
 */
const initialConversations = [
  {
    id: 'conv-1',
    title: 'Alice',
    avatar: 'https://i.pravatar.cc/48?img=47',
    messages: [
      { id: 1, who: 'Alice', text: 'Hey, did you see the show last night?' },
      { id: 2, who: 'You', text: 'Yeah, it was amazing.' },
    ],
  },
  {
    id: 'conv-2',
    title: 'Sam Runner',
    avatar: 'https://i.pravatar.cc/48?img=32',
    messages: [{ id: 11, who: 'Sam Runner', text: 'Ready for the run tomorrow?' }],
  },
];

export default function Chat({ showToast = () => {} }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConvId, setActiveConvId] = useState(initialConversations[0].id);
  const messagesEndRef = useRef(null);
  const activeConv = conversations.find(c => c.id === activeConvId) || conversations[0];
  const [sendAs, setSendAs] = useState('You');

  useEffect(() => setSendAs('You'), [activeConvId]);
  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [conversations, activeConvId]);

  async function sendMessage(text) {
    const res = await callModerationAPI(text, 'chat');
    if (res.action === 'block') {
      showToast('This message cannot be sent as it violates guidelines.', 'error');
      return { blocked: true };
    }
    if (res.action === 'review') showToast('Message sent (pending review)', 'info');

    setConversations(prev =>
      prev.map(c => {
        if (c.id !== activeConvId) return c;
        const newMessage = { id: Date.now(), who: sendAs, text, pending: res.action === 'review' };
        return { ...c, messages: [...c.messages, newMessage] };
      })
    );
    return { ok: true };
  }

  return (
    <div className="flex h-[calc(100vh-56px)] max-w-5xl mx-auto overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Sidebar */}
      <aside className="w-1/3 min-w-[240px] border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConvId(conv.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                conv.id === activeConvId ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <img src={conv.avatar} alt="" className="h-10 w-10 rounded-full" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">{conv.title}</div>
                <div className="truncate text-xs text-gray-500">{conv.messages.at(-1).text}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat Panel */}
      <section className="flex flex-1 flex-col bg-gray-50">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={activeConv.avatar} alt="" className="h-9 w-9 rounded-full ring-1 ring-gray-200" />
            <div className="font-medium text-gray-900">{activeConv.title}</div>
          </div>
          <SenderToggle activeConv={activeConv} sendAs={sendAs} setSendAs={setSendAs} />
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <AnimatePresence>
            {activeConv.messages.map(m => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${m.who === 'You' ? 'justify-end' : 'justify-start'}`}
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className={`max-w-xs break-words px-4 py-2 rounded-2xl text-sm shadow-sm ${
                    m.who === 'You'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  {m.text}
                  {m.pending && <span className="ml-2 text-xs opacity-70">(Pending)</span>}
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <Composer placeholder={`Message as ${sendAs}...`} onSend={sendMessage} />
        </div>
      </section>
    </div>
  );
}

/** Sender Toggle — sliding switch, smooth motion */
function SenderToggle({ activeConv, sendAs, setSendAs }) {
  const isYou = sendAs === 'You';
  const toggle = () => setSendAs(isYou ? activeConv.title : 'You');

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Send as:</span>
      <button
        onClick={toggle}
        className="relative h-8 w-36 rounded-full bg-gray-200 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <motion.div
          className="h-6 w-[calc(50%-4px)] rounded-full bg-white shadow"
          animate={{ x: isYou ? 0 : '100%' }}
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-3 text-xs font-medium">
          <span className={isYou ? 'text-blue-600' : 'text-gray-600'}>You</span>
          <span className={!isYou ? 'text-blue-600' : 'text-gray-600'}>{activeConv.title}</span>
        </div>
      </button>
    </div>
  );
}

