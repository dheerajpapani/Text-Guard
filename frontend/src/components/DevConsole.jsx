import React, { useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAdminLogs } from '../lib/api';
import { AlertTriangle, ShieldBan, Terminal } from 'lucide-react';

/**
 * Developer Console (Admin Log Viewer)
 * - Loads logs once per mount
 * - Clean card UI with color-coded actions
 * - Subtle fade-in motion for logs
 * - Scrollable view with consistent padding
 * - Follows light Insta-style theme
 */
export default function DevConsole({ showToast }) {
  const [allLogs, setAllLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false); // prevents multiple reloads

  useEffect(() => {
    if (isLoaded) return; // prevents repeated fetches
    const loadLogs = async () => {
      setIsLoading(true);
      const result = await fetchAdminLogs();

      if (result.error) {
        showToast(result.error, 'error');
        setAllLogs([]);
      } else {
        showToast(`Fetched ${result.n} blocked log(s).`, 'success');
        setAllLogs(result.results || []);
      }

      setIsLoading(false);
      setIsLoaded(true);
    };
    loadLogs();
  }, [showToast, isLoaded]);

  const getActionColor = (action) => {
    switch (action) {
      case 'block':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'review':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Terminal className="text-blue-500" size={22} />
          Admin Log Viewer
        </h1>
        <div className="text-sm text-gray-500">Viewing blocked or reviewed logs</div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading logs...</div>
        ) : allLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No blocked messages found.</div>
        ) : (
          <div className="max-h-[75vh] overflow-auto space-y-4 p-4">
            <AnimatePresence>
              {allLogs.map((log) => (
                <motion.div
                  key={log._id || log.ts}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm hover:shadow-md transition-all"
                >
                  {/* Original text */}
                  <div className="mb-2">
                    <p className="text-gray-900 text-base font-medium">{log.raw}</p>
                    <span className="text-xs text-gray-500">
                      {new Date(log.ts * 1000).toLocaleString()}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-xs font-semibold text-gray-500">Action</div>
                      <div
                        className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${getActionColor(
                          log.action
                        )}`}
                      >
                        {log.action === 'block' && <ShieldBan size={14} />}
                        {log.action === 'review' && <AlertTriangle size={14} />}
                        {log.action?.toUpperCase() || 'N/A'}
                      </div>
                    </div>

                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-xs font-semibold text-gray-500">Matched Word</div>
                      <div className="mt-1 font-mono text-sm text-red-600 font-semibold">
                        {log.matched_seed || 'N/A'}
                      </div>
                    </div>

                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-xs font-semibold text-gray-500">AI Score</div>
                      <div className="mt-1 font-mono text-sm text-gray-800">
                        {log.score ? log.score.toFixed(2) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
