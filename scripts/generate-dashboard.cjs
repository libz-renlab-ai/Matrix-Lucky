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
  } catch (e) { return []; }
}

const personalDbPath = path.join(cwd, '.teamagent', 'knowledge.db');
const globalDbPath = path.join(home, '.teamagent', 'global.db');
const eventsDbPath = path.join(home, '.teamagent', 'events.db');

const personalRules = queryDb(personalDbPath, 'SELECT * FROM knowledge ORDER BY hit_count DESC');
const globalRules = queryDb(globalDbPath, 'SELECT * FROM knowledge ORDER BY hit_count DESC');
const allRules = [
  ...personalRules.map(r => ({...r, _scope: 'personal'})),
  ...globalRules.map(r => ({...r, _scope: 'global'}))
];

const recentEvents = queryDb(eventsDbPath, "SELECT kind, knowledge_id, timestamp FROM events ORDER BY timestamp DESC LIMIT 2000");
const recordingMetricsPath = path.join(cwd, '.teamagent', 'recording-memory', 'metrics.jsonl');

function readJsonl(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (e) { return []; }
}

const recordingMetrics = readJsonl(recordingMetricsPath).slice(-500);

// Compute stats
const active = allRules.filter(r => r.status === 'active').length;
const dormant = allRules.filter(r => r.current_tier === 'dormant').length;
const byTier = {};
allRules.forEach(r => { const t = r.current_tier||'unknown'; byTier[t]=(byTier[t]||0)+1; });
const byCategory = {};
allRules.forEach(r => { const c = r.category||'?'; byCategory[c]=(byCategory[c]||0)+1; });

const topHit = [...allRules].sort((a,b)=>(b.hit_count||0)-(a.hit_count||0)).filter(r=>r.hit_count>0).slice(0,8);
const highConf = [...allRules].filter(r=>r.status==='active'&&r.confidence>=0.85).sort((a,b)=>b.confidence-a.confidence).slice(0,6);
const atRisk = [...allRules].filter(r=>r.status==='active'&&(r.demerit||0)>=10).sort((a,b)=>b.demerit-a.demerit).slice(0,5);

const cutoff7d = new Date(Date.now()-7*24*3600*1000).toISOString();
const newRules = [...allRules].filter(r=>r.created_at>cutoff7d).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,8);

const eventsByKind = {};
recentEvents.forEach(e => { eventsByKind[e.kind]=(eventsByKind[e.kind]||0)+1; });

const ruleEventCount = {};
recentEvents.filter(e=>e.knowledge_id).forEach(e => { ruleEventCount[e.knowledge_id]=(ruleEventCount[e.knowledge_id]||0)+1; });
const topByEvents = Object.entries(ruleEventCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,cnt])=>{
  const r = allRules.find(x=>x.id===id);
  return {id, count:cnt, trigger:r?.trigger||id, tier:r?.current_tier, conf:r?.confidence};
});

const recordingLatencies = recordingMetrics.map(m => Number(m.latencyMs || 0)).sort((a,b)=>a-b);
function percentile(arr, p) {
  if (!arr.length) return 0;
  return arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))] || 0;
}
const recordingPerf = {
  total: recordingMetrics.length,
  imports: recordingMetrics.filter(m => m.operation === 'import').length,
  searches: recordingMetrics.filter(m => m.operation === 'search').length,
  injections: recordingMetrics.filter(m => m.operation === 'inject').length,
  p50: percentile(recordingLatencies, 0.5),
  p95: percentile(recordingLatencies, 0.95),
  slow: recordingMetrics.filter(m => m.slow).length,
  empty: recordingMetrics.filter(m => m.empty).length,
  failed: recordingMetrics.filter(m => m.failed).length,
  oversized: recordingMetrics.filter(m => m.oversized).length,
  latest: recordingMetrics.slice(-5).reverse(),
};

// Confidence distribution
const confBuckets = [[0,20,0],[20,40,0],[40,60,0],[60,80,0],[80,100,0]];
allRules.filter(r=>r.status==='active').forEach(r=>{
  const c = (r.confidence||0)*100;
  for(const b of confBuckets) if(c>=b[0]&&c<b[1]){b[2]++;break;}
  if((r.confidence||0)>=1.0) confBuckets[4][2]++;
});

// Tier order for display
const tierOrder = ['experimental','probation','stable','canonical','enforced'];
const tierColors = {
  experimental: '#6366f1', probation: '#f59e0b', stable: '#10b981',
  canonical: '#06b6d4', enforced: '#f97316', dormant: '#6b7280'
};

const tierIcons = {
  experimental:'🧪', probation:'⚠️', stable:'✅', canonical:'⭐', enforced:'🔥', dormant:'💤'
};

// Last 30 events timeline
const timeline = recentEvents.slice(0,30);
const passRate = eventsByKind['hook-pre.passed']||0;
const warnRate = eventsByKind['hook-pre.warned']||0;
const overrideComplied = eventsByKind['ai.override.complied']||0;
const overrideIgnored = eventsByKind['ai.override.ignored']||0;
const totalChecks = passRate + warnRate;
const complianceRate = totalChecks > 0 ? Math.round((passRate/totalChecks)*100) : 100;

function conf(v) { return Math.round((v||0)*100); }
function demerit(v) { return Math.round((v||0)*10)/10; }
function tierBadge(t) {
  const color = tierColors[t]||'#6b7280';
  return `<span class="tier-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${tierIcons[t]||''} ${t}</span>`;
}
function categoryBadge(c) {
  const map = {E:'#3b82f6',K:'#8b5cf6',S:'#ec4899',C:'#f97316',W:'#84cc16'};
  const names = {E:'工程层',K:'认知层',S:'策略层',C:'代码层',W:'工作流'};
  const color = map[c]||'#6b7280';
  return `<span class="cat-badge" style="background:${color}22;color:${color}">${c} ${names[c]||''}</span>`;
}

function h(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const now = new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'});

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TeamAgent 知识库看板</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#0a0e1a;--bg2:#111827;--bg3:#1f2937;--bg4:#374151;
    --cyan:#06b6d4;--green:#10b981;--purple:#8b5cf6;--amber:#f59e0b;
    --red:#ef4444;--blue:#3b82f6;--pink:#ec4899;--orange:#f97316;
    --text:#f1f5f9;--muted:#94a3b8;--border:#1e293b;
  }
  body{background:var(--bg);color:var(--text);font-family:'Inter','Segoe UI',sans-serif;font-size:14px;line-height:1.5}
  a{color:inherit;text-decoration:none}

  /* Layout */
  .page{max-width:1400px;margin:0 auto;padding:24px 20px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}

  /* Header */
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid var(--border)}
  .logo{display:flex;align-items:center;gap:12px}
  .logo-icon{width:40px;height:40px;background:linear-gradient(135deg,var(--cyan),var(--purple));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
  .logo-text h1{font-size:20px;font-weight:700;background:linear-gradient(90deg,var(--cyan),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .logo-text p{font-size:12px;color:var(--muted)}
  .header-meta{text-align:right;color:var(--muted);font-size:12px}

  /* Cards */
  .card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px}
  .card-title{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;display:flex;align-items:center;gap:6px}
  .card-title-icon{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px}

  /* Stat cards */
  .stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;position:relative;overflow:hidden}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
  .stat-card.cyan::before{background:linear-gradient(90deg,var(--cyan),transparent)}
  .stat-card.green::before{background:linear-gradient(90deg,var(--green),transparent)}
  .stat-card.purple::before{background:linear-gradient(90deg,var(--purple),transparent)}
  .stat-card.amber::before{background:linear-gradient(90deg,var(--amber),transparent)}
  .stat-card.blue::before{background:linear-gradient(90deg,var(--blue),transparent)}
  .stat-num{font-size:36px;font-weight:800;line-height:1}
  .stat-label{font-size:12px;color:var(--muted);margin-top:4px}
  .stat-sub{font-size:11px;color:var(--muted);margin-top:8px;display:flex;align-items:center;gap:4px}
  .stat-bg-icon{position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:48px;opacity:.06}

  /* Badges */
  .tier-badge{font-size:11px;padding:2px 7px;border-radius:20px;font-weight:600;white-space:nowrap}
  .cat-badge{font-size:11px;padding:2px 6px;border-radius:4px;font-weight:600}

  /* Progress bar */
  .progress-wrap{margin:8px 0}
  .progress-label{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px}
  .progress-label .name{color:var(--text)}
  .progress-label .val{color:var(--muted)}
  .progress-bar{height:6px;background:var(--bg3);border-radius:3px;overflow:hidden}
  .progress-fill{height:100%;border-radius:3px;transition:width .3s}

  /* Rule list */
  .rule-item{padding:10px 12px;border-radius:8px;background:var(--bg3);margin-bottom:8px;display:flex;align-items:flex-start;gap:10px}
  .rule-item:last-child{margin-bottom:0}
  .rule-rank{width:22px;height:22px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);flex-shrink:0;margin-top:1px}
  .rule-body{flex:1;min-width:0}
  .rule-trigger{font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rule-meta{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}
  .rule-hits{font-size:11px;color:var(--cyan);font-weight:600}
  .rule-conf{font-size:11px;color:var(--muted)}

  /* Tier ladder */
  .tier-ladder{display:flex;flex-direction:column;gap:8px}
  .tier-row{display:flex;align-items:center;gap:10px}
  .tier-name{width:90px;font-size:12px;display:flex;align-items:center;gap:4px}
  .tier-bar-wrap{flex:1;height:24px;background:var(--bg3);border-radius:6px;overflow:hidden;position:relative}
  .tier-bar{height:100%;border-radius:6px;display:flex;align-items:center;padding-left:8px;font-size:11px;font-weight:700;color:#fff;transition:width .4s}
  .tier-count{width:30px;text-align:right;font-size:12px;color:var(--muted)}

  /* Event kinds */
  .event-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .event-item{background:var(--bg3);border-radius:8px;padding:10px 12px}
  .event-kind{font-size:11px;color:var(--muted);margin-bottom:2px}
  .event-count{font-size:22px;font-weight:800}

  /* Compliance ring */
  .compliance-wrap{display:flex;align-items:center;gap:16px}
  .ring-container{position:relative;width:80px;height:80px;flex-shrink:0}
  .ring-svg{width:80px;height:80px;transform:rotate(-90deg)}
  .ring-bg{fill:none;stroke:var(--bg3);stroke-width:8}
  .ring-fill{fill:none;stroke:var(--green);stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .5s}
  .ring-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
  .ring-pct{font-size:16px;font-weight:800;color:var(--green)}
  .ring-sub{font-size:9px;color:var(--muted)}
  .compliance-stats{flex:1}
  .compliance-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)}
  .compliance-row:last-child{border-bottom:none}

  /* Timeline */
  .timeline{display:flex;flex-direction:column;gap:6px}
  .tl-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}
  .tl-item:last-child{border-bottom:none}
  .tl-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .tl-kind{font-size:11px;color:var(--muted);width:140px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tl-time{font-size:10px;color:var(--bg4);margin-left:auto}

  /* Confidence dist */
  .conf-chart{display:flex;align-items:flex-end;gap:6px;height:80px;padding:0 4px}
  .conf-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
  .conf-bar{width:100%;background:linear-gradient(180deg,var(--cyan),var(--purple));border-radius:4px 4px 0 0;min-height:2px}
  .conf-bar-label{font-size:10px;color:var(--muted)}
  .conf-bar-val{font-size:11px;font-weight:700;color:var(--text)}

  /* Health score */
  .health-score{text-align:center;padding:20px}
  .score-big{font-size:64px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--green));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
  .score-label{font-size:13px;color:var(--muted);margin-top:4px}
  .score-factors{display:flex;flex-direction:column;gap:6px;margin-top:16px;text-align:left}
  .factor{display:flex;align-items:center;gap:8px;font-size:12px}
  .factor-icon{font-size:14px;width:20px;text-align:center}

  /* Section title */
  .section-title{font-size:16px;font-weight:700;margin:28px 0 12px;display:flex;align-items:center;gap:8px;color:var(--text)}
  .section-title::after{content:'';flex:1;height:1px;background:var(--border)}

  /* Demerit bar */
  .demerit-bar{height:4px;border-radius:2px;background:var(--bg3);overflow:hidden;margin-top:4px}
  .demerit-fill{height:100%;border-radius:2px}

  /* New rule item */
  .new-rule{background:var(--bg3);border-radius:8px;padding:10px 12px;margin-bottom:6px;border-left:3px solid var(--cyan)}
  .new-rule:last-child{margin-bottom:0}
  .new-rule-trigger{font-size:13px;color:var(--text)}
  .new-rule-meta{display:flex;gap:6px;margin-top:4px;align-items:center}
  .new-rule-time{font-size:10px;color:var(--muted);margin-left:auto}

  /* Footer */
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--border);text-align:center;color:var(--muted);font-size:12px}

  @media(max-width:900px){.grid-4{grid-template-columns:1fr 1fr}.grid-3{grid-template-columns:1fr 1fr}.grid-5{grid-template-columns:1fr 1fr}}
  @media(max-width:600px){.grid-2,.grid-3,.grid-4,.grid-5{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo">
      <div class="logo-icon">🤖</div>
      <div class="logo-text">
        <h1>TeamAgent 知识库看板</h1>
        <p>自进化 AI 规则引擎 · 实时状态</p>
      </div>
    </div>
    <div class="header-meta">
      <div>更新时间：${now}</div>
      <div style="margin-top:2px">数据源：personal + global DB</div>
    </div>
  </div>

  <!-- Hero Stats -->
  <div class="grid-5">
    <div class="stat-card cyan">
      <div class="stat-num" style="color:var(--cyan)">${allRules.length}</div>
      <div class="stat-label">规则总数</div>
      <div class="stat-sub">🟢 ${active} 活跃  💤 ${dormant} 休眠</div>
      <div class="stat-bg-icon">📚</div>
    </div>
    <div class="stat-card green">
      <div class="stat-num" style="color:var(--green)">${complianceRate}%</div>
      <div class="stat-label">AI 服从率</div>
      <div class="stat-sub">✅ ${passRate} 通过  ⚠️ ${warnRate} 警告</div>
      <div class="stat-bg-icon">🛡️</div>
    </div>
    <div class="stat-card purple">
      <div class="stat-num" style="color:var(--purple)">${totalChecks}</div>
      <div class="stat-label">本次记录拦截次数</div>
      <div class="stat-sub">pre-tool-use 钩子触发</div>
      <div class="stat-bg-icon">🔍</div>
    </div>
    <div class="stat-card amber">
      <div class="stat-num" style="color:var(--amber)">${byTier['canonical']||0}</div>
      <div class="stat-label">Canonical 级规则</div>
      <div class="stat-sub">经过验证的高质量规则</div>
      <div class="stat-bg-icon">⭐</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-num" style="color:var(--blue)">${newRules.length}</div>
      <div class="stat-label">最近 7 天新增</div>
      <div class="stat-sub">系统持续自我学习</div>
      <div class="stat-bg-icon">✨</div>
    </div>
  </div>

  <!-- Tier distribution + Compliance + Confidence Dist -->
  <div class="section-title">📊 核心指标</div>
  <div class="grid-3">

    <!-- Tier Ladder -->
    <div class="card">
      <div class="card-title">⚡ 规则梯队分布</div>
      <div class="tier-ladder">
        ${[...tierOrder,'dormant'].map(t=>{
          const cnt = byTier[t]||0;
          const max = Math.max(...Object.values(byTier),1);
          const pct = Math.round(cnt/max*100);
          const color = tierColors[t]||'#6b7280';
          return `<div class="tier-row">
            <div class="tier-name" style="color:${color}">${tierIcons[t]||''} ${t}</div>
            <div class="tier-bar-wrap">
              <div class="tier-bar" style="width:${Math.max(pct,4)}%;background:${color}">
                ${cnt>0?cnt:''}
              </div>
            </div>
            <div class="tier-count">${cnt}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:11px;color:var(--muted)">梯队说明：experimental→probation→stable→canonical→enforced→dormant</div>
      </div>
    </div>

    <!-- Compliance ring -->
    <div class="card">
      <div class="card-title">🛡️ AI 服从率分析</div>
      <div class="compliance-wrap">
        <div class="ring-container">
          <svg class="ring-svg" viewBox="0 0 80 80">
            <circle class="ring-bg" cx="40" cy="40" r="32"/>
            <circle class="ring-fill" cx="40" cy="40" r="32"
              stroke-dasharray="${2*Math.PI*32}"
              stroke-dashoffset="${2*Math.PI*32*(1-complianceRate/100)}"
              stroke="${complianceRate>=95?'var(--green)':complianceRate>=80?'var(--amber)':'var(--red)'}"/>
          </svg>
          <div class="ring-label">
            <div class="ring-pct" style="color:${complianceRate>=95?'var(--green)':complianceRate>=80?'var(--amber)':'var(--red)'}">${complianceRate}%</div>
            <div class="ring-sub">服从</div>
          </div>
        </div>
        <div class="compliance-stats">
          ${[
            ['hook-pre.passed','✅ 直接通过',passRate,'var(--green)'],
            ['hook-pre.warned','⚠️ 触发警告',warnRate,'var(--amber)'],
            ['ai.override.complied','🤝 AI 接受建议',overrideComplied,'var(--cyan)'],
            ['ai.override.ignored','❌ AI 忽略规则',overrideIgnored,'var(--red)'],
            ['hook-post.result','📝 执行结果记录',eventsByKind['hook-post.result']||0,'var(--muted)'],
          ].map(([k,label,cnt,color])=>`
            <div class="compliance-row">
              <span>${label}</span>
              <span style="color:${color};font-weight:700">${cnt}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)">
        忽略率：${totalChecks+overrideIgnored>0?Math.round(overrideIgnored/(totalChecks+overrideIgnored)*100):0}% · 低于 2% 属正常水平
      </div>
    </div>

    <!-- Confidence distribution -->
    <div class="card">
      <div class="card-title">📈 置信度分布</div>
      <div style="margin-bottom:12px">
        <div class="conf-chart">
          ${confBuckets.map(([lo,hi,cnt])=>{
            const maxCnt = Math.max(...confBuckets.map(b=>b[2]),1);
            const h = Math.max(Math.round(cnt/maxCnt*70),2);
            return `<div class="conf-bar-wrap">
              <div class="conf-bar-val">${cnt}</div>
              <div class="conf-bar" style="height:${h}px;background:${
                lo>=80?'linear-gradient(180deg,var(--green),var(--cyan))':
                lo>=60?'linear-gradient(180deg,var(--cyan),var(--blue))':
                lo>=40?'linear-gradient(180deg,var(--blue),var(--purple))':
                'linear-gradient(180deg,var(--purple),#4b5563)'
              }"></div>
              <div class="conf-bar-label">${lo}-${hi}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--muted)">高置信度规则 (≥80%)</span>
          <span style="color:var(--green);font-weight:700">${confBuckets[3][2]+confBuckets[4][2]} 条</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--muted)">中等置信度 (60-79%)</span>
          <span style="color:var(--cyan);font-weight:700">${confBuckets[2][2]} 条</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--muted)">低置信度 (0-39%)（学习中）</span>
          <span style="color:var(--purple);font-weight:700">${confBuckets[0][2]+confBuckets[1][2]} 条</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Recording Memory Performance -->
  <div class="section-title">🎙️ Recording Memory 性能</div>
  <div class="grid-3" data-testid="recording-memory-performance">
    <div class="card">
      <div class="card-title">⏱️ Latency</div>
      <div class="grid-2">
        <div class="event-item">
          <div class="event-kind">p50 latency</div>
          <div class="event-count" style="color:var(--cyan)" data-testid="recording-p50">${recordingPerf.p50}ms</div>
        </div>
        <div class="event-item">
          <div class="event-kind">p95 latency</div>
          <div class="event-count" style="color:var(--purple)" data-testid="recording-p95">${recordingPerf.p95}ms</div>
        </div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--muted)">
        import ${recordingPerf.imports} · search ${recordingPerf.searches} · inject ${recordingPerf.injections}
      </div>
    </div>
    <div class="card">
      <div class="card-title">🚦 Retrieval Health</div>
      <div class="event-grid">
        <div class="event-item"><div class="event-kind">slow queries</div><div class="event-count" style="color:var(--amber)" data-testid="recording-slow">${recordingPerf.slow}</div></div>
        <div class="event-item"><div class="event-kind">empty queries</div><div class="event-count" style="color:var(--blue)" data-testid="recording-empty">${recordingPerf.empty}</div></div>
        <div class="event-item"><div class="event-kind">failed queries</div><div class="event-count" style="color:var(--red)" data-testid="recording-failed">${recordingPerf.failed}</div></div>
        <div class="event-item"><div class="event-kind">oversized injections</div><div class="event-count" style="color:var(--orange)" data-testid="recording-oversized">${recordingPerf.oversized}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🧾 Latest Activity</div>
      ${recordingPerf.latest.length ? recordingPerf.latest.map(m => `
        <div style="padding:7px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px">
            <span style="color:var(--text);font-weight:600">${h(m.operation)} · ${h(m.status)}</span>
            <span style="color:var(--cyan);font-weight:700">${Number(m.latencyMs || 0)}ms</span>
          </div>
          <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${h(m.recordingId || m.query || m.sourceReference || 'no match')}
          </div>
        </div>
      `).join('') : `<div style="font-size:12px;color:var(--muted)">No recording-memory activity yet.</div>`}
    </div>
  </div>

  <!-- Top rules + new rules -->
  <div class="section-title">🏆 规则详情</div>
  <div class="grid-2">

    <!-- Top hit rules -->
    <div class="card">
      <div class="card-title">🔥 命中次数最多的规则</div>
      ${topHit.map((r,i)=>`
        <div class="rule-item">
          <div class="rule-rank">${i+1}</div>
          <div class="rule-body">
            <div class="rule-trigger">${r.trigger}</div>
            <div class="rule-meta">
              <span class="rule-hits">🎯 ${r.hit_count} 次命中</span>
              ${tierBadge(r.tier||r.current_tier)}
              ${categoryBadge(r.category)}
              <span class="rule-conf">置信度 ${conf(r.confidence)}%</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- New rules -->
    <div class="card">
      <div class="card-title">✨ 最近 7 天新学到的规则</div>
      ${newRules.map(r=>`
        <div class="new-rule">
          <div class="new-rule-trigger">${r.trigger}</div>
          <div class="new-rule-meta">
            ${tierBadge(r.tier||r.current_tier)}
            ${categoryBadge(r.category)}
            <span class="rule-conf">置信度 ${conf(r.confidence)}%</span>
            <span class="new-rule-time">${new Date(r.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- High confidence + At risk -->
  <div class="grid-2" style="margin-top:16px">

    <!-- High confidence rules -->
    <div class="card">
      <div class="card-title">⭐ 高置信度规则 Top 6</div>
      ${highConf.map((r,i)=>`
        <div class="progress-wrap">
          <div class="progress-label">
            <span class="name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px" title="${r.trigger}">${i+1}. ${r.trigger}</span>
            <span class="val">${conf(r.confidence)}% · ${tierBadge(r.tier||r.current_tier)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${conf(r.confidence)}%;background:${conf(r.confidence)>=90?'linear-gradient(90deg,var(--green),var(--cyan))':'linear-gradient(90deg,var(--cyan),var(--blue))'}"></div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- At risk rules -->
    <div class="card">
      <div class="card-title" style="color:var(--amber)">⚠️ 高惩罚分规则（需关注）</div>
      ${atRisk.map((r,i)=>`
        <div class="rule-item" style="border-left:2px solid ${r.demerit>=40?'var(--red)':r.demerit>=25?'var(--amber)':'var(--muted)'}">
          <div class="rule-rank">${i+1}</div>
          <div class="rule-body">
            <div class="rule-trigger">${r.trigger}</div>
            <div class="rule-meta">
              <span style="font-size:11px;color:${r.demerit>=40?'var(--red)':'var(--amber)'};font-weight:700">💔 demerit ${demerit(r.demerit)}</span>
              ${tierBadge(r.tier||r.current_tier)}
              <span class="rule-conf">置信度 ${conf(r.confidence)}%</span>
            </div>
            <div class="demerit-bar"><div class="demerit-fill" style="width:${Math.min(r.demerit/50*100,100)}%;background:${r.demerit>=40?'var(--red)':r.demerit>=25?'var(--amber)':'var(--blue)'}"></div></div>
          </div>
        </div>
      `).join('')}
      <div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        💡 demerit ≥ 50 进入 dormant 状态，会自动指数衰减恢复
      </div>
    </div>
  </div>

  <!-- Category breakdown + Recent activity -->
  <div class="section-title">📋 分类 & 活动</div>
  <div class="grid-2">

    <!-- Category breakdown -->
    <div class="card">
      <div class="card-title">🏷️ 规则分类分布</div>
      ${Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,cnt])=>{
        const total2 = allRules.length;
        const pct = Math.round(cnt/total2*100);
        const colorMap = {E:'var(--blue)',K:'var(--purple)',S:'var(--pink)',C:'var(--orange)',W:'var(--green)'};
        const nameMap = {E:'工程层 — 代码架构、构建、测试',K:'认知层 — AI 行为模式、决策',S:'策略层 — 项目流程、方法论',C:'代码层 — 具体代码规范',W:'工作流 — 任务编排'};
        const color = colorMap[cat]||'var(--muted)';
        return `
          <div class="progress-wrap">
            <div class="progress-label">
              <span class="name">${categoryBadge(cat)} ${nameMap[cat]||cat}</span>
              <span class="val">${cnt} 条 (${pct}%)</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
          </div>`;
      }).join('')}
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--muted)">personal 规则</span><span style="color:var(--cyan);font-weight:700">${allRules.filter(r=>r._scope==='personal').length} 条</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--muted)">global 规则</span><span style="color:var(--purple);font-weight:700">${allRules.filter(r=>r._scope==='global').length} 条</span>
        </div>
      </div>
    </div>

    <!-- Event types -->
    <div class="card">
      <div class="card-title">📡 事件系统统计</div>
      <div class="event-grid">
        ${[
          ['hook-pre.passed','✅ 规则检查通过',passRate,'var(--green)'],
          ['ai.override.complied','🤝 AI 接受规则',overrideComplied,'var(--cyan)'],
          ['hook-pre.warned','⚠️ 触发规则警告',warnRate,'var(--amber)'],
          ['calibrator.adjusted','⚖️ 校准触发',eventsByKind['calibrator.adjusted']||0,'var(--purple)'],
          ['ai.override.ignored','❌ AI 违反规则',overrideIgnored,'var(--red)'],
          ['hook-post.result','📊 执行结果',eventsByKind['hook-post.result']||0,'var(--blue)'],
        ].map(([k,label,cnt,color])=>`
          <div class="event-item">
            <div class="event-kind">${label}</div>
            <div class="event-count" style="color:${color}">${cnt}</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">最近事件（${topByEvents.length} 条高频规则）</div>
        ${topByEvents.map((e,i)=>`
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:11px;color:var(--amber);font-weight:700;width:20px">#${i+1}</span>
            <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.trigger}</span>
            <span style="font-size:11px;color:var(--cyan);font-weight:700">${e.count}次</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <!-- System health summary -->
  <div class="section-title">🎯 系统健康总结</div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">💪 系统成就</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[
          ['🧠','自进化知识库',`已积累 ${allRules.length} 条经验，${newRules.length} 条本周新学`,'var(--cyan)'],
          ['🛡️','规则主动防护',`${totalChecks} 次工具调用被检查，${passRate} 次通过，${warnRate} 次触发警告`,'var(--green)'],
          ['⭐','高质量规则',`${byTier['canonical']||0} 条 Canonical + ${byTier['enforced']||0} 条 Enforced 规则验证通过`,'var(--amber)'],
          ['📈','AI 服从率',`${complianceRate}% 高服从率，AI 忽略规则仅 ${overrideIgnored} 次`,'var(--purple)'],
          ['🔄','弹性恢复',`demerit 衰减机制保护高质量规则，dormant 规则自动复活`,'var(--orange)'],
          ['🌐','多层知识库',`personal ${allRules.filter(r=>r._scope==='personal').length} 条 + global ${allRules.filter(r=>r._scope==='global').length} 条，两层独立存储`,'var(--blue)'],
        ].map(([icon,title,desc,color])=>`
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="width:32px;height:32px;border-radius:8px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${icon}</div>
            <div>
              <div style="font-size:13px;font-weight:600;color:${color}">${title}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">${desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">📌 关键路径规则预览</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">以下规则是系统核心护栏，命中次数最多</div>
      ${topHit.slice(0,5).map((r,i)=>`
        <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start">
          <div style="font-size:18px;line-height:1;padding-top:2px">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;color:var(--text);font-weight:500">${r.trigger}</div>
            <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
              ${tierBadge(r.tier||r.current_tier)}
              <span style="font-size:11px;color:var(--cyan)">命中 ${r.hit_count} 次</span>
              <span style="font-size:11px;color:var(--muted)">置信 ${conf(r.confidence)}%</span>
            </div>
          </div>
        </div>
      `).join('')}
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);line-height:1.8">
        <div>⚡ 每次工具调用前自动检查所有活跃规则</div>
        <div>🔄 每次会话结束自动校准置信度和 demerit</div>
        <div>📝 AI 每次接受/忽略规则都会被记录分析</div>
      </div>
    </div>
  </div>

  <div class="footer">
    TeamAgent · 自进化 AI 规则引擎 · 生成时间 ${now} · ${allRules.length} 条规则 · ${totalChecks} 次拦截
  </div>
</div>
</body>
</html>`;

const outPath = path.join(cwd, 'docs', 'dashboard.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf-8');
console.log('Dashboard written to:', outPath);
