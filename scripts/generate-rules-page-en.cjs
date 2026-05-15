// Generate docs/teamagent-rules.html — English-introduction rule-ledger page
// from the local SQLite stores. Mirrors the structure of the TeamBrain
// reference page (filterable rules library, distributions, recent events).
// Rule content (trigger / correct_pattern / reasoning) is preserved verbatim
// from the database — the chrome (headers, labels, intro) is in English.

const os = require('os');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const home = os.homedir();
const cwd = path.resolve(__dirname, '..');

function queryDb(dbPath, sql) {
  try {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare(sql).all();
    db.close();
    return rows;
  } catch (e) {
    return [];
  }
}

const personalDbPath = path.join(cwd, '.teamagent', 'knowledge.db');
const globalDbPath = path.join(home, '.teamagent', 'global.db');
const eventsDbPath = path.join(home, '.teamagent', 'events.db');

const personalRules = queryDb(personalDbPath, 'SELECT * FROM knowledge ORDER BY hit_count DESC');
const globalRules = queryDb(globalDbPath, 'SELECT * FROM knowledge ORDER BY hit_count DESC');
const allRules = [
  ...personalRules.map((r) => ({ ...r, _scope: 'personal' })),
  ...globalRules.map((r) => ({ ...r, _scope: 'global' })),
];

const recentEventsAll = queryDb(
  eventsDbPath,
  'SELECT kind, knowledge_id, timestamp FROM events ORDER BY timestamp DESC LIMIT 500'
);

const eventsByRule = {};
recentEventsAll.forEach((e) => {
  if (!e.knowledge_id) return;
  eventsByRule[e.knowledge_id] = (eventsByRule[e.knowledge_id] || 0) + 1;
});

const ruleEventCount = (id) => eventsByRule[id] || 0;

// Stats
const active = allRules.filter((r) => r.status === 'active').length;
const dormant = allRules.filter((r) => r.current_tier === 'dormant').length;

const byTierActive = {};
allRules
  .filter((r) => r.status === 'active')
  .forEach((r) => {
    const t = r.current_tier || 'unknown';
    byTierActive[t] = (byTierActive[t] || 0) + 1;
  });

const byKind = {};
recentEventsAll.forEach((e) => {
  byKind[e.kind] = (byKind[e.kind] || 0) + 1;
});

const passRate = byKind['hook-pre.passed'] || 0;
const warnRate = byKind['hook-pre.warned'] || 0;
const blockRate = byKind['hook-pre.blocked'] || 0;
const overrideComplied = byKind['ai.override.complied'] || 0;
const overrideIgnored = byKind['ai.override.ignored'] || 0;
const overrideCircumvented = byKind['ai.override.blocked_circumvented'] || 0;
const totalChecks = passRate + warnRate + blockRate;
const complianceRate = totalChecks > 0 ? Math.round((passRate / totalChecks) * 100) : 100;

const tierOrder = ['enforced', 'canonical', 'stable', 'probation', 'experimental', 'dormant'];
const tierColors = {
  experimental: '#6366f1',
  probation: '#f59e0b',
  stable: '#10b981',
  canonical: '#06b6d4',
  enforced: '#f97316',
  dormant: '#6b7280',
};
const tierIcons = {
  experimental: '🧪',
  probation: '⚠️',
  stable: '✅',
  canonical: '⭐',
  enforced: '🔥',
  dormant: '💤',
};

// Event kind palette
const kindMeta = {
  'hook-pre.passed': { label: 'pre-tool · passed', color: '#10b981', dot: '🟢' },
  'hook-pre.warned': { label: 'pre-tool · warned', color: '#f59e0b', dot: '🟡' },
  'hook-pre.blocked': { label: 'pre-tool · blocked', color: '#ef4444', dot: '🔴' },
  'hook-pre.passive_matched': { label: 'pre-tool · passive', color: '#6b7280', dot: '⚪' },
  'hook-post.result': { label: 'post-tool · result', color: '#3b82f6', dot: '🔵' },
  'ai.override.complied': { label: 'AI · complied', color: '#06b6d4', dot: '🤝' },
  'ai.override.ignored': { label: 'AI · ignored', color: '#ef4444', dot: '❌' },
  'ai.override.blocked_circumvented': { label: 'AI · circumvented', color: '#f97316', dot: '⚠️' },
  'ai.output.bad_pattern': { label: 'AI · bad pattern', color: '#ec4899', dot: '🐛' },
  'calibrator.adjusted': { label: 'calibrator · adjusted', color: '#8b5cf6', dot: '⚖️' },
  'error.candidate.added': { label: 'error · candidate', color: '#a78bfa', dot: '➕' },
};
function kindOf(k) {
  return kindMeta[k] || { label: k, color: '#6b7280', dot: '·' };
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const conf = (v) => Math.round((v || 0) * 100);
const demerit = (v) => Math.round((v || 0) * 10) / 10;

function tierBadge(t) {
  const color = tierColors[t] || '#6b7280';
  return `<span class="tier-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${tierIcons[t] || ''} ${escapeHtml(t || 'unknown')}</span>`;
}

function typeBadge(t) {
  const colorMap = { avoidance: '#ef4444', practice: '#10b981', wiki: '#8b5cf6' };
  const color = colorMap[t] || '#6b7280';
  return `<span class="type-badge" style="background:${color}22;color:${color}">${escapeHtml(t || '?')}</span>`;
}

function enforcementBadge(e) {
  const colorMap = { block: '#ef4444', warn: '#f59e0b', passive: '#6b7280' };
  const color = colorMap[e] || '#6b7280';
  return `<span class="enf-badge" style="background:${color}22;color:${color}">${escapeHtml(e || '—')}</span>`;
}

function scopeBadge(scope) {
  const color = scope === 'personal' ? '#06b6d4' : '#8b5cf6';
  return `<span class="scope-badge" style="background:${color}22;color:${color}">${escapeHtml(scope)}</span>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

function formatRelative(iso) {
  if (!iso) return '—';
  const now = Date.now();
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Build rule rows for the filterable library
const rulesForTable = allRules
  .map((r) => ({
    id: r.id,
    scope: r._scope,
    trigger: r.trigger || '',
    correct: r.correct_pattern_tldr || r.correct_pattern || '',
    reasoning: r.reasoning || '',
    source: r.source || '—',
    type: r.type || '—',
    category: r.category || '—',
    tier: r.current_tier || 'unknown',
    enforcement: r.enforcement || '—',
    confidence: r.confidence || 0,
    demerit: r.demerit || 0,
    hits: r.hit_count || 0,
    events: ruleEventCount(r.id),
    status: r.status || '—',
    created_at: r.created_at || '',
    last_hit: r.last_hit_at || '',
  }))
  .sort((a, b) => {
    // default sort: active first, then trust score (confidence - demerit/100), then hits
    const aActive = a.status === 'active' ? 1 : 0;
    const bActive = b.status === 'active' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aTrust = a.confidence - a.demerit / 100;
    const bTrust = b.confidence - b.demerit / 100;
    if (aTrust !== bTrust) return bTrust - aTrust;
    return b.hits - a.hits;
  });

// Recent events: take latest 60 with linked rule trigger
const ruleById = new Map(allRules.map((r) => [r.id, r]));
const recentEvents = recentEventsAll.slice(0, 60).map((e) => ({
  kind: e.kind,
  timestamp: e.timestamp,
  trigger: ruleById.get(e.knowledge_id)?.trigger || e.knowledge_id || '—',
}));

const generatedAt = new Date().toISOString();

// Render --------------------------------------------------------------------

const tableRowsHtml = rulesForTable
  .map((r, i) => {
    const trustScore = (r.confidence - r.demerit / 100).toFixed(2);
    const detail = [
      r.correct ? `<div class="rule-correct"><b>Correct pattern:</b> ${escapeHtml(r.correct).slice(0, 600)}</div>` : '',
      r.reasoning ? `<div class="rule-reason"><b>Reasoning:</b> ${escapeHtml(r.reasoning).slice(0, 600)}</div>` : '',
    ]
      .filter(Boolean)
      .join('');
    return `<tr class="rule-row"
        data-scope="${escapeHtml(r.scope)}"
        data-tier="${escapeHtml(r.tier)}"
        data-type="${escapeHtml(r.type)}"
        data-source="${escapeHtml(r.source)}"
        data-status="${escapeHtml(r.status)}"
        data-conf="${r.confidence}"
        data-demerit="${r.demerit}"
        data-hits="${r.hits}"
        data-events="${r.events}"
        data-created="${escapeHtml(r.created_at)}"
        data-trust="${trustScore}">
      <td class="col-rank">${i + 1}</td>
      <td class="col-trigger">
        <div class="trigger-text" title="${escapeHtml(r.trigger)}">${escapeHtml(r.trigger)}</div>
        ${detail ? `<details class="rule-details"><summary>details</summary>${detail}</details>` : ''}
      </td>
      <td>${scopeBadge(r.scope)}</td>
      <td><span class="src-tag" title="${escapeHtml(r.source)}">${escapeHtml(r.source)}</span></td>
      <td>${typeBadge(r.type)}</td>
      <td>${tierBadge(r.tier)}</td>
      <td>${enforcementBadge(r.enforcement)}</td>
      <td class="num"><span class="conf-cell" title="trust = confidence − demerit/100 = ${trustScore}">${conf(r.confidence)}%</span></td>
      <td class="num">${demerit(r.demerit)}</td>
      <td class="num">${r.hits}</td>
      <td class="num">${r.events}</td>
      <td class="muted small">${formatDate(r.created_at)}</td>
    </tr>`;
  })
  .join('\n');

const eventsHtml = recentEvents
  .map((e) => {
    const meta = kindOf(e.kind);
    return `<div class="ev-row">
      <span class="ev-dot" style="background:${meta.color}"></span>
      <span class="ev-kind" style="color:${meta.color}" title="${escapeHtml(e.kind)}">${escapeHtml(meta.label)}</span>
      <span class="ev-trigger" title="${escapeHtml(e.trigger)}">${escapeHtml(e.trigger)}</span>
      <span class="ev-time">${formatRelative(e.timestamp)}</span>
    </div>`;
  })
  .join('\n');

const tierBarsHtml = tierOrder
  .map((t) => {
    const cnt = byTierActive[t] || 0;
    const max = Math.max(...Object.values(byTierActive), 1);
    const pct = Math.max(Math.round((cnt / max) * 100), cnt > 0 ? 6 : 2);
    const color = tierColors[t] || '#6b7280';
    return `<div class="tier-row">
      <div class="tier-name" style="color:${color}">${tierIcons[t] || ''} ${t}</div>
      <div class="tier-bar-wrap">
        <div class="tier-bar" style="width:${pct}%;background:${color}">${cnt > 0 ? cnt : ''}</div>
      </div>
      <div class="tier-count">${cnt}</div>
    </div>`;
  })
  .join('\n');

const kindEntries = Object.entries(byKind).sort((a, b) => b[1] - a[1]);
const kindMax = Math.max(...kindEntries.map((e) => e[1]), 1);
const kindBarsHtml = kindEntries
  .map(([k, cnt]) => {
    const meta = kindOf(k);
    const pct = Math.max(Math.round((cnt / kindMax) * 100), 4);
    return `<div class="kind-row">
      <div class="kind-name" style="color:${meta.color}" title="${escapeHtml(k)}">${meta.dot} ${escapeHtml(meta.label)}</div>
      <div class="kind-bar-wrap"><div class="kind-bar" style="width:${pct}%;background:${meta.color}"></div></div>
      <div class="kind-count">${cnt}</div>
    </div>`;
  })
  .join('\n');

// Filter dropdown options
const tierOpts = ['', ...new Set(rulesForTable.map((r) => r.tier))]
  .map((v) => `<option value="${escapeHtml(v)}">${v ? escapeHtml(v) : 'All tiers'}</option>`)
  .join('');
const typeOpts = ['', ...new Set(rulesForTable.map((r) => r.type))]
  .map((v) => `<option value="${escapeHtml(v)}">${v ? escapeHtml(v) : 'All types'}</option>`)
  .join('');
const sourceOpts = ['', ...new Set(rulesForTable.map((r) => r.source))]
  .map((v) => `<option value="${escapeHtml(v)}">${v ? escapeHtml(v) : 'All sources'}</option>`)
  .join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TeamAgent — Real Rule Ledger</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#050714;--bg-alt:#0a0d1f;
    --surface:rgba(17,24,39,0.55);--surface-strong:rgba(17,24,39,0.85);
    --border:rgba(148,163,184,0.10);--border-strong:rgba(148,163,184,0.22);
    --cyan:#22d3ee;--cyan-glow:rgba(34,211,238,.45);
    --green:#34d399;--green-glow:rgba(52,211,153,.45);
    --purple:#a78bfa;--purple-glow:rgba(167,139,250,.45);
    --amber:#fbbf24;--amber-glow:rgba(251,191,36,.45);
    --red:#f87171;--red-glow:rgba(248,113,113,.45);
    --blue:#60a5fa;--blue-glow:rgba(96,165,250,.45);
    --pink:#f472b6;--orange:#fb923c;
    --text:#f1f5f9;--muted:#94a3b8;--dim:#64748b;
    --grad-1:linear-gradient(135deg,#22d3ee 0%,#a78bfa 50%,#f472b6 100%);
    --grad-2:linear-gradient(135deg,#34d399 0%,#22d3ee 100%);
    --grad-3:linear-gradient(135deg,#fbbf24 0%,#f87171 100%);
    --mono:'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  html,body{background:var(--bg);color:var(--text);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}

  /* Animated mesh background + grid overlay */
  body::before{
    content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
    background:
      radial-gradient(900px 700px at 8% 0%,rgba(34,211,238,0.16),transparent 55%),
      radial-gradient(800px 600px at 92% 18%,rgba(167,139,250,0.14),transparent 55%),
      radial-gradient(1000px 800px at 50% 100%,rgba(244,114,182,0.10),transparent 60%);
    animation:meshShift 28s ease-in-out infinite alternate;
  }
  body::after{
    content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
    background-image:
      linear-gradient(rgba(148,163,184,0.04) 1px,transparent 1px),
      linear-gradient(90deg,rgba(148,163,184,0.04) 1px,transparent 1px);
    background-size:64px 64px;mask-image:radial-gradient(ellipse 80% 60% at 50% 30%,#000 30%,transparent 100%);
  }
  @keyframes meshShift{0%{transform:translate(0,0) scale(1)}50%{transform:translate(-30px,40px) scale(1.05)}100%{transform:translate(30px,-30px) scale(.98)}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  @keyframes pulseDot{0%,100%{box-shadow:0 0 0 0 currentColor;opacity:1}50%{box-shadow:0 0 0 6px transparent;opacity:.55}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes growBar{from{width:0!important}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes gradientText{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}

  a{color:var(--cyan);text-decoration:none;transition:opacity .15s}
  a:hover{opacity:.8}

  .page{position:relative;z-index:1;max-width:1500px;margin:0 auto;padding:32px 24px 64px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}

  /* ===== Hero ===== */
  .hero{
    position:relative;padding:40px 44px;margin-bottom:28px;
    border-radius:24px;overflow:hidden;
    background:linear-gradient(135deg,rgba(17,24,39,.78) 0%,rgba(17,24,39,.42) 100%);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,.08);
    box-shadow:0 20px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);
    animation:fadeUp .7s cubic-bezier(.22,.61,.36,1);
  }
  .hero::before{
    content:'';position:absolute;top:-40%;right:-15%;width:600px;height:600px;pointer-events:none;
    background:radial-gradient(circle,rgba(34,211,238,.22) 0%,transparent 60%);
  }
  .hero::after{
    content:'';position:absolute;bottom:-50%;left:-10%;width:500px;height:500px;pointer-events:none;
    background:radial-gradient(circle,rgba(244,114,182,.16) 0%,transparent 60%);
  }
  .hero-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:36px;align-items:center;position:relative;z-index:1}
  .hero-pill{
    display:inline-flex;align-items:center;gap:8px;
    padding:6px 14px;background:rgba(34,211,238,.12);
    border:1px solid rgba(34,211,238,.32);border-radius:999px;
    font-size:11px;font-weight:700;color:var(--cyan);
    text-transform:uppercase;letter-spacing:.1em;margin-bottom:18px;
    backdrop-filter:blur(10px);
  }
  .hero-pill .dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 12px var(--cyan);animation:pulseDot 2s infinite}
  .hero-title{
    font-size:54px;font-weight:900;letter-spacing:-.02em;line-height:1.04;
    background:var(--grad-1);background-size:220% auto;
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
    animation:gradientText 8s ease infinite;
    margin-bottom:10px;
    text-shadow:0 0 50px rgba(34,211,238,.18);
  }
  .hero-sub{font-size:16px;color:var(--muted);font-weight:400;line-height:1.6;max-width:640px}
  .hero-sub b{color:var(--text);font-weight:600}

  .hero-meta{
    background:rgba(0,0,0,.28);border:1px solid rgba(148,163,184,.12);
    border-radius:14px;padding:18px 20px;backdrop-filter:blur(10px);
  }
  .hero-meta-row{
    display:flex;align-items:baseline;justify-content:space-between;
    padding:8px 0;border-bottom:1px dashed rgba(148,163,184,.12);
    font-size:12px;color:var(--muted);
  }
  .hero-meta-row:last-child{border-bottom:none}
  .hero-meta-row b{color:var(--text);font-weight:700;font-family:var(--mono);font-size:13px}
  .hero-meta-row .num{color:var(--cyan);font-weight:800;font-size:18px;font-family:var(--mono)}

  .hero-intro{
    margin-top:28px;padding-top:24px;
    border-top:1px solid rgba(148,163,184,.12);
    font-size:13.5px;color:var(--muted);line-height:1.75;max-width:1100px;
    position:relative;z-index:1;
  }
  .hero-intro b{color:var(--text);font-weight:600}
  .hero-intro code{
    background:rgba(34,211,238,.10);border:1px solid rgba(34,211,238,.22);
    padding:2px 8px;border-radius:6px;color:var(--cyan);
    font-family:var(--mono);font-size:12px;
  }

  /* ===== Hero stats grid ===== */
  .hero-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:32px}
  .stat{
    position:relative;padding:24px 22px;border-radius:18px;overflow:hidden;
    background:rgba(17,24,39,.6);backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,.06);
    transition:transform .25s ease,box-shadow .3s ease,border-color .25s ease;
    animation:fadeUp .6s ease-out backwards;
  }
  .stat:nth-child(1){animation-delay:.05s}.stat:nth-child(2){animation-delay:.10s}
  .stat:nth-child(3){animation-delay:.15s}.stat:nth-child(4){animation-delay:.20s}
  .stat:nth-child(5){animation-delay:.25s}
  .stat::before{
    content:'';position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(circle at 0% 0%,var(--accent-glow),transparent 55%);
    opacity:.15;transition:opacity .3s;
  }
  .stat::after{
    content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,var(--accent),transparent);
  }
  .stat:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.18);box-shadow:0 12px 40px var(--accent-glow)}
  .stat:hover::before{opacity:.32}
  .stat-num{font-size:46px;font-weight:900;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--accent);text-shadow:0 0 30px var(--accent-glow)}
  .stat-label{font-size:11px;color:var(--muted);margin-top:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
  .stat-sub{font-size:11px;color:var(--dim);margin-top:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,.08);line-height:1.6}
  .stat-icon{position:absolute;top:18px;right:18px;font-size:20px;opacity:.35}
  .stat.cyan{--accent:var(--cyan);--accent-glow:var(--cyan-glow)}
  .stat.green{--accent:var(--green);--accent-glow:var(--green-glow)}
  .stat.amber{--accent:var(--amber);--accent-glow:var(--amber-glow)}
  .stat.purple{--accent:var(--purple);--accent-glow:var(--purple-glow)}
  .stat.blue{--accent:var(--blue);--accent-glow:var(--blue-glow)}

  /* ===== Section ===== */
  .section-head{display:flex;align-items:baseline;gap:14px;margin:40px 0 18px;animation:fadeUp .5s ease-out}
  .section-head .num-tag{
    font-size:11px;font-weight:800;color:var(--cyan);
    letter-spacing:.14em;font-family:var(--mono);
    background:rgba(34,211,238,.10);border:1px solid rgba(34,211,238,.22);
    padding:4px 10px;border-radius:6px;
  }
  .section-head .title{font-size:24px;font-weight:800;letter-spacing:-.01em}
  .section-head .desc{font-size:12px;color:var(--muted);margin-left:auto;font-weight:500}
  .section-head .desc b{color:var(--text)}

  /* ===== Card ===== */
  .card{
    background:rgba(17,24,39,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,.06);
    border-radius:18px;padding:24px;
    transition:border-color .25s ease,transform .25s ease;
    animation:fadeUp .6s ease-out;
  }
  .card:hover{border-color:rgba(255,255,255,.12)}
  .card-title{
    font-size:11px;font-weight:800;color:var(--text);
    text-transform:uppercase;letter-spacing:.08em;
    margin-bottom:18px;
    display:flex;align-items:center;gap:10px;
  }
  .card-title .icon{
    width:32px;height:32px;border-radius:10px;
    display:flex;align-items:center;justify-content:center;
    background:rgba(34,211,238,.12);color:var(--cyan);font-size:15px;
    border:1px solid rgba(34,211,238,.22);
  }
  .card-title small{font-weight:500;text-transform:none;letter-spacing:0;color:var(--dim);margin-left:auto;font-size:11px}
  .card-note{
    margin-top:18px;padding-top:14px;
    border-top:1px solid rgba(148,163,184,.08);
    font-size:11.5px;color:var(--muted);line-height:1.75;
  }
  .card-note b{color:var(--text);font-weight:600}

  /* ===== Tier ladder ===== */
  .tier-ladder{display:flex;flex-direction:column;gap:11px}
  .tier-row{display:grid;grid-template-columns:140px 1fr 50px;align-items:center;gap:14px}
  .tier-name{font-size:12.5px;display:flex;align-items:center;gap:6px;font-weight:700}
  .tier-bar-wrap{position:relative;height:30px;border-radius:9px;background:rgba(148,163,184,.07);overflow:hidden}
  .tier-bar{
    height:100%;border-radius:9px;
    display:flex;align-items:center;padding:0 12px;
    font-size:11.5px;font-weight:800;color:#fff;
    position:relative;overflow:hidden;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 16px var(--bar-glow,transparent);
    animation:growBar 1.2s cubic-bezier(.22,.61,.36,1) backwards;
  }
  .tier-bar::after{
    content:'';position:absolute;inset:0;
    background:linear-gradient(90deg,transparent 20%,rgba(255,255,255,.22) 50%,transparent 80%);
    background-size:220% 100%;animation:shimmer 3.2s infinite;
  }
  .tier-count{text-align:right;font-size:15px;color:var(--text);font-variant-numeric:tabular-nums;font-weight:800;font-family:var(--mono)}

  /* ===== Kind list ===== */
  .kind-list{display:flex;flex-direction:column;gap:9px}
  .kind-row{display:grid;grid-template-columns:210px 1fr 50px;align-items:center;gap:12px}
  .kind-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;display:flex;align-items:center;gap:6px}
  .kind-bar-wrap{height:24px;border-radius:8px;background:rgba(148,163,184,.07);overflow:hidden}
  .kind-bar{
    height:100%;border-radius:8px;position:relative;overflow:hidden;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.18);
    animation:growBar 1.2s cubic-bezier(.22,.61,.36,1) backwards;
  }
  .kind-bar::after{
    content:'';position:absolute;inset:0;
    background:linear-gradient(90deg,transparent 20%,rgba(255,255,255,.18) 50%,transparent 80%);
    background-size:220% 100%;animation:shimmer 4s infinite;
  }
  .kind-count{text-align:right;font-size:14px;color:var(--text);font-variant-numeric:tabular-nums;font-weight:800;font-family:var(--mono)}

  /* ===== Filters ===== */
  .filters{
    display:flex;gap:10px;flex-wrap:wrap;align-items:center;
    margin-bottom:16px;padding:14px;
    background:rgba(0,0,0,.25);border-radius:14px;
    border:1px solid rgba(255,255,255,.05);
  }
  .filters select,.filters input{
    background:rgba(17,24,39,.85);color:var(--text);
    border:1px solid rgba(148,163,184,.18);border-radius:8px;
    padding:8px 12px;font-size:12.5px;font-family:inherit;
    transition:border-color .15s,box-shadow .15s,background .15s;
  }
  .filters select:hover,.filters input:hover{border-color:rgba(148,163,184,.32);background:rgba(17,24,39,.95)}
  .filters select:focus,.filters input:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(34,211,238,.18)}
  .filters .label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;font-weight:800;margin-right:2px}
  .filters .count{
    font-size:13px;font-weight:800;
    background:linear-gradient(135deg,rgba(34,211,238,.18),rgba(167,139,250,.16));
    color:var(--cyan);padding:6px 14px;border-radius:999px;
    border:1px solid rgba(34,211,238,.32);
    margin-left:auto;font-family:var(--mono);
    box-shadow:0 0 16px rgba(34,211,238,.18);
  }
  .filters .count::before{content:'● '}

  /* ===== Table ===== */
  .table-wrap{
    max-height:760px;overflow:auto;
    border:1px solid rgba(255,255,255,.06);border-radius:14px;
    background:rgba(0,0,0,.18);
  }
  .table-wrap::-webkit-scrollbar{width:10px;height:10px}
  .table-wrap::-webkit-scrollbar-track{background:transparent}
  .table-wrap::-webkit-scrollbar-thumb{background:rgba(148,163,184,.22);border-radius:5px;border:2px solid transparent;background-clip:padding-box}
  .table-wrap::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,.4);background-clip:padding-box}

  table.rules{width:100%;border-collapse:collapse;font-size:12.5px}
  table.rules thead th{
    position:sticky;top:0;z-index:2;
    background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(15,23,42,.92));
    backdrop-filter:blur(8px);
    color:var(--muted);
    text-transform:uppercase;font-size:10.5px;letter-spacing:.1em;font-weight:800;
    padding:14px 14px;text-align:left;
    border-bottom:1px solid rgba(148,163,184,.18);
    cursor:pointer;user-select:none;white-space:nowrap;
    transition:color .15s;
  }
  table.rules thead th:hover{color:var(--cyan)}
  table.rules thead th.sort-asc::after{content:' ▲';color:var(--cyan);font-size:9px}
  table.rules thead th.sort-desc::after{content:' ▼';color:var(--cyan);font-size:9px}
  table.rules tbody td{
    padding:13px 14px;border-bottom:1px solid rgba(148,163,184,.06);
    vertical-align:top;
  }
  table.rules tbody tr{transition:background .18s}
  table.rules tbody tr:hover{background:linear-gradient(90deg,rgba(34,211,238,.07),transparent 80%)}

  .col-rank{color:var(--dim);font-variant-numeric:tabular-nums;width:42px;font-weight:800;font-family:var(--mono)}
  .col-trigger{max-width:460px;min-width:280px}
  .trigger-text{
    color:var(--text);line-height:1.55;font-size:13px;font-weight:500;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
    overflow:hidden;
  }
  .rule-details{margin-top:8px;font-size:11.5px;color:var(--muted)}
  .rule-details summary{
    cursor:pointer;color:var(--cyan);font-size:11px;font-weight:700;
    list-style:none;padding:4px 10px;
    background:rgba(34,211,238,.08);
    border:1px solid rgba(34,211,238,.18);border-radius:6px;
    display:inline-flex;align-items:center;gap:6px;
    transition:background .15s;text-transform:uppercase;letter-spacing:.06em;
  }
  .rule-details summary::before{content:'▸';transition:transform .2s}
  .rule-details[open] summary::before{transform:rotate(90deg)}
  .rule-details summary:hover{background:rgba(34,211,238,.18)}
  .rule-correct,.rule-reason{
    margin-top:10px;padding:12px 14px;
    background:rgba(0,0,0,.3);border-radius:10px;
    border-left:3px solid var(--cyan);line-height:1.65;
  }
  .rule-reason{border-left-color:var(--purple)}
  .rule-correct b,.rule-reason b{color:var(--cyan);font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.1em;display:block;margin-bottom:6px}
  .rule-reason b{color:var(--purple)}

  .src-tag{display:inline-block;max-width:130px;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;font-family:var(--mono)}
  .num{text-align:right;font-variant-numeric:tabular-nums;color:var(--text);white-space:nowrap;font-weight:700;font-family:var(--mono)}
  .conf-cell{
    display:inline-block;padding:2px 9px;border-radius:6px;
    background:rgba(34,211,238,.1);color:var(--cyan);
    border:1px solid rgba(34,211,238,.22);
  }
  .muted{color:var(--muted)}
  .small{font-size:11px}

  /* ===== Badges ===== */
  .tier-badge,.type-badge,.enf-badge,.scope-badge{
    font-size:10.5px;padding:3px 9px;border-radius:999px;
    font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;gap:3px;
    letter-spacing:.04em;
  }

  /* ===== Events live feed ===== */
  .events-card{padding:0;overflow:hidden}
  .events-header{
    padding:18px 24px;display:flex;align-items:center;justify-content:space-between;
    border-bottom:1px solid rgba(255,255,255,.06);
    background:rgba(0,0,0,.18);
  }
  .events-title{font-size:11px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:10px}
  .events-title .icon{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(167,139,250,.12);color:var(--purple);font-size:15px;border:1px solid rgba(167,139,250,.22)}
  .events-live{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--green);font-weight:800;text-transform:uppercase;letter-spacing:.1em}
  .events-live .dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);animation:pulseDot 2s infinite}
  .events-scroll{max-height:600px;overflow-y:auto}
  .events-scroll::-webkit-scrollbar{width:8px}
  .events-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.22);border-radius:4px}

  .ev-row{
    display:grid;grid-template-columns:18px 220px 1fr 80px;
    align-items:center;gap:14px;
    padding:11px 24px;
    border-bottom:1px solid rgba(148,163,184,.05);
    font-size:12.5px;
    transition:background .15s;
  }
  .ev-row:hover{background:rgba(148,163,184,.04)}
  .ev-row:last-child{border-bottom:none}
  .ev-dot{width:9px;height:9px;border-radius:50%;box-shadow:0 0 12px currentColor}
  .ev-kind{font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ev-trigger{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-weight:500}
  .ev-time{font-size:11px;color:var(--dim);text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono)}

  /* ===== Footer ===== */
  .footer{
    margin-top:48px;padding:28px;
    border-top:1px solid rgba(255,255,255,.06);
    text-align:center;color:var(--dim);font-size:11.5px;line-height:1.85;
  }
  .footer code{
    background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.18);
    padding:2px 8px;border-radius:6px;color:var(--cyan);font-family:var(--mono);
  }

  @media(max-width:1100px){
    .hero-grid{grid-template-columns:1fr}
    .hero-stats{grid-template-columns:repeat(3,1fr)}
    .hero-title{font-size:40px}
    .grid-2{grid-template-columns:1fr}
  }
  @media(max-width:700px){
    .hero-stats{grid-template-columns:1fr 1fr}
    .hero-title{font-size:30px}
    .hero{padding:24px}
    .filters{gap:6px;padding:10px}
    .filters .label{display:none}
    .ev-row{grid-template-columns:14px 1fr 60px;font-size:11.5px}
    .ev-kind{display:none}
    .col-trigger{min-width:200px}
  }
</style>
</head>
<body>
<div class="page">

  <!-- ============ HERO ============ -->
  <div class="hero">
    <div class="hero-grid">
      <div>
        <div class="hero-pill"><span class="dot"></span>Live snapshot · zero mock data</div>
        <h1 class="hero-title">TeamAgent<br>Real Rule Ledger</h1>
        <div class="hero-sub">A self-evolving rule engine for AI coding agents — see <b>every rule</b> the agent currently follows, <b>how confident</b> the system is in each, and <b>exactly what happened</b> the last few hundred times tools were invoked. Generated end-to-end from the user's local SQLite stores.</div>
      </div>
      <div class="hero-meta">
        <div class="hero-meta-row"><span>Total rules</span><span class="num">${allRules.length}</span></div>
        <div class="hero-meta-row"><span>Personal scope</span><b>${personalRules.length}</b></div>
        <div class="hero-meta-row"><span>Global scope</span><b>${globalRules.length}</b></div>
        <div class="hero-meta-row"><span>Events analysed</span><b>${recentEventsAll.length}</b></div>
        <div class="hero-meta-row"><span>Generated</span><b>${escapeHtml(generatedAt.slice(0,19).replace('T',' '))}Z</b></div>
      </div>
    </div>
    <div class="hero-intro">
      Every row, score, timestamp, tier and enforcement flag below comes <b>directly from the user's local rule libraries</b>
      (<code>.teamagent/knowledge.db</code>, <code>~/.teamagent/global.db</code>) and the hook event log
      (<code>~/.teamagent/events.db</code>). Rule text is preserved <b>verbatim</b> in its original language — what you see is
      exactly what the agent reads at runtime. Tier transitions, demerit decay, confidence calibration and AI-override
      outcomes are <b>observed events</b>, not annotations. Use the filters and sortable columns to explore which rules are
      firing, which are dormant, and how the agent has been behaving recently.
    </div>
  </div>

  <!-- ============ HERO STATS ============ -->
  <div class="hero-stats">
    <div class="stat cyan">
      <div class="stat-icon">📚</div>
      <div class="stat-num">${allRules.length}</div>
      <div class="stat-label">Total rules</div>
      <div class="stat-sub">${active} active · ${dormant} dormant</div>
    </div>
    <div class="stat green">
      <div class="stat-icon">🛡️</div>
      <div class="stat-num">${complianceRate}<span style="font-size:24px">%</span></div>
      <div class="stat-label">Pre-tool pass rate</div>
      <div class="stat-sub">${passRate} passed of ${totalChecks} checks</div>
    </div>
    <div class="stat amber">
      <div class="stat-icon">⚠️</div>
      <div class="stat-num">${warnRate + blockRate}</div>
      <div class="stat-label">Warns + blocks</div>
      <div class="stat-sub">${warnRate} warned · ${blockRate} blocked</div>
    </div>
    <div class="stat purple">
      <div class="stat-icon">🤝</div>
      <div class="stat-num">${overrideComplied}</div>
      <div class="stat-label">AI complied</div>
      <div class="stat-sub">${overrideIgnored} ignored · ${overrideCircumvented} circumvented</div>
    </div>
    <div class="stat blue">
      <div class="stat-icon">📡</div>
      <div class="stat-num">${recentEventsAll.length}</div>
      <div class="stat-label">Events analysed</div>
      <div class="stat-sub">latest event window</div>
    </div>
  </div>

  <!-- ============ DISTRIBUTIONS ============ -->
  <div class="section-head">
    <span class="num-tag">01 · DISTRIBUTIONS</span>
    <span class="title">How rules and events break down</span>
    <span class="desc"><b>${active}</b> active rules · <b>${recentEventsAll.length}</b> events</span>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title"><span class="icon">⚡</span> Tier distribution <small>active rules only</small></div>
      <div class="tier-ladder">
        ${tierBarsHtml}
      </div>
      <div class="card-note">
        Tiers track rule maturity:
        <b>experimental</b> (just learned) → <b>probation</b> → <b>stable</b> → <b>canonical</b> (battle-tested) → <b>enforced</b> (hard block).
        <b>dormant</b> rules have accumulated demerit ≥ 50 and are temporarily inactive until exponential decay revives them.
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="icon">📡</span> Event distribution <small>latest 500 events</small></div>
      <div class="kind-list">
        ${kindBarsHtml}
      </div>
      <div class="card-note">
        Events are emitted by the pre-tool hook, post-tool hook and the offline calibrator.
        <b>passed</b> means the agent's intended action matched no avoidance rule; <b>warned</b>/<b>blocked</b>
        means a rule fired with the corresponding enforcement; <b>complied</b>/<b>ignored</b> records whether
        the agent followed the rule after the warning.
      </div>
    </div>
  </div>

  <!-- ============ RULES LIBRARY ============ -->
  <div class="section-head">
    <span class="num-tag">02 · RULES LIBRARY</span>
    <span class="title">Every rule, sortable & filterable</span>
    <span class="desc"><b>${rulesForTable.length}</b> rows · click any column to sort</span>
  </div>
  <div class="card">
    <div class="filters">
      <span class="label">Scope</span>
      <select id="f-scope">
        <option value="">All scopes</option>
        <option value="personal">personal</option>
        <option value="global">global</option>
      </select>
      <span class="label">Tier</span>
      <select id="f-tier">${tierOpts}</select>
      <span class="label">Type</span>
      <select id="f-type">${typeOpts}</select>
      <span class="label">Source</span>
      <select id="f-source">${sourceOpts}</select>
      <span class="label">Status</span>
      <select id="f-status">
        <option value="">All statuses</option>
        <option value="active">active</option>
      </select>
      <input id="f-search" type="search" placeholder="🔍 Search trigger / pattern…" style="min-width:240px;flex:1">
      <span class="count" id="f-count">${rulesForTable.length}</span>
    </div>
    <div class="table-wrap">
      <table class="rules" id="rules-table">
        <thead>
          <tr>
            <th data-sort="rank">#</th>
            <th data-sort="trigger">Trigger</th>
            <th data-sort="scope">Scope</th>
            <th data-sort="source">Source</th>
            <th data-sort="type">Type</th>
            <th data-sort="tier">Tier</th>
            <th data-sort="enforcement">Enforcement</th>
            <th data-sort="conf" class="num">Conf</th>
            <th data-sort="demerit" class="num">Demerit</th>
            <th data-sort="hits" class="num">Hits</th>
            <th data-sort="events" class="num">Events</th>
            <th data-sort="created">Created</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  </div>

  <!-- ============ RECENT EVENTS ============ -->
  <div class="section-head">
    <span class="num-tag">03 · LIVE FEED</span>
    <span class="title">Recent running events</span>
    <span class="desc">latest <b>${recentEvents.length}</b> hook events</span>
  </div>
  <div class="card events-card">
    <div class="events-header">
      <div class="events-title"><span class="icon">⏱️</span> Hook event stream</div>
      <div class="events-live"><span class="dot"></span>Live</div>
    </div>
    <div class="events-scroll">
      ${eventsHtml}
    </div>
  </div>

  <div class="footer">
    Generated by <code>scripts/generate-rules-page-en.cjs</code> from
    <code>.teamagent/knowledge.db</code>, <code>~/.teamagent/global.db</code> and
    <code>~/.teamagent/events.db</code>.<br>
    <b style="color:var(--cyan)">${allRules.length}</b> rules · <b style="color:var(--purple)">${recentEventsAll.length}</b> events · snapshot ${escapeHtml(generatedAt)}
  </div>
</div>

<script>
(function(){
  const tbody = document.querySelector('#rules-table tbody');
  const rows = Array.from(tbody.querySelectorAll('tr.rule-row'));
  const fScope = document.getElementById('f-scope');
  const fTier = document.getElementById('f-tier');
  const fType = document.getElementById('f-type');
  const fSource = document.getElementById('f-source');
  const fStatus = document.getElementById('f-status');
  const fSearch = document.getElementById('f-search');
  const fCount = document.getElementById('f-count');

  function applyFilter(){
    const scope = fScope.value, tier = fTier.value, type = fType.value;
    const source = fSource.value, status = fStatus.value;
    const q = fSearch.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach(r => {
      if (scope && r.dataset.scope !== scope) return r.style.display='none';
      if (tier && r.dataset.tier !== tier) return r.style.display='none';
      if (type && r.dataset.type !== type) return r.style.display='none';
      if (source && r.dataset.source !== source) return r.style.display='none';
      if (status && r.dataset.status !== status) return r.style.display='none';
      if (q && !r.textContent.toLowerCase().includes(q)) return r.style.display='none';
      r.style.display='';
      visible++;
    });
    fCount.textContent = visible;
    // Re-rank visible rows
    let i = 0;
    rows.forEach(r => {
      if (r.style.display !== 'none') { r.querySelector('.col-rank').textContent = ++i; }
    });
  }

  [fScope,fTier,fType,fSource,fStatus].forEach(el => el.addEventListener('change', applyFilter));
  fSearch.addEventListener('input', applyFilter);

  // Sortable columns
  const headers = document.querySelectorAll('#rules-table thead th[data-sort]');
  let currentSort = { key: null, dir: 1 };
  headers.forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (currentSort.key === key) currentSort.dir = -currentSort.dir;
    else { currentSort.key = key; currentSort.dir = -1; } // default desc for numeric
    headers.forEach(h => h.classList.remove('sort-asc','sort-desc'));
    th.classList.add(currentSort.dir > 0 ? 'sort-asc' : 'sort-desc');

    const numericKeys = new Set(['conf','demerit','hits','events','rank','trust']);
    const dateKeys = new Set(['created']);
    const getVal = (row) => {
      switch(key){
        case 'conf': return Number(row.dataset.conf||0);
        case 'demerit': return Number(row.dataset.demerit||0);
        case 'hits': return Number(row.dataset.hits||0);
        case 'events': return Number(row.dataset.events||0);
        case 'created': return row.dataset.created || '';
        case 'tier': return row.dataset.tier;
        case 'type': return row.dataset.type;
        case 'scope': return row.dataset.scope;
        case 'source': return row.dataset.source;
        case 'enforcement': return row.querySelector('.enf-badge')?.textContent || '';
        case 'trigger': return (row.querySelector('.trigger-text')?.textContent || '').toLowerCase();
        case 'rank': return rows.indexOf(row);
        default: return '';
      }
    };
    const sorted = rows.slice().sort((a,b) => {
      const va = getVal(a), vb = getVal(b);
      if (numericKeys.has(key) || dateKeys.has(key)) {
        return ((va > vb) - (va < vb)) * currentSort.dir;
      }
      return String(va).localeCompare(String(vb)) * currentSort.dir;
    });
    sorted.forEach(r => tbody.appendChild(r));
    applyFilter(); // re-rank after sort
  }));
})();
</script>
</body>
</html>`;

const outPath = path.join(cwd, 'docs', 'teamagent-rules.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf-8');
console.log('Rule ledger page written to:', outPath);
console.log('  rules:', allRules.length, '| events analysed:', recentEventsAll.length);
console.log('  active:', active, '| dormant:', dormant);
console.log('  pass rate:', complianceRate + '%', '(', passRate, '/', totalChecks, ')');
