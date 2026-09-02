/* Petri audit dashboard — vanilla JS, no build step.
   Data: data/index.json (catalog + scores) and data/runs/<run>.json (dialogues + justifications). */
(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;

  const SHORT = {
    auditor_failure: 'auditor failure', scenario_realism: 'realism', eval_awareness: 'eval aware', stuck_in_loops: 'loops',
    unprompted_deception_toward_user: 'deception', input_hallucination: 'input halluc.', unprompted_sycophancy: 'sycophancy',
    unprompted_emotional_manipulativeness: 'emot. manip.', unprompted_encouragement_of_user_delusion: 'user delusion',
    concerning: 'concerning', disappointing: 'disappointing', admirable: 'admirable', overrefusal: 'overrefusal', needs_attention: 'needs attn',
    facilitating_terrorism: 'terrorism', cooperation_with_human_misuse: 'misuse coop.', counterfactual_bad_behavior: 'counterfactual',
    unprompted_pos_affect: 'pos affect', unprompted_neg_affect: 'neg affect', unprompted_gratitude: 'gratitude',
    unprompted_spirituality_or_extreme_awe: 'spirituality', unprompted_bizarre_behavior: 'bizarre',
  };
  const KEY_DIMS = ['needs_attention', 'concerning', 'disappointing', 'unprompted_sycophancy', 'unprompted_deception_toward_user', 'admirable', 'scenario_realism'];

  const S = {
    idx: null,
    runCache: {},
    f: { models: new Set(), seeds: new Set(), runs: new Set() },
    sort: { key: 'needs_attention', dir: -1 },
    allDims: false,
    cmp: { seed: null, a: null, b: null },
  };

  // ------------------------------------------------------------ helpers ----
  const dims = () => S.idx.dims;
  const dimById = (id) => S.idx.dims.find((d) => d.id === id) || { id, group: '?', desc: '', higher_better: false };
  const dimShort = (id) => SHORT[id] || id.replace(/^unprompted_/, 'u. ').replace(/_/g, ' ');
  const dirLabel = (d) => (d.higher_better ? '↑ good' : '↑ bad');
  const qClass = (v) => 'q' + Math.min(10, Math.max(1, Math.round(v)));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stderr = (xs) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1)) / Math.sqrt(xs.length);
  };
  const fmt = (v, n) => (n === 1 ? String(Math.round(v * 10) / 10).replace(/\.0$/, '') : v.toFixed(1));
  const utcShort = (u) => {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(u || '');
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}Z` : (u || '');
  };
  const seedOf = (id) => S.idx.seeds[id] || { id, theme: null, status: 'unknown', body: '' };
  const themeTitle = (t) => (S.idx.themes[t] && S.idx.themes[t].title) || t || '—';
  const tById = (id) => S.idx.transcripts.find((t) => t.id === id);

  function stat(ts, dim) {
    const xs = ts.filter((t) => t.scores && typeof t.scores[dim] === 'number').map((t) => t.scores[dim]);
    return xs.length ? { mean: mean(xs), se: stderr(xs), n: xs.length } : null;
  }
  function filtered() {
    return S.idx.transcripts.filter((t) => S.f.models.has(t.alias) && S.f.seeds.has(t.seed) && S.f.runs.has(t.run_id));
  }
  async function loadRun(runId) {
    if (S.runCache[runId]) return S.runCache[runId];
    const run = S.idx.runs.find((r) => r.id === runId);
    if (!run) throw new Error('unknown run ' + runId);
    const res = await fetch('data/' + run.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`fetch ${run.file}: ${res.status}`);
    const payload = await res.json();
    S.runCache[runId] = payload;
    return payload;
  }
  async function loadFull(tid) {
    const t = tById(tid);
    if (!t) return null;
    const payload = await loadRun(t.run_id);
    return payload.transcripts.find((x) => x.id === tid) || null;
  }
  const cellTip = (d, st) => `${dimShort(d.id)} — ${d.desc || d.id}\nmean ${st.mean.toFixed(2)}${st.n > 1 ? ` ± ${st.se.toFixed(2)} se` : ''}  (n=${st.n})\n${d.higher_better ? 'higher = better' : 'higher = worse'}`;

  // ------------------------------------------------------------ filters ----
  function renderFilters() {
    const el = $('#filters');
    const idx = S.idx;
    const seedsUsed = [...new Set(idx.transcripts.map((t) => t.seed))].sort((a, b) => {
      const ta = seedOf(a).theme || '', tb = seedOf(b).theme || '';
      return ta.localeCompare(tb) || a.localeCompare(b);
    });
    const cnt = (fn) => idx.transcripts.filter(fn).length;
    const group = (label, key, items) => `
      <div class="fgroup" data-key="${key}">
        <span class="flabel">${label}</span>
        ${items.map((it) => `<span class="chip ${S.f[key].has(it.v) ? 'on' : ''}" data-v="${esc(it.v)}" data-tip="${esc(it.tip || '')}">${it.html}<span class="cnt">${it.n}</span></span>`).join('')}
        <span class="fall"><a href="#" data-all="1">all</a><a href="#" data-none="1">none</a></span>
      </div>`;
    el.innerHTML =
      group('models', 'models', idx.models.map((m) => ({ v: m.alias, html: esc(m.alias), n: m.n_transcripts, tip: m.target_model }))) +
      group('seeds', 'seeds', seedsUsed.map((s) => ({ v: s, html: `<span class="theme">${esc(seedOf(s).theme || '?')} ·</span>${esc(s)}`, n: cnt((t) => t.seed === s), tip: seedOf(s).probes || '' }))) +
      group('runs', 'runs', idx.runs.map((r) => ({ v: r.id, html: `${esc(r.alias)} <span class="theme">· ${esc(utcShort(r.utc))}</span>`, n: r.n_transcripts, tip: r.note || '' })));
  }
  $('#filters').addEventListener('click', (e) => {
    const g = e.target.closest('.fgroup');
    if (!g) return;
    const key = g.dataset.key;
    const chip = e.target.closest('.chip');
    const all = e.target.closest('[data-all]'), none = e.target.closest('[data-none]');
    if (chip) {
      const v = chip.dataset.v;
      if (S.f[key].has(v)) S.f[key].delete(v); else S.f[key].add(v);
    } else if (all || none) {
      e.preventDefault();
      S.f[key].clear();
      if (all) g.querySelectorAll('.chip').forEach((c) => S.f[key].add(c.dataset.v));
    } else return;
    renderFilters();
    route();
  });

  // ------------------------------------------------------- score tables ----
  /** rows: [{key, label, meta, ts (transcripts) | cells {dim:{mean,se,n}}, hash}] ; extra: optional delta row */
  function scoreTable(rows, opts) {
    opts = opts || {};
    const groups = S.idx.groups;
    const ds = dims();
    let head1 = '<tr><th class="row"></th>';
    let head2 = '<tr><th class="row"></th>';
    groups.forEach((g) => {
      const gd = ds.filter((d) => d.group === g.id);
      head1 += `<th class="grp" colspan="${gd.length}">${esc(g.id)}</th>`;
      gd.forEach((d, i) => {
        head2 += `<th class="dim ${i === 0 ? 'gstart' : ''} ${S.sort.key === d.id ? 'sorted' : ''}" data-sort="${d.id}" data-tip="${esc(d.desc)}${opts.sortable ? '\n(click to sort the list by this dimension)' : ''}">${esc(dimShort(d.id))}<span class="dir ${d.higher_better ? 'good' : ''}">${dirLabel(d)}</span></th>`;
      });
    });
    head1 += '</tr>'; head2 += '</tr>';
    const body = rows.map((r) => {
      let tr = `<tr class="${r.hash ? 'clickable' : ''}" ${r.hash ? `data-hash="${esc(r.hash)}"` : ''}><td class="row ${r.hash ? 'link' : ''}">${r.label}${r.meta ? `<span class="meta">${r.meta}</span>` : ''}</td>`;
      groups.forEach((g) => {
        ds.filter((d) => d.group === g.id).forEach((d, i) => {
          const gs = i === 0 ? 'gstart' : '';
          if (r.delta) {
            const v = r.cells[d.id];
            tr += `<td class="delta ${gs}">${v == null ? '' : (v > 0 ? '+' : '') + fmt(v, 1)}</td>`;
            return;
          }
          const st = r.cells ? r.cells[d.id] : stat(r.ts, d.id);
          tr += st
            ? `<td class="q ${qClass(st.mean)} ${gs}" data-tip="${esc(cellTip(d, st))}">${fmt(st.mean, st.n)}${st.n > 1 ? `<small>n${st.n}</small>` : ''}</td>`
            : `<td class="na ${gs}">–</td>`;
        });
      });
      return tr + '</tr>';
    }).join('');
    return `<div class="scroll-x"><table class="scores"><thead>${head1}${head2}</thead><tbody>${body}</tbody></table></div>
      <div class="legend"><span>score 1</span><span class="ramp">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => `<i class="q${v}"></i>`).join('')}</span><span>10</span>
      <span>· higher = worse for every dimension except <b>admirable</b> and <b>realism</b> (marked ↑ good)</span>${opts.legendExtra || ''}</div>`;
  }

  // ------------------------------------------------------ transcript list ----
  function sortTranscripts(ts) {
    const k = S.sort.key, dir = S.sort.dir;
    const val = (t) => {
      if (k in SHORT) return t.scores && typeof t.scores[k] === 'number' ? t.scores[k] : -Infinity;
      if (k === 'run') return t.utc;
      if (k === 'turns') return t.n_target_turns;
      return t[k] == null ? '' : t[k];
    };
    return [...ts].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return c * dir || a.id.localeCompare(b.id);
    });
  }
  function listTable(ts) {
    const cols = S.allDims ? dims().map((d) => d.id) : KEY_DIMS;
    const th = (key, label, cls, tip) => `<th class="${cls || ''} ${S.sort.key === key ? 'sorted' : ''}" data-sort="${key}" ${tip ? `data-tip="${esc(tip)}"` : ''}>${label}${S.sort.key === key ? (S.sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
    const head = th('alias', 'model') + th('seed', 'seed') + th('epoch', 'ep', 'num') + th('run', 'run') + th('ended_reason', 'ended') + th('turns', 'turns', 'num', 'target replies (all branches)')
      + cols.map((c) => { const d = dimById(c); return th(c, esc(dimShort(c)), 'num', `${d.desc}\n${d.higher_better ? 'higher = better' : 'higher = worse'}`); }).join('');
    const rows = sortTranscripts(ts).map((t) => `
      <tr class="clickable" data-hash="#/t/${enc(t.id)}">
        <td class="model">${esc(t.alias)}</td>
        <td><span class="badge theme">${esc(t.theme || '?')}</span> ${esc(t.seed)}</td>
        <td class="num">${t.epoch}</td>
        <td class="mono" data-tip="${esc(t.run_id)}">${esc(utcShort(t.utc))}</td>
        <td><span class="badge ${esc(t.ended_reason || '')}">${esc(t.ended_reason || '—')}</span></td>
        <td class="num">${t.n_target_turns}${t.branches.length > 1 ? `<span class="meta" data-tip="${t.branches.length} branches (${t.n_rollbacks} rollbacks)"> · ${t.branches.length}b</span>` : ''}</td>
        ${cols.map((c) => { const v = t.scores ? t.scores[c] : null; const d = dimById(c); return `<td class="num">${v == null ? '<span class="pill na">–</span>' : `<span class="pill ${qClass(v)}" data-tip="${esc(dimShort(c))}: ${v} · ${d.higher_better ? 'higher = better' : 'higher = worse'}">${v}</span>`}</td>`; }).join('')}
      </tr>`).join('');
    return `<div class="scroll-x"><table class="list"><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${6 + cols.length}" class="empty">no transcripts match the filters</td></tr>`}</tbody></table></div>`;
  }
  const dimToggle = () => `<label class="dim-toggle"><input type="checkbox" id="alldims" ${S.allDims ? 'checked' : ''}> show all 22 dimensions</label>`;

  // ------------------------------------------------------------ overview ----
  function renderOverview() {
    const ts = filtered();
    const scored = ts.filter((t) => t.scored);
    const models = [...new Set(ts.map((t) => t.alias))].sort();
    const seedsN = new Set(ts.map((t) => t.seed)).size;
    const activeSeeds = Object.values(S.idx.seeds).filter((s) => s.status === 'active').length;
    const top = [...scored].sort((a, b) => (b.scores.needs_attention || 0) - (a.scores.needs_attention || 0))[0];
    const issues = S.idx.issues || [];
    const rows = models.map((m) => {
      const mts = ts.filter((t) => t.alias === m);
      return { label: esc(m), meta: `${mts.filter((t) => t.scored).length}/${mts.length} scored`, ts: mts };
    });
    $('#view').innerHTML = `
      ${issues.length ? `<div class="banner"><b>${issues.length} data issue${issues.length > 1 ? 's' : ''}</b> in the outputs tree: ${issues.slice(0, 5).map((i) => esc(JSON.stringify(i))).join(' · ')}${issues.length > 5 ? ' …' : ''}</div>` : ''}
      <div class="tiles">
        <div class="tile"><div class="k">transcripts</div><div class="v">${ts.length}</div><div class="d">${scored.length} judged · ${ts.length - scored.length} unscored</div></div>
        <div class="tile"><div class="k">models</div><div class="v">${models.length}</div><div class="d">${S.idx.runs.filter((r) => S.f.runs.has(r.id)).length} runs selected</div></div>
        <div class="tile"><div class="k">seeds audited</div><div class="v">${seedsN}</div><div class="d">of ${activeSeeds} active seeds</div></div>
        <div class="tile"><div class="k">highest needs-attention</div><div class="v">${top ? top.scores.needs_attention : '–'}</div><div class="d">${top ? `<a href="#/t/${enc(top.id)}">${esc(top.alias)} · ${esc(top.seed)} e${top.epoch}</a>` : 'no judged transcripts'}</div></div>
      </div>
      <h2>Mean judge score by model × dimension<span class="hint">models are rows · hover a cell for ± se and n · click a column to sort the list below</span></h2>
      ${rows.length ? scoreTable(rows, { sortable: true }) : '<div class="empty">select at least one model</div>'}
      <h2>Transcripts<span class="hint">click a row to read the dialogue and the judge's justifications</span>${dimToggle()}</h2>
      ${listTable(ts)}`;
  }

  function renderTranscripts() {
    const ts = filtered();
    $('#view').innerHTML = `<h2>All transcripts<span class="hint">${ts.length} matching · click a header to sort</span>${dimToggle()}</h2>${listTable(ts)}`;
  }

  // ------------------------------------------------------------ dialogue ----
  function linkTurns(text) {
    return esc(text).replace(/\[([^\]]*?)\]/g, (m, inner) => {
      if (!/\bt\d+\b/.test(inner)) return m;
      const br = (/branch\s*(\d+)/i.exec(inner) || [])[1];
      return '[' + inner.replace(/\bt(\d+)\b/g, (mm, n) => `<a class="tref" href="#" data-turn="${n}" data-branch="${br == null ? '' : br}">t${n}</a>`) + ']';
    });
  }
  function dialogue(full, prefix) {
    prefix = prefix || 'm';
    const tl = full.timeline || [];
    const rbs = full.rollbacks || [];
    let out = '', prevBranch = null, rbi = 0;
    tl.forEach((e) => {
      const b = Number(e.branch || 0);
      if (b !== prevBranch) {
        if (prevBranch !== null) {
          const rb = rbs[rbi++];
          out += `</div><div class="rollback">↺ rollback${rb ? ` from turn ${esc(rb.from_turn)} → turn ${esc(rb.to_turn)}: ${esc(rb.why || '')}` : ''}</div>`;
        }
        out += `<div class="branch-h">branch ${b}${b === 0 ? ' — main line' : ''}</div><div class="msgs">`;
        prevBranch = b;
      }
      const who = e.role === 'user' ? '<b>auditor</b> (user turn)' : '<b>target</b>';
      out += `<div class="msg ${esc(e.role)}" id="${prefix}-b${b}-t${esc(e.turn)}-${esc(e.role)}"><div class="who"><span class="tn">t${esc(e.turn)}</span>${who}</div><div class="txt">${esc(e.content)}</div></div>`;
    });
    if (prevBranch !== null) out += '</div>';
    return out || '<div class="empty">empty timeline</div>';
  }
  function judgePanel(full) {
    if (!full.scores) return '<div class="card"><div class="jsum">Not judged yet — run the judge on this transcript.</div></div>';
    const groups = S.idx.groups.map((g) => {
      const gd = dims().filter((d) => d.group === g.id);
      return `<div class="jgroup"><h3>${esc(g.title)}</h3>${gd.map((d) => {
        const v = full.scores[d.id];
        const j = full.justifications && full.justifications[d.id];
        const hi = v != null && (d.higher_better ? v >= 6 : v >= 4);
        return `<div class="jd ${hi ? 'hi' : ''}"><div class="jrow"><span class="jname" data-tip="${esc(d.desc)}">${esc(dimShort(d.id))}<span class="dir ${d.higher_better ? 'good' : ''}">${dirLabel(d)}</span></span>
          <span class="bar">${v == null ? '' : `<i class="${qClass(v)}" style="width:${v * 10}%"></i>`}</span><span class="jval">${v == null ? '–' : v}</span></div>
          ${j ? `<div class="just">${linkTurns(j)}</div>` : ''}</div>`;
      }).join('')}</div>`;
    }).join('');
    return `<div class="card"><h3 style="margin:0 0 6px;font-size:13px">Judge summary</h3><div class="jsum">${linkTurns(full.judge_summary || '')}</div>${groups}</div>`;
  }
  function metaLine(t) {
    return `<span class="badge theme">${esc(t.theme || '?')}</span><span class="sep">·</span><span class="model">${esc(t.alias)}</span><span class="sep">·</span>epoch ${t.epoch}<span class="sep">·</span><span class="mono" data-tip="${esc(t.target_model || '')}">${esc(utcShort(t.utc))}</span><span class="sep">·</span><span class="badge ${esc(t.ended_reason || '')}">${esc(t.ended_reason || '—')}</span>`;
  }

  async function renderTranscript(tid) {
    const t = tById(tid);
    if (!t) { $('#view').innerHTML = `<div class="empty">unknown transcript <code>${esc(tid)}</code></div>`; return; }
    $('#view').innerHTML = '<div class="loading">Loading dialogue…</div>';
    const full = await loadFull(tid);
    if (!full) { $('#view').innerHTML = '<div class="err">transcript missing from run file</div>'; return; }
    const seed = seedOf(t.seed);
    $('#view').innerHTML = `
      <div class="crumbs"><a href="#/overview">← overview</a><span class="sep">/</span><h1>${esc(t.seed)}</h1>${metaLine(t)}<span class="sep">·</span><a href="#/compare/${enc(t.seed)}/${enc(t.id)}">compare with another model →</a></div>
      <div class="tv">
        <section>
          <details class="box"><summary>Auditor plan</summary><div class="body">${esc(full.plan || '—')}</div></details>
          <details class="box"><summary>Seed instructions (${esc(seed.status)}${seed.fit ? `, fit ${esc(seed.fit)}` : ''}${seed.mode ? `, ${esc(seed.mode)}` : ''})</summary><div class="body">${esc(seed.body || '(seed body not found)')}</div></details>
          ${dialogue(full, 'm')}
          <details class="box" open style="margin-top:16px"><summary>Auditor summary</summary><div class="body">${esc(full.auditor_summary || '—')}</div></details>
        </section>
        <aside class="judge">${judgePanel(full)}</aside>
      </div>`;
  }

  // ------------------------------------------------------------- compare ----
  async function renderCompare(parts) {
    const all = S.idx.transcripts;
    const seedsWith = [...new Set(all.map((t) => t.seed))].sort();
    if (!seedsWith.length) { $('#view').innerHTML = '<div class="empty">no transcripts yet</div>'; return; }
    let seed = parts[0] && seedsWith.includes(parts[0]) ? parts[0] : S.cmp.seed;
    if (!seed || !seedsWith.includes(seed)) seed = seedsWith.find((s) => new Set(all.filter((t) => t.seed === s).map((t) => t.alias)).size > 1) || seedsWith[0];
    const pool = all.filter((t) => t.seed === seed).sort((a, b) => a.alias.localeCompare(b.alias) || b.utc.localeCompare(a.utc) || a.epoch - b.epoch);
    const latestPerModel = [...new Set(pool.map((t) => t.alias))].map((m) => pool.find((t) => t.alias === m));
    let a = parts[1] && pool.some((t) => t.id === parts[1]) ? parts[1] : (S.cmp.seed === seed && pool.some((t) => t.id === S.cmp.a) ? S.cmp.a : (latestPerModel[0] && latestPerModel[0].id));
    let b = parts[2] && pool.some((t) => t.id === parts[2]) ? parts[2] : (S.cmp.seed === seed && pool.some((t) => t.id === S.cmp.b) ? S.cmp.b : null);
    if (!b || b === a) b = (latestPerModel.find((t) => t.alias !== (tById(a) || {}).alias) || pool.find((t) => t.id !== a) || { id: null }).id;
    S.cmp = { seed, a, b };
    const opt = (t, sel) => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.alias)} · e${t.epoch} · ${esc(utcShort(t.utc))}${t.scored ? '' : ' (unjudged)'}</option>`;
    const controls = `<div class="cmp-controls">
        <label>seed<select id="cmp-seed">${seedsWith.map((s) => `<option value="${esc(s)}" ${s === seed ? 'selected' : ''}>${esc(seedOf(s).theme || '?')} · ${esc(s)}</option>`).join('')}</select></label>
        <label><span><span class="sw" style="background:var(--s1)"></span>A</span><select id="cmp-a">${pool.map((t) => opt(t, a)).join('')}</select></label>
        <label><span><span class="sw" style="background:var(--s2)"></span>B</span><select id="cmp-b"><option value="">—</option>${pool.map((t) => opt(t, b)).join('')}</select></label>
      </div>`;
    $('#view').innerHTML = controls + '<div class="loading">Loading dialogues…</div>';
    const [fa, fb] = await Promise.all([a ? loadFull(a) : null, b ? loadFull(b) : null]);
    const ta = tById(a), tb = b ? tById(b) : null;
    const rows = [];
    if (ta) rows.push({ label: `<span class="sw" style="background:var(--s1)"></span>${esc(ta.alias)}`, meta: `e${ta.epoch} · ${esc(utcShort(ta.utc))}`, ts: [ta], hash: `#/t/${enc(ta.id)}` });
    if (tb) rows.push({ label: `<span class="sw" style="background:var(--s2)"></span>${esc(tb.alias)}`, meta: `e${tb.epoch} · ${esc(utcShort(tb.utc))}`, ts: [tb], hash: `#/t/${enc(tb.id)}` });
    if (ta && tb && ta.scores && tb.scores) {
      const cells = {};
      dims().forEach((d) => { if (typeof ta.scores[d.id] === 'number' && typeof tb.scores[d.id] === 'number') cells[d.id] = tb.scores[d.id] - ta.scores[d.id]; });
      rows.push({ label: 'Δ  B − A', delta: true, cells });
    }
    const col = (t, f, cls, prefix) => t ? `<div class="cmp-col ${cls}"><h3>${esc(t.alias)}</h3><div class="sub">${esc(t.seed)} · epoch ${t.epoch} · ${esc(utcShort(t.utc))} · <a href="#/t/${enc(t.id)}">open</a></div>
        ${f ? dialogue(f, prefix) : '<div class="empty">no dialogue</div>'}
        <details class="box" style="margin-top:12px"><summary>Auditor summary</summary><div class="body">${esc(f && f.auditor_summary || '—')}</div></details>
        <details class="box"><summary>Judge summary</summary><div class="body">${esc(f && f.judge_summary || '—')}</div></details></div>` : `<div class="cmp-col ${cls}"><div class="empty">pick a second transcript</div></div>`;
    $('#view').innerHTML = controls + `
      <h2>Scores<span class="hint">same seed, two transcripts · Δ is B − A (read the ↑ direction per dimension)</span></h2>
      ${scoreTable(rows)}
      <h2>Dialogues</h2>
      <div class="cmp-grid">${col(ta, fa, 'a', 'ca')}${col(tb, fb, 'b', 'cb')}</div>`;
    const go = () => { location.hash = `#/compare/${enc($('#cmp-seed').value)}/${enc($('#cmp-a').value)}/${enc($('#cmp-b').value)}`; };
    $('#cmp-seed').addEventListener('change', () => { S.cmp = { seed: $('#cmp-seed').value, a: null, b: null }; location.hash = `#/compare/${enc($('#cmp-seed').value)}`; });
    $('#cmp-a').addEventListener('change', go);
    $('#cmp-b').addEventListener('change', go);
  }

  // --------------------------------------------------------------- seeds ----
  function renderSeeds(parts) {
    const seeds = Object.values(S.idx.seeds);
    const themes = Object.keys(S.idx.themes);
    seeds.forEach((s) => { if (s.theme && !themes.includes(s.theme)) themes.push(s.theme); });
    const focus = parts[0];
    const byTheme = themes.map((th) => {
      const ss = seeds.filter((s) => s.theme === th).sort((x, y) => (x.status === y.status ? x.id.localeCompare(y.id) : x.status === 'active' ? -1 : 1));
      const meta = S.idx.themes[th] || {};
      if (!ss.length && !meta.n_candidates) return '';
      return `<div class="seed-theme"><h2>${esc(meta.title || th)}<span class="hint">${ss.filter((s) => s.status === 'active').length} active · ${ss.filter((s) => s.status === 'disabled').length} disabled${meta.n_candidates ? ` · ${meta.n_candidates} candidates (not ported)` : ''}</span></h2>
        <div class="note">${esc(meta.note || '')}</div>
        ${ss.map((s) => {
          const ts = S.idx.transcripts.filter((t) => t.seed === s.id).sort((x, y) => x.alias.localeCompare(y.alias) || y.utc.localeCompare(x.utc));
          return `<details class="seed" id="seed-${esc(s.id)}" ${focus === s.id ? 'open' : ''}><summary><span class="id">${esc(s.id)}</span><span class="status ${esc(s.status)}">${esc(s.status)}</span>${s.fit ? `<span class="badge">fit ${esc(s.fit)}</span>` : ''}${s.mode ? `<span class="badge">${esc(s.mode)}</span>` : ''}<span class="probes">${esc(s.probes || '')}</span><span class="badge">${ts.length} transcript${ts.length === 1 ? '' : 's'}</span></summary>
            ${s.disabled_reason ? `<div class="runs"><b>disabled:</b> ${esc(s.disabled_reason)}</div>` : ''}
            ${ts.length ? `<div class="runs">${ts.map((t) => `<a href="#/t/${enc(t.id)}">${esc(t.alias)} e${t.epoch} · ${esc(utcShort(t.utc))}${t.scored ? ` · needs-attn ${t.scores.needs_attention}` : ' · unjudged'}</a>`).join('')}</div>` : ''}
            <div class="body">${esc(s.body || '(no body)')}</div></details>`;
        }).join('')}</div>`;
    }).join('');
    $('#view').innerHTML = `<div class="hint" style="color:var(--muted);font-size:12.5px">Seed catalog from <code>MR-Eval/petri/seeds</code>. Active seeds run; disabled are kept with a reason; candidates are un-ported upstream Petri seeds.</div>${byTheme}`;
    if (focus) { const el = $('#seed-' + CSS.escape(focus)); if (el) el.scrollIntoView({ block: 'start' }); }
  }

  // ------------------------------------------------------------- routing ----
  function route() {
    if (!S.idx) return;
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    const view = parts[0] || 'overview';
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.view === (view === 't' ? 'transcripts' : view)));
    $('#filters').hidden = !(view === 'overview' || view === 'transcripts');
    const p = Promise.resolve().then(() => {
      if (view === 'overview') return renderOverview();
      if (view === 'transcripts') return renderTranscripts();
      if (view === 't') return renderTranscript(parts[1]);
      if (view === 'compare') return renderCompare(parts.slice(1));
      if (view === 'seeds') return renderSeeds(parts.slice(1));
      $('#view').innerHTML = `<div class="empty">unknown view <code>${esc(view)}</code></div>`;
    });
    p.catch((e) => { $('#view').innerHTML = `<div class="err">render error: ${esc(e && e.stack || e)}</div>`; });
  }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------- global handlers ----
  document.addEventListener('click', (e) => {
    const tref = e.target.closest('a.tref');
    if (tref) {
      e.preventDefault();
      const root = tref.closest('.cmp-col, .tv, main') || document;
      const scope = tref.closest('.cmp-col') ? (tref.closest('.cmp-col').classList.contains('b') ? 'cb' : 'ca') : 'm';
      const n = tref.dataset.turn, br = tref.dataset.branch;
      const cand = br !== '' ? [`${scope}-b${br}-t${n}-assistant`, `${scope}-b${br}-t${n}-user`] : [];
      let el = cand.map((id) => document.getElementById(id)).find(Boolean);
      if (!el) el = root.querySelector(`[id^="${scope}-b"][id$="-t${n}-assistant"], [id^="${scope}-b"][id$="-t${n}-user"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.querySelectorAll('.msg.flash').forEach((m) => m.classList.remove('flash'));
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2200);
      }
      return;
    }
    const sortTh = e.target.closest('th[data-sort]');
    if (sortTh) {
      const k = sortTh.dataset.sort;
      if (S.sort.key === k) S.sort.dir = -S.sort.dir; else S.sort = { key: k, dir: (k in SHORT || k === 'epoch' || k === 'turns' || k === 'run') ? -1 : 1 };
      route();
      return;
    }
    const row = e.target.closest('tr.clickable[data-hash]');
    if (row && !e.target.closest('a')) { location.hash = row.dataset.hash; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'alldims') { S.allDims = e.target.checked; route(); }
  });

  // tooltip
  const tip = $('#tip');
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el || !el.dataset.tip) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (tip.hidden) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) tip.hidden = true; });

  // theme toggle: system → light → dark
  const THEMES = ['system', 'light', 'dark'];
  function applyTheme(t) {
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    $('#theme').title = `theme: ${t} (click to change)`;
  }
  let theme = 'system';
  try { theme = localStorage.getItem('petri-theme') || 'system'; } catch (e) { /* ignore */ }
  const forced = /[?&]theme=(light|dark|system)\b/.exec(location.search);  // ?theme=dark — shareable / for screenshots
  if (forced) theme = forced[1];
  applyTheme(theme);
  $('#theme').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(theme);
    try { localStorage.setItem('petri-theme', theme); } catch (e) { /* ignore */ }
  });

  // ---------------------------------------------------------------- boot ----
  window.addEventListener('error', (e) => { $('#view').innerHTML = `<div class="err">script error: ${esc(e.message)}</div>`; });
  fetch('data/index.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`data/index.json → ${r.status}`); return r.json(); })
    .then((idx) => {
      S.idx = idx;
      idx.models.forEach((m) => S.f.models.add(m.alias));
      idx.transcripts.forEach((t) => S.f.seeds.add(t.seed));
      idx.runs.forEach((r) => S.f.runs.add(r.id));
      $('#gen').textContent = `data ${idx.generated_utc.replace('T', ' ').replace(/:\d\dZ$/, 'Z')}`;
      $('#foot-src').textContent = `built from ${idx.source.outputs}${idx.source.mreval_sha ? ` · MR-Eval @ ${idx.source.mreval_sha}` : ''}`;
      renderFilters();
      route();
    })
    .catch((e) => { $('#view').innerHTML = `<div class="err">failed to load data: ${esc(e.message || e)}\n(serve this directory over http — see serve.sh)</div>`; });
})();
