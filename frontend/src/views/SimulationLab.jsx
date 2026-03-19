import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileJson,
  Eye,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  WORKSPACE_ID,
  callModerationAPI,
  exportTestCases,
  fetchPolicyPresets,
  fetchTestCases,
  importTestCases,
  savePolicyPreset,
  saveReviewSubmission,
  saveTestCase,
} from '../lib/api.js';

const exampleInputs = [
  {
    label: 'Abusive',
    text: 'You are a pathetic loser and nobody wants you here.',
  },
  {
    label: 'Obfuscated',
    text: 'k y s you 1d10t, get out of here.',
  },
  {
    label: 'Manipulative',
    text: 'If you really care, send me the OTP and do not tell anyone.',
  },
  {
    label: 'Safe',
    text: 'I am frustrated with the delay, but please help me resolve this.',
  },
];

const defaultPolicyPresets = [
  {
    preset_id: 'balanced',
    name: 'Balanced',
    description: 'General use with moderate escalation.',
    review_threshold: 0.45,
    block_threshold: 0.85,
  },
  {
    preset_id: 'strict',
    name: 'Strict',
    description: 'Escalate faster for risk-sensitive teams.',
    review_threshold: 0.3,
    block_threshold: 0.7,
  },
];

const credibilityCards = [
  {
    title: 'Direct abuse',
    detail: 'Flags explicit insults, threats, and hostile language patterns.',
  },
  {
    title: 'Obfuscated wording',
    detail: 'Catches spaced, symbol-swapped, and disguised abusive phrases.',
  },
  {
    title: 'Manipulation risk',
    detail: 'Surfaces coercive pressure, scam language, and trust exploitation.',
  },
];

export default function SimulationLab({ showToast }) {
  const [text, setText] = useState(exampleInputs[0].text);
  const [result, setResult] = useState(null);
  const [notes, setNotes] = useState('');
  const [testCaseTitle, setTestCaseTitle] = useState('');
  const [presets, setPresets] = useState(defaultPolicyPresets);
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPolicyPresets[0].preset_id);
  const [savedCases, setSavedCases] = useState([]);
  const [importPayload, setImportPayload] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savedReviewKeys, setSavedReviewKeys] = useState([]);

  const selectedPreset = useMemo(
    () => presets.find((item) => item.preset_id === selectedPresetId) || presets[0] || defaultPolicyPresets[0],
    [presets, selectedPresetId],
  );

  const presetAction = result ? choosePresetAction(result.score, selectedPreset) : null;
  const topSignals = useMemo(() => topCategoryEntries(result?.categories || {}), [result]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceData() {
      const [presetPayload, casePayload] = await Promise.all([fetchPolicyPresets(), fetchTestCases(50)]);
      if (cancelled) return;

      if (!presetPayload.error && (presetPayload.results || []).length) {
        setPresets(presetPayload.results);
        if (!presetPayload.results.some((item) => item.preset_id === selectedPresetId)) {
          setSelectedPresetId(presetPayload.results[0].preset_id);
        }
      }

      if (!casePayload.error) {
        setSavedCases(casePayload.results || []);
      }
    }

    loadWorkspaceData();
    return () => {
      cancelled = true;
    };
  }, [selectedPresetId]);

  async function handleCheckText() {
    const normalized = text.trim();
    if (!normalized) {
      showToast('Paste some text first.', 'error');
      return;
    }

    setIsChecking(true);
    const payload = await callModerationAPI(normalized, 'comment');
    setIsChecking(false);

    setResult({
      ...payload,
      input: normalized,
      policy_preset: selectedPreset?.preset_id || 'balanced',
    });
    showToast(`Decision: ${payload.action}.`, 'success');
  }

  async function handleSendToReview() {
    if (!result?.input) {
      showToast('Check text before sending it to review.', 'error');
      return;
    }

    const requestKey = `${result.input}:${result.score}:${result.policy_preset}`;
    if (savedReviewKeys.includes(requestKey)) {
      showToast('This result was already sent to review in this session.', 'error');
      return;
    }

    setIsSavingReview(true);
    const payload = await saveReviewSubmission({
      text: result.input,
      mode: 'comment',
      scenario: 'simple_check',
      policy_preset: selectedPreset?.preset_id || 'balanced',
      notes: notes.trim(),
      moderation_result: result,
    });
    setIsSavingReview(false);

    if (payload.error) {
      showToast(payload.error, 'error');
      return;
    }

    setSavedReviewKeys((current) => [requestKey, ...current]);
    showToast('Sent to review queue.', 'success');
  }

  async function handleSaveCase() {
    const normalized = text.trim();
    if (!normalized) {
      showToast('Paste some text before saving a case.', 'error');
      return;
    }

    setIsSavingCase(true);
    const payload = await saveTestCase({
      title: testCaseTitle.trim() || 'Saved moderation case',
      text: normalized,
      mode: 'comment',
      scenario: 'simple_check',
      policy_preset: selectedPreset?.preset_id || 'balanced',
      expected_action: result?.action || presetAction || 'review',
      notes: notes.trim(),
    });
    setIsSavingCase(false);

    if (payload.error) {
      showToast(payload.error, 'error');
      return;
    }

    setSavedCases((current) => [payload.test_case, ...current].slice(0, 50));
    setTestCaseTitle('');
    showToast('Saved as a reusable case.', 'success');
  }

  async function handleSavePreset() {
    if (!selectedPreset || selectedPreset.block_threshold <= selectedPreset.review_threshold) {
      showToast('Block threshold must be higher than review threshold.', 'error');
      return;
    }

    setIsSavingPreset(true);
    const payload = await savePolicyPreset({
      preset_id: selectedPreset.preset_id,
      name: selectedPreset.name,
      description: selectedPreset.description,
      review_threshold: Number(selectedPreset.review_threshold),
      block_threshold: Number(selectedPreset.block_threshold),
    });
    setIsSavingPreset(false);

    if (payload.error) {
      showToast(payload.error, 'error');
      return;
    }

    setPresets((current) => current.map((item) => (item.preset_id === payload.preset.preset_id ? payload.preset : item)));
    showToast('Preset saved.', 'success');
  }

  async function handleExportSuite() {
    setIsExporting(true);
    const payload = await exportTestCases();
    setIsExporting(false);

    if (payload.error) {
      showToast(payload.error, 'error');
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `text-guard-suite-${WORKSPACE_ID}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Suite exported.', 'success');
  }

  async function handleImportSuite() {
    if (!importPayload.trim()) {
      showToast('Paste exported JSON first.', 'error');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(importPayload);
    } catch {
      showToast('Import JSON is invalid.', 'error');
      return;
    }

    const cases = Array.isArray(parsed) ? parsed : parsed.cases;
    if (!Array.isArray(cases) || !cases.length) {
      showToast('Import must include a non-empty cases array.', 'error');
      return;
    }

    setIsImporting(true);
    const payload = await importTestCases({ cases });
    setIsImporting(false);

    if (payload.error) {
      showToast(payload.error, 'error');
      return;
    }

    setSavedCases((current) => [...(payload.results || []), ...current].slice(0, 50));
    setImportPayload('');
    showToast(`Imported ${payload.imported} cases.`, 'success');
  }

  function updateSelectedPreset(field, value) {
    setPresets((current) =>
      current.map((item) => (item.preset_id === selectedPresetId ? { ...item, [field]: value } : item)),
    );
  }

  return (
    <div className="tg-page-wrap mx-auto flex flex-col gap-6 px-2 py-10 sm:px-4">
      <section className="tg-shell p-8">
        <div className="tg-shell-inner grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="max-w-3xl space-y-5 pt-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-4 py-1 text-sm font-medium text-cyan-100">
            <Sparkles size={14} />
            Moderation analysis
          </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Evaluate risky language with stronger signals for abuse, evasion, and manipulation.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              Review user-generated text through a sharper moderation surface with structured risk signals, policy-aware routing, and reusable case memory.
            </p>
            <div className="flex flex-wrap gap-2">
              {exampleInputs.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setText(item.text)}
                  className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative grid gap-3 self-start">
            {credibilityCards.map((item, index) => (
              <div key={item.title} className={`${index === 1 ? 'tg-accent-card' : 'tg-panel-dark'} px-5 py-4`}>
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className={`mt-1 text-sm leading-6 ${index === 1 ? 'text-white/88' : 'text-slate-300'}`}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.22fr_0.78fr]">
        <div className="tg-panel p-6 text-slate-900">
          <label htmlFor="text-input" className="mb-2 block text-sm font-medium text-slate-700">
            Analyze text
          </label>
          <textarea
            id="text-input"
            rows={10}
            maxLength={5000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-full rounded-[1.5rem] border border-slate-300/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,245,241,0.88))] px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-cyan-500/40 focus:ring-4 focus:ring-cyan-400/10"
            placeholder="Paste suspicious text here."
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCheckText}
              disabled={isChecking}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(55,196,182,0.95),rgba(8,24,33,0.98))] px-5 py-3 text-sm font-medium text-white shadow-[0_0_24px_rgba(73,211,190,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldAlert size={16} />
              {isChecking ? 'Analyzing...' : 'Analyze text'}
            </button>

            <label className="text-sm text-slate-700">
              Policy
              <select
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
                className="ml-2 rounded-full border border-slate-300/70 bg-white px-4 py-2 text-sm text-slate-900"
              >
                {presets.map((preset) => (
                  <option key={preset.preset_id} value={preset.preset_id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-500">
            Input length {text.length} / 5000
          </div>
        </div>

        <div className="tg-panel p-6 text-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${badgeTone(result?.action).iconBg}`}>
              {result?.action === 'allow' ? <ShieldCheck size={18} /> : result?.action === 'block' ? <ShieldX size={18} /> : <ShieldAlert size={18} />}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Decision summary</h2>
              <p className="text-sm text-slate-600">Primary outcome first, supporting signals underneath.</p>
            </div>
          </div>

          {!result ? (
            <div className="rounded-[1.25rem] border border-slate-300/70 bg-white/70 px-4 py-5 text-sm text-slate-500">
              Run an analysis to see the moderation decision, signal categories, and matched indicators.
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-[1.5rem] border px-4 py-4 shadow-[0_12px_30px_rgba(80,90,150,0.08)] ${badgeTone(result.action).panel}`}>
                <div className="text-xs uppercase tracking-[0.18em]">Moderation decision</div>
                <div className="mt-2 text-3xl font-semibold capitalize">{result.action}</div>
                <div className="mt-2 text-sm">
                  Score {Number(result.score || 0).toFixed(2)}. Preset would mark this as <span className="font-semibold">{presetAction}</span>.
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-slate-300/70 bg-white/65 p-4">
                <div className="text-sm font-semibold text-slate-900">Primary risk signals</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topSignals.length ? topSignals.map(([name, value]) => <Chip key={name} label={`${pretty(name)} ${Number(value).toFixed(2)}`} />) : <span className="text-sm text-slate-500">No strong category signals.</span>}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-slate-300/70 bg-white/65 p-4">
                <div className="text-sm font-semibold text-slate-900">Flags</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(result.flags || []).length ? result.flags.map((flag) => <Chip key={flag} label={pretty(flag)} />) : <span className="text-sm text-slate-500">No extra flags.</span>}
                </div>
              </div>

              <div>
                <label htmlFor="simple-notes" className="mb-2 block text-sm font-medium text-slate-800">
                  Analyst note
                </label>
                <textarea
                  id="simple-notes"
                  rows={3}
                  maxLength={300}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full rounded-[1.25rem] border border-slate-300/70 bg-white/75 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-cyan-500/40 focus:ring-4 focus:ring-cyan-400/10"
                  placeholder="Optional context for saved cases or review handoff."
                />
              </div>

              <div className="rounded-[1.25rem] border border-slate-300/70 bg-white/65 px-4 py-4 text-sm text-slate-600">
                Saved cases stay available in your workspace as reusable moderation examples.
              </div>

              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  label={isSavingReview ? 'Sending...' : 'Send to review'}
                  icon={Send}
                  onClick={handleSendToReview}
                  disabled={isSavingReview}
                  tone="sky"
                />
                <PrimaryButton
                  label={isSavingCase ? 'Saving...' : 'Save case'}
                  icon={Save}
                  onClick={handleSaveCase}
                  disabled={isSavingCase}
                  tone="emerald"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <details className="group tg-shell p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold text-white">
          Workspace controls
          <ChevronDown className="text-slate-300 transition group-open:rotate-180" size={18} />
        </summary>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="tg-panel p-5 text-slate-900">
              <h3 className="text-base font-semibold text-slate-900">Edit selected policy</h3>
              <p className="mt-1 text-sm text-slate-600">Adjust routing thresholds for the active moderation policy.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Review threshold">
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedPreset?.review_threshold ?? 0.45}
                    onChange={(event) => updateSelectedPreset('review_threshold', Number(event.target.value))}
                    className="w-full rounded-[1rem] border border-slate-300/70 bg-white/80 px-4 py-3 text-sm text-slate-900"
                  />
                </Field>
                <Field label="Block threshold">
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedPreset?.block_threshold ?? 0.85}
                    onChange={(event) => updateSelectedPreset('block_threshold', Number(event.target.value))}
                    className="w-full rounded-[1rem] border border-slate-300/70 bg-white/80 px-4 py-3 text-sm text-slate-900"
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={isSavingPreset}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-900"
              >
                <Save size={16} />
                {isSavingPreset ? 'Saving...' : 'Save policy'}
              </button>
            </div>

            <div className="tg-panel p-5 text-slate-900">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-slate-500" />
                <h3 className="text-base font-semibold text-slate-900">Saved cases</h3>
              </div>
              <p className="mt-1 text-sm text-slate-600">Stored examples you can reopen, review again, or include in an exported test suite.</p>
              <div className="mt-3">
                <Field label="Saved case title">
                  <input
                    type="text"
                    maxLength={120}
                    value={testCaseTitle}
                    onChange={(event) => setTestCaseTitle(event.target.value)}
                    className="w-full rounded-[1rem] border border-slate-300/70 bg-white/80 px-4 py-3 text-sm text-slate-900"
                    placeholder="Title for the next saved case"
                  />
                </Field>
              </div>
              <div className="mt-4 space-y-3">
                {savedCases.length ? (
                  savedCases.slice(0, 5).map((item) => (
                    <button
                      key={item._id || item.title}
                      type="button"
                      onClick={() => setText(item.text || '')}
                      className="block w-full rounded-[1.25rem] border border-slate-300/70 bg-white/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-cyan-400/25 hover:bg-white"
                    >
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 line-clamp-2 text-slate-600">{item.text}</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-slate-300/70 bg-white/80 px-4 py-4 text-sm text-slate-500">No saved cases yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="tg-panel p-5 text-slate-900">
              <h3 className="text-base font-semibold text-slate-900">Import or export suite</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <PrimaryButton
                  label={isExporting ? 'Exporting...' : 'Export suite'}
                  icon={Download}
                  onClick={handleExportSuite}
                  disabled={isExporting}
                  tone="stone"
                />
                <PrimaryButton
                  label={isImporting ? 'Importing...' : 'Import suite'}
                  icon={Upload}
                  onClick={handleImportSuite}
                  disabled={isImporting}
                  tone="sky"
                />
              </div>
              <Field label="Import JSON">
                <textarea
                  rows={7}
                  value={importPayload}
                  onChange={(event) => setImportPayload(event.target.value)}
                  className="w-full rounded-[1.25rem] border border-slate-300/70 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500"
                  placeholder='{"cases":[{"title":"Example","text":"...","expected_action":"review"}]}'
                />
              </Field>
            </div>

            <div className="tg-panel p-5 text-slate-900">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-500 ring-1 ring-slate-200">
                <FileJson size={14} />
                Workspace
              </div>
              <div className="mt-3 text-sm text-slate-600">
                Current workspace: <span className="font-semibold text-slate-900">{WORKSPACE_ID}</span>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-current/85">{label}</div>
      {children}
    </label>
  );
}

function PrimaryButton({ label, icon, onClick, disabled, tone }) {
  const tones = {
    stone: 'border-slate-300/70 bg-white/85 text-slate-700',
    emerald: 'border-emerald-400/25 bg-emerald-50 text-emerald-800',
    sky: 'border-cyan-400/25 bg-cyan-50 text-cyan-800',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.stone}`}
    >
      {icon ? React.createElement(icon, { size: 16 }) : null}
      {label}
    </button>
  );
}

function Chip({ label }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{label}</span>;
}

function choosePresetAction(score, preset) {
  const reviewThreshold = Number(preset?.review_threshold ?? 0.45);
  const blockThreshold = Number(preset?.block_threshold ?? 0.85);
  if (score >= blockThreshold) return 'block';
  if (score >= reviewThreshold) return 'review';
  return 'allow';
}

function topCategoryEntries(categories) {
  return Object.entries(categories)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4);
}

function pretty(value) {
  return String(value || '').replaceAll('_', ' ');
}

function badgeTone(action) {
  if (action === 'allow') {
    return {
      iconBg: 'bg-emerald-600',
      panel: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    };
  }
  if (action === 'block') {
    return {
      iconBg: 'bg-red-600',
      panel: 'border-red-100 bg-red-50 text-red-900',
    };
  }
  return {
    iconBg: 'bg-amber-500',
    panel: 'border-amber-100 bg-amber-50 text-amber-900',
  };
}
