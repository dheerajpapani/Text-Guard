import React, { useEffect, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  FlaskConical,
  Headset,
  MessageSquareWarning,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { API_BASE_URL, fetchAnalytics } from '../lib/api.js';

const ideaCards = [
  {
    title: 'Community moderation cockpit',
    summary: 'Moderate comments, group posts, and creator chats for social or gaming communities.',
    fit: 'Strong fit with current review queue and comment/chat categories.',
    icon: Users,
  },
  {
    title: 'Support inbox shield',
    summary: 'Protect customer support agents from abusive tickets and escalations.',
    fit: 'Works well because it needs allow, review, and block decisions with audit logs.',
    icon: Headset,
  },
  {
    title: 'Marketplace listing guard',
    summary: 'Scan seller listings and buyer messages for spam, fraud bait, and abuse.',
    fit: 'Good second-step expansion once spam and policy rules become stronger.',
    icon: ShoppingBag,
  },
  {
    title: 'Simulation lab',
    summary: 'Let teams rehearse realistic moderation cases before wiring real product traffic.',
    fit: 'Best immediate direction because it turns the current backend into a useful working product now.',
    icon: FlaskConical,
    active: true,
  },
];

const useCases = [
  'Community comments and replies',
  'Customer support ticket screening',
  'Livestream or group chat protection',
  'UGC pre-publish moderation checks',
];

export default function Home({ showToast }) {
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setIsLoading(true);
      const result = await fetchAnalytics(500);
      if (cancelled) return;
      if (result.error) {
        showToast(result.error, 'error');
        setAnalytics(null);
      } else {
        setAnalytics(result);
      }
      setIsLoading(false);
    }

    loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_#eff6ff,_#ffffff_55%,_#f5f5f4)] p-8 shadow-sm">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <Motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="inline-flex items-center rounded-full border border-sky-200 bg-white px-4 py-1 text-sm font-medium text-sky-700"
            >
              Product loop closed
            </Motion.div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Text Guard is now a moderation lab with analytics, review workflow, and regression memory.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600">
                Teams can simulate risky content, compare policy presets, push items to review, resolve them, and preserve important cases as repeatable test fixtures before rollout.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/simulate"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              >
                Open simulation lab
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/review"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-stone-400 hover:bg-stone-50"
              >
                Open review queue
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.5rem] border border-white/70 bg-white/70 p-4 shadow-sm">
            <MetricCard label="API base" value={API_BASE_URL} />
            <MetricCard label="Analytics" value={isLoading ? 'Loading...' : `${analytics?.total_events ?? 0} tracked events`} />
            <MetricCard label="Core loop" value="simulate / review / decide / save test case" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Total events"
          value={isLoading ? '...' : String(analytics?.total_events ?? 0)}
          icon={Activity}
          tone="sky"
        />
        <SummaryCard
          label="Open queue"
          value={isLoading ? '...' : String(analytics?.status_counts?.open ?? 0)}
          icon={ClipboardCheck}
          tone="amber"
        />
        <SummaryCard
          label="Resolved"
          value={isLoading ? '...' : String(analytics?.status_counts?.resolved ?? 0)}
          icon={BarChart3}
          tone="emerald"
        />
        <SummaryCard
          label="Decided"
          value={isLoading ? '...' : String(analytics?.status_counts?.decided ?? 0)}
          icon={MessageSquareWarning}
          tone="violet"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <TrendPanel trend={analytics?.trend || []} />
        <AnalyticsPanel
          title="Top categories"
          items={analytics?.top_categories || []}
          fallback="No stored category analytics yet."
        />
        <AnalyticsPanel
          title="Top flags"
          items={analytics?.top_flags || []}
          fallback="No stored flag analytics yet."
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {ideaCards.map((idea, index) => {
          const Icon = idea.icon;
          return (
            <Motion.article
              key={idea.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.3 }}
              className={`rounded-[1.5rem] border p-6 shadow-sm ${
                idea.active ? 'border-sky-200 bg-sky-50/60' : 'border-stone-200 bg-white'
              }`}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Icon size={18} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">{idea.title}</h2>
                {idea.active ? (
                  <span className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    Build now
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{idea.summary}</p>
              <p className="mt-3 text-sm font-medium text-slate-800">{idea.fit}</p>
            </Motion.article>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.5rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Why this idea works now</h2>
              <p className="text-sm text-slate-600">It is realistic, useful, and matches the backend you already have.</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="rounded-2xl bg-stone-50 px-4 py-3">You already have a structured moderation API, so a simulation console gives immediate product value.</li>
            <li className="rounded-2xl bg-stone-50 px-4 py-3">It creates a safe way to test prompts, thresholds, and policy changes before real integrations.</li>
            <li className="rounded-2xl bg-stone-50 px-4 py-3">It naturally feeds into the review queue, analytics, and saved regression suites.</li>
          </ul>
        </div>

        <div className="rounded-[1.5rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-600 text-white">
              <MessageSquareWarning size={18} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Realistic scenarios to simulate</h2>
              <p className="text-sm text-slate-600">These are the kinds of product traffic we should model next.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {useCases.map((item) => (
              <div key={item} className="rounded-2xl bg-stone-50 px-4 py-4 text-sm font-medium text-slate-800">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = {
    sky: 'border-sky-100 bg-sky-50 text-sky-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    violet: 'border-violet-100 bg-violet-50 text-violet-800',
  };

  const SummaryIcon = Icon;
  return (
    <div className={`rounded-[1.5rem] border p-5 ${tones[tone]}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80">
          <SummaryIcon size={18} />
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="mt-1 text-3xl font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({ title, items, fallback }) {
  return (
    <div className="rounded-[1.5rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
              <span className="text-sm font-medium capitalize text-slate-800">{item.name.replace('_', ' ')}</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-stone-200">
                {item.count}
              </span>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-slate-500">{fallback}</div>
        )}
      </div>
    </div>
  );
}

function TrendPanel({ trend }) {
  const maxCount = Math.max(...trend.map((item) => item.count), 1);

  return (
    <div className="rounded-[1.5rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">7 day trend</h2>
      <p className="mt-1 text-sm text-slate-600">Tracked moderation volume across the latest stored days.</p>
      <div className="mt-6">
        {trend.length ? (
          <div className="grid grid-cols-7 items-end gap-3">
            {trend.map((item) => (
              <div key={item.day} className="flex flex-col items-center gap-3">
                <div className="text-xs font-semibold text-slate-500">{item.count}</div>
                <div className="flex h-44 w-full items-end rounded-full bg-stone-100 px-2 py-2">
                  <div
                    className="w-full rounded-full bg-gradient-to-t from-emerald-600 to-sky-500"
                    style={{ height: `${Math.max((item.count / maxCount) * 100, 10)}%` }}
                  />
                </div>
                <div className="text-center text-xs text-slate-500">{item.day.slice(5)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-slate-500">No trend data yet.</div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-[1.25rem] border border-stone-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
