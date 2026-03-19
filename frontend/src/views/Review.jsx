import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { AlertTriangle, CheckCheck, CircleCheckBig, ShieldBan, ShieldCheck, Terminal, UserCheck } from 'lucide-react';
import { applyReviewDecision, assignReviewOwner, fetchAdminLogs } from '../lib/api.js';

const actionOptions = ['all', 'review', 'block', 'allow'];
const statusOptions = ['all', 'open', 'resolved', 'decided'];

export default function Review({ showToast }) {
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draftNotes, setDraftNotes] = useState({});
  const [draftAssignees, setDraftAssignees] = useState({});
  const [busyEventId, setBusyEventId] = useState('');
  const [busyAssignId, setBusyAssignId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      setIsLoading(true);
      const result = await fetchAdminLogs({
        action: actionFilter === 'all' ? '' : actionFilter,
        limit: 100,
      });
      if (cancelled) return;

      if (result.error) {
        setEvents([]);
        showToast(result.error, 'error');
      } else {
        setEvents(result.results || []);
      }

      setIsLoading(false);
    }

    loadLogs();
    return () => {
      cancelled = true;
    };
  }, [actionFilter, showToast]);

  const visibleEvents = events.filter((event) => {
    if (statusFilter === 'all') return true;
    return normalizedStatus(event) === statusFilter;
  });

  const summary = visibleEvents.reduce(
    (acc, event) => {
      acc[event.action] = (acc[event.action] || 0) + 1;
      return acc;
    },
    { allow: 0, review: 0, block: 0 },
  );

  async function handleDecision(event, decision) {
    if (!event._id || busyEventId) return;

    const notes = (draftNotes[event._id] ?? '').trim();
    setBusyEventId(event._id);
    const result = await applyReviewDecision(event._id, {
      decision,
      notes,
      reviewer: 'Text Guard Reviewer',
    });
    setBusyEventId('');

    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    setEvents((current) => current.map((item) => (item._id === event._id ? result.event : item)));
    setDraftNotes((current) => ({ ...current, [event._id]: result.event?.review?.notes || '' }));
    showToast(`Saved decision: ${decision.replace('_', ' ')}.`, 'success');
  }

  async function handleAssign(event) {
    if (!event._id || busyAssignId) return;
    const assignee = (draftAssignees[event._id] ?? event.review_assignment?.assignee ?? '').trim();
    if (!assignee) {
      showToast('Enter an assignee before saving ownership.', 'error');
      return;
    }

    setBusyAssignId(event._id);
    const result = await assignReviewOwner(event._id, {
      assignee,
      reviewer: 'Text Guard Reviewer',
    });
    setBusyAssignId('');

    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    setEvents((current) => current.map((item) => (item._id === event._id ? result.event : item)));
    setDraftAssignees((current) => ({
      ...current,
      [event._id]: result.event?.review_assignment?.assignee || assignee,
    }));
    showToast(`Assigned to ${assignee}.`, 'success');
  }

  return (
    <div className="tg-page-wrap mx-auto flex flex-col gap-6 px-2 py-10 sm:px-4">
      <div className="tg-panel flex flex-col gap-4 p-6 text-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-900 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
              <Terminal size={14} />
              Review workspace
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Decision queue</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Resolve review items, confirm blocks, approve allows, and record reviewer notes directly on the stored moderation event.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-wrap gap-2">
              {actionOptions.map((option) => (
                <FilterButton
                  key={option}
                  active={actionFilter === option}
                  onClick={() => setActionFilter(option)}
                  label={option}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <FilterButton
                  key={option}
                  active={statusFilter === option}
                  onClick={() => setStatusFilter(option)}
                  label={option}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryCard label="Blocked" value={summary.block} tone="red" />
        <SummaryCard label="Review" value={summary.review} tone="amber" />
        <SummaryCard label="Allowed" value={summary.allow} tone="emerald" />
      </div>

      <div className="tg-panel p-4">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading moderation events...</div>
        ) : visibleEvents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No events found for this filter.</div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {visibleEvents.map((event) => (
                <EventCard
                  key={event._id || `${event.ts}-${event.raw}`}
                  event={event}
                  draftNote={draftNotes[event._id] ?? event.review?.notes ?? event.meta?.notes ?? ''}
                  onDraftChange={(value) => setDraftNotes((current) => ({ ...current, [event._id]: value }))}
                  draftAssignee={draftAssignees[event._id] ?? event.review_assignment?.assignee ?? ''}
                  onAssigneeChange={(value) => setDraftAssignees((current) => ({ ...current, [event._id]: value }))}
                  onDecision={handleDecision}
                  onAssign={handleAssign}
                  isBusy={busyEventId === event._id}
                  isAssigning={busyAssignId === event._id}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, draftNote, onDraftChange, draftAssignee, onAssigneeChange, onDecision, onAssign, isBusy, isAssigning }) {
  const categories = Object.entries(event.categories || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4);
  const status = normalizedStatus(event);

  return (
    <Motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-[1.7rem] border border-slate-300/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(244,240,234,0.86))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge action={event.action} />
            <StatusBadge status={status} />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{event.mode || 'comment'}</span>
            <span className="text-xs text-slate-500">{formatTimestamp(event.ts)}</span>
          </div>
          <p className="max-w-4xl text-sm leading-6 text-slate-900">{event.raw}</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <Chip label={`reason: ${event.reason || 'n/a'}`} />
            <Chip label={`provider: ${event.provider || 'n/a'}`} />
            <Chip label={`latency: ${event.latency_ms ?? 'n/a'}ms`} />
            {event.matched_seed ? <Chip label={`match: ${event.matched_seed}`} /> : null}
            {event.meta?.source ? <Chip label={`source: ${event.meta.source}`} /> : null}
            {event.meta?.scenario ? <Chip label={`scenario: ${event.meta.scenario}`} /> : null}
            {event.meta?.policy_preset ? <Chip label={`preset: ${event.meta.policy_preset}`} /> : null}
          </div>
        </div>

        <div className="grid min-w-[240px] gap-2 text-sm text-slate-700">
          <div className="rounded-2xl border border-slate-300/70 bg-white/90 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Overall score</div>
            <div className="mt-1 font-mono text-lg font-semibold">{Number(event.score || 0).toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-slate-300/70 bg-white/90 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Flags</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(event.flags || []).length ? (event.flags || []).map((flag) => <Chip key={flag} label={flag} />) : <span className="text-xs text-slate-500">none</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <label htmlFor={`assignee-${event._id}`} className="mb-2 block text-sm font-medium text-slate-800">
              Owner
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`assignee-${event._id}`}
                type="text"
                maxLength={120}
                value={draftAssignee}
                onChange={(eventInput) => onAssigneeChange(eventInput.target.value)}
                className="flex-1 rounded-full border border-slate-300/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400/35 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="Assign reviewer or owner"
              />
              <ActionButton
                label={event.review_assignment?.assignee ? 'Reassign' : 'Assign owner'}
                icon={UserCheck}
                onClick={() => onAssign(event)}
                disabled={isAssigning}
                tone="sky"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`note-${event._id}`} className="mb-2 block text-sm font-medium text-slate-800">
              Reviewer notes
            </label>
            <textarea
              id={`note-${event._id}`}
              rows={3}
              maxLength={300}
              value={draftNote}
              onChange={(eventInput) => onDraftChange(eventInput.target.value)}
              className="w-full rounded-[1.25rem] border border-slate-300/70 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-cyan-400/35 focus:ring-4 focus:ring-cyan-300/10"
              placeholder="Add reviewer context, justification, or follow-up notes."
            />
          </div>

          {event.review?.decision ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span className="font-semibold">Latest review:</span> {event.review.decision.replace('_', ' ')}
              {event.review.reviewer ? ` by ${event.review.reviewer}` : ''}
              {event.review.reviewed_at ? ` on ${formatTimestamp(event.review.reviewed_at)}` : ''}
            </div>
          ) : null}

          {event.review_assignment?.assignee ? (
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <span className="font-semibold">Owner:</span> {event.review_assignment.assignee}
              {event.review_assignment.assigned_by ? ` assigned by ${event.review_assignment.assigned_by}` : ''}
              {event.review_assignment.assigned_at ? ` on ${formatTimestamp(event.review_assignment.assigned_at)}` : ''}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <ActionButton
            label="Mark resolved"
            icon={CheckCheck}
            onClick={() => onDecision(event, 'resolved')}
            disabled={isBusy}
            tone="stone"
          />
          <ActionButton
            label="Approve allow"
            icon={ShieldCheck}
            onClick={() => onDecision(event, 'approved_allow')}
            disabled={isBusy}
            tone="emerald"
          />
          <ActionButton
            label="Confirm block"
            icon={ShieldBan}
            onClick={() => onDecision(event, 'confirmed_block')}
            disabled={isBusy}
            tone="red"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {categories.length ? (
          categories.map(([name, value]) => <Chip key={name} label={`${name}: ${Number(value).toFixed(2)}`} />)
        ) : (
          <span className="text-xs text-slate-500">No category scores recorded.</span>
        )}
      </div>
    </Motion.article>
  );
}

function FilterButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-800 shadow-[0_10px_18px_rgba(34,211,238,0.08)]'
          : 'border-slate-300/70 bg-white/80 text-slate-700 hover:border-slate-400 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value, tone }) {
  const toneMap = {
    red: 'border-sky-300/55 bg-[linear-gradient(145deg,rgba(238,248,255,0.98),rgba(217,235,248,0.9))] text-sky-900 shadow-[0_14px_32px_rgba(59,130,246,0.08)]',
    amber: 'border-cyan-300/55 bg-[linear-gradient(145deg,rgba(239,252,255,0.98),rgba(220,242,248,0.9))] text-cyan-900 shadow-[0_14px_32px_rgba(34,211,238,0.08)]',
    emerald: 'border-teal-300/55 bg-[linear-gradient(145deg,rgba(237,252,255,0.98),rgba(217,244,246,0.9))] text-teal-900 shadow-[0_14px_32px_rgba(20,184,166,0.08)]',
  };

  return (
    <div className={`rounded-[1.5rem] border p-5 ${toneMap[tone]}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function ActionButton({ label, icon: Icon, onClick, disabled, tone }) {
  const tones = {
    stone: 'border-slate-300/70 bg-white/90 text-slate-700 hover:border-slate-400 hover:bg-white',
    emerald: 'border-emerald-300/45 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    red: 'border-red-300/45 bg-red-50 text-red-800 hover:bg-red-100',
    sky: 'border-cyan-300/45 bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
  };
  const ActionIcon = Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      <ActionIcon size={16} />
      {label}
    </button>
  );
}

function ActionBadge({ action }) {
  const styles = {
    allow: {
      className: 'border-emerald-300/45 bg-emerald-50 text-emerald-700',
      icon: <ShieldCheck size={14} />,
    },
    review: {
      className: 'border-amber-300/45 bg-amber-50 text-amber-700',
      icon: <AlertTriangle size={14} />,
    },
    block: {
      className: 'border-red-300/45 bg-red-50 text-red-700',
      icon: <ShieldBan size={14} />,
    },
  }[action] || {
    className: 'border-stone-200 bg-stone-100 text-slate-700',
    icon: <Terminal size={14} />,
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${styles.className}`}>
      {styles.icon}
      {action || 'unknown'}
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    open: 'border-cyan-300/45 bg-cyan-50 text-cyan-700',
    resolved: 'border-emerald-300/45 bg-emerald-50 text-emerald-700',
    decided: 'border-violet-300/45 bg-violet-50 text-violet-700',
  }[status] || 'border-stone-200 bg-stone-100 text-slate-700';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${styles}`}>
      <CircleCheckBig size={12} />
      {status}
    </span>
  );
}

function Chip({ label }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{label}</span>;
}

function normalizedStatus(event) {
  return event.review_status || (event.review?.decision ? 'decided' : event.action === 'review' ? 'open' : 'resolved');
}

function formatTimestamp(ts) {
  if (!ts) return 'Unknown time';
  return new Date(ts * 1000).toLocaleString();
}
