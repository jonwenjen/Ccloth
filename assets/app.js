/* Ccloth 網站：只讀 data/ 與 config/ 的 JSON，清單與「已淘汰」存在這支手機的瀏覽器裡。 */
(() => {
  'use strict';

  const REPO = 'jonwenjen/Ccloth';
  const LS_LIST = 'ccloth.wishlist.v1';
  const LS_RETIRED = 'ccloth.retired.v1';
  const CAT = { tee: 'T 恤', knit: '針織', shirt: '襯衫', outer: '外套', pants: '長褲' };
  const EXPERT_ORDER = ['material', 'fit', 'build', 'care', 'function'];
  const VERDICT_CLASS = { ok: 'lvok', styling: 'lv1', check: 'lv1', return: 'lv3' };

  const S = { rules: null, brands: {}, report: null, orders: { items: [] }, repoList: { items: [] },
              list: [], retired: new Set(), filter: { cat: 'all', brand: 'all', budget: false, gaps: false },
              band: null, todayBand: null, orderFilter: 'all' };

  // ---------------------------------------------------------------- 小工具
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));
  const fmt = (n) => (n == null ? '—' : String(Math.round(n * 10) / 10));
  const fmt2 = (n) => (n == null ? '—' : Number(n).toFixed(2));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const toast = (msg) => {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysTo = (iso) => (iso ? Math.round((new Date(iso + 'T00:00:00') - today()) / 864e5) : null);
  const brandName = (id) => (S.brands[id] ? S.brands[id].name : id);
  const slotLabel = (id) => (S.rules.capsule_slots.find((s) => s.id === id) || {}).label || '未分類';
  const activeOrders = () => S.orders.items.filter((o) => !['cancelled', 'refunded'].includes(o.status) && !o.retired && !S.retired.has(o.id));

  async function getJSON(path, fallback) {
    try { const r = await fetch(path, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch { return fallback; }
  }

  // ---------------------------------------------------------------- 載入
  async function init() {
    const [rules, brands, report, orders, repoList] = await Promise.all([
      getJSON('config/rules.json'), getJSON('config/brands.json', { brands: [] }), getJSON('data/report.json'),
      getJSON('data/orders.json', { items: [] }), getJSON('data/wishlist.json', { items: [] }),
    ]);
    if (!rules || !report) {
      $('#summary').textContent = '讀不到資料檔（data/report.json 或 config/rules.json）。請確認 GitHub Pages 已發布最新版本。';
      return;
    }
    S.rules = rules; S.report = report; S.orders = orders; S.repoList = repoList;
    brands.brands.forEach((b) => { S.brands[b.id] = b; });
    S.list = store.get(LS_LIST, []);
    S.retired = new Set(store.get(LS_RETIRED, []));
    S.band = 't20';
    renderHead();
    bindTabs();
    renderAll();
    loadWeather();
  }

  function renderAll() {
    renderPicks(); renderDeals(); renderOutfits(); renderWardrobe(); renderList(); renderOrders();
    renderTrends(); renderBrands(); renderMethod(); updateCount();
  }

  function renderHead() {
    const [y, m] = S.report.month.split('-');
    $('#month-title').textContent = `${y} 年 ${Number(m)} 月選物`;
    document.title = `Ccloth ${y}-${m}`;
    $('#summary').textContent = S.report.summary || '';
    const c = S.report.counts || {};
    $('#foot-meta').textContent = `${S.report.month} 月報：候選 ${c.candidates} 件、入選 ${c.picked} 件、剔除 ${c.excluded} 件。產生時間 ${S.report.generated_at || ''}，模型 ${S.report.model || ''}，規則版本 ${S.rules.version}。`;
  }

  async function loadWeather() {
    const { lat, lon } = S.rules.profile.city_coords || {};
    if (lat == null) return;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FTaipei&forecast_days=1`);
      const j = await r.json();
      const t = j.current.temperature_2m;
      const band = S.rules.temperature_bands.find((b) => t >= b.min && t < b.max) || S.rules.temperature_bands[0];
      S.todayBand = band.id; S.band = band.id;
      const w = $('#weather');
      w.innerHTML = `${esc(S.rules.profile.city)}現在 <b>${fmt(t)}°C</b>（今天 ${fmt(j.daily.temperature_2m_min[0])}–${fmt(j.daily.temperature_2m_max[0])}°C），適用「${esc(band.label)}」穿搭。`;
      w.hidden = false;
      renderOutfits();
    } catch { /* 天氣抓不到就不顯示 */ }
  }

  // ---------------------------------------------------------------- 分頁
  function bindTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const show = (name, push) => {
      if (!document.getElementById('tab-' + name)) name = 'picks';
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
      if (push) history.replaceState(null, '', '#' + name);
      const btn = tabs.find((t) => t.dataset.tab === name);
      if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    tabs.forEach((t) => t.addEventListener('click', () => { show(t.dataset.tab, true); window.scrollTo({ top: $('.tabs').offsetTop }); }));
    window.addEventListener('hashchange', () => show(location.hash.slice(1), false));
    show(location.hash.slice(1) || 'picks', false);
  }

  // ---------------------------------------------------------------- 清單（本機）
  const inList = (id) => S.list.some((x) => x.id === id);
  function toggleList(it) {
    if (inList(it.id)) {
      S.list = S.list.filter((x) => x.id !== it.id);
      toast(`已從清單移除：${it.name}`);
    } else {
      S.list.push({ id: it.id, brand: it.brand, name: it.name, url: it.url, category: it.category, slot: it.slot,
                    size: it.size && it.size.final, price_at_add: it.budget && it.budget.price_twd,
                    temps: it.temps, added: new Date().toISOString().slice(0, 10) });
      toast(`已加入清單：${it.name}`);
    }
    if (!store.set(LS_LIST, S.list)) toast('這個瀏覽器不能儲存清單，請改用「複製 JSON」。');
    renderPicks(); renderList(); renderWardrobe(); renderOutfits(); updateCount();
  }
  function updateCount() { $('#list-count').textContent = S.list.length ? String(S.list.length) : ''; }

  // ---------------------------------------------------------------- 選物
  function gapSlots() {
    const owned = new Set(activeOrders().map((o) => o.slot));
    S.list.forEach((x) => owned.add(x.slot));
    return new Set(S.rules.capsule_slots.map((s) => s.id).filter((id) => !owned.has(id)));
  }

  function renderPicks() {
    const f = S.filter;
    const brandsInReport = [...new Set(S.report.items.map((i) => i.brand))];
    const cats = ['all', ...Object.keys(CAT)];
    $('#pick-filters').innerHTML = `
      ${cats.map((c) => `<button class="chip" data-cat="${c}" aria-pressed="${f.cat === c}">${c === 'all' ? '全部' : CAT[c]}</button>`).join('')}
      <select id="brand-filter" aria-label="品牌">
        <option value="all">全部品牌</option>
        ${brandsInReport.map((b) => `<option value="${esc(b)}" ${f.brand === b ? 'selected' : ''}>${esc(brandName(b))}</option>`).join('')}
      </select>
      <button class="chip" data-toggle="budget" aria-pressed="${f.budget}">只看預算內</button>
      <button class="chip" data-toggle="gaps" aria-pressed="${f.gaps}">只看衣櫥缺口</button>`;
    $('#pick-filters').querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { f.cat = b.dataset.cat; renderPicks(); });
    $('#pick-filters').querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => { f[b.dataset.toggle] = !f[b.dataset.toggle]; renderPicks(); });
    $('#brand-filter').onchange = (e) => { f.brand = e.target.value; renderPicks(); };

    const gaps = gapSlots();
    const items = S.report.items.filter((it) =>
      (f.cat === 'all' || it.category === f.cat) && (f.brand === 'all' || it.brand === f.brand) &&
      (!f.budget || !it.budget.over_pct) && (!f.gaps || gaps.has(it.slot)));
    const list = $('#pick-list');
    list.innerHTML = items.length ? items.map(itemCard).join('') : '<li class="empty">沒有符合條件的單品，換個篩選試試。</li>';
    list.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => toggleList(S.report.items.find((i) => i.id === b.dataset.add)));

    const ex = S.report.excluded || [];
    $('#excluded').innerHTML = ex.length ? `<summary>剔除 ${ex.length} 件（嚴重提醒、缺貨或女裝）</summary><ul>${ex.map((e) =>
      `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(brandName(e.brand))}｜${esc(e.name)}</a>：${e.reasons.map(esc).join('；')}</li>`).join('')}</ul>` : '';
  }

  function pips(score) {
    let h = '';
    for (let i = 1; i <= 5; i++) h += `<i class="${score >= i ? 'on' : score >= i - 0.5 ? 'half' : ''}"></i>`;
    return `<span class="pips" aria-label="${score} 分">${h} ${fmt(score)}</span>`;
  }

  function tapeRows(it) {
    const chart = it.size_chart || {};
    const m = chart[it.size.final];
    const ranges = S.rules.fit_ranges[it.category] || {};
    const labels = S.rules.measurement_labels;
    if (!m) return '';
    const rows = Object.entries(ranges).filter(([d]) => m[d] != null).map(([d, [lo, hi]]) => {
      const v = m[d]; const min = Math.min(lo - 10, v - 2); const max = Math.max(hi + 10, v + 2); const span = max - min;
      const pct = (x) => ((x - min) / span) * 100;
      const off = v < lo || v > hi;
      const diff = v < lo ? `少 ${fmt(lo - v)}` : v > hi ? `多 ${fmt(v - hi)}` : '範圍內';
      return `<div class="tape-row" title="${esc(labels[d] || d)} ${fmt(v)}cm，範圍 ${fmt(lo)}–${fmt(hi)}，${diff}">
        <span class="dim">${esc(labels[d] || d)}</span>
        <span class="track" aria-hidden="true"><span class="band" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></span><span class="mark" style="left:${pct(v)}%"></span></span>
        <span class="val ${off ? 'off' : ''}">${fmt(v)}</span></div>`;
    });
    if (!rows.length) return '';
    return `<div class="tape">${rows.join('')}<p class="tape-note">黃色是你的範圍、黑線是 ${esc(it.size.final)} 號的平量（cm）。</p></div>`;
  }

  function itemCard(it) {
    const b = it.budget || {};
    const p = it.price || {};
    const moved = it.prev_rank ? (it.prev_rank === it.rank ? '同上月' : `上月 #${it.prev_rank}`) : '新上榜';
    const label = it.label && it.label !== brandName(it.brand) ? `${esc(brandName(it.brand))}｜${esc(it.label)}` : esc(brandName(it.brand));
    const alerts = (it.alerts || []).map((a) => `<li class="alert lv${a.level}"><b>${esc(a.level_name)}</b>${esc(a.label)}：${esc(a.detail)}</li>`).join('');
    const added = inList(it.id);
    return `<li class="tag" id="item-${esc(it.id)}">
      <div class="tag-head">
        <div class="rank">${it.rank}<small>${esc(moved)}</small></div>
        <div>
          <p class="who">${label}｜${esc(CAT[it.category])}</p>
          <h3><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a></h3>
          <p><span class="price">NT$${num(p.sale)}${p.original && p.original !== p.sale ? `<s>${num(p.original)}</s>` : ''}</span>
             <span class="budget ${b.over_pct ? 'over' : ''}">${esc(b.status || '')}</span></p>
          <p class="score">綜合 ${fmt2(it.overall)}　排序分 ${fmt2(it.rank_score)}</p>
        </div>
        <div class="label" title="建議尺寸"><b>${esc(it.size.final || '?')}</b><span>建議尺寸</span></div>
      </div>
      ${alerts ? `<ul class="alerts">${alerts}</ul>` : '<ul class="alerts"><li class="alert lvok">沒有提醒</li></ul>'}
      ${tapeRows(it)}
      <p class="block">${esc(it.summary || '')}</p>
      <div class="tag-actions">
        <button class="btn ${added ? '' : 'ghost'}" data-add="${esc(it.id)}" aria-pressed="${added}">${added ? '已在清單' : '＋ 加入清單'}</button>
        <a class="btn ghost" href="${esc(it.url)}" target="_blank" rel="noopener">官網</a>
        <a class="btn ghost" href="${esc(it.reviews_url || it.url)}" target="_blank" rel="noopener">全部評論</a>
      </div>
      <details class="more"><summary>評分、尺寸、排雷、價格</summary>${itemDetails(it)}</details>
    </li>`;
  }

  function itemDetails(it) {
    const ex = it.experts || {};
    const experts = EXPERT_ORDER.map((k) => ex[k] ? `<li class="expert"><span class="nm">${esc(S.rules.experts[k].label)}</span>${pips(ex[k].score)}<p>${esc(ex[k].comment)}</p></li>` : '').join('');
    const w = S.rules.item_weights;
    const rv = it.review_stats || {};
    const sz = it.size;
    const votes = Object.entries(sz.b.votes || {}).map(([s, n]) => `${esc(s)} ${n} 人`).join('、') || '無';
    const r = sz.b.reactions || {};
    const chart = it.size_chart || {};
    const dims = [...new Set(Object.values(chart).flatMap((m) => Object.keys(m)))];
    const labels = S.rules.measurement_labels;
    const chartTable = Object.keys(chart).length ? `<div class="table-wrap"><table class="mini-table"><thead><tr><th>尺寸</th>${dims.map((d) => `<th>${esc(labels[d] || d)}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(chart).map(([s, m]) => `<tr class="${s === sz.final ? 'pick' : ''}"><td>${esc(s)}</td>${dims.map((d) => `<td class="num">${fmt(m[d])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const f = it.fabric || {};
    const p = it.price || {};
    const notes = Object.entries(it.features || {}).filter(([k, v]) => k.endsWith('_note') && v).map(([, v]) => `<li>${esc(v)}</li>`).join('');
    const pct = (v) => (v == null ? '—' : `${fmt(v)}%`);
    return `
      <div class="block"><h4>專家評分（綜合 ${fmt2(it.overall)}，五項平均 ${fmt2(it.avg5)}）</h4><ul class="experts">${experts}</ul>
        <p class="tape-note">權重：材質 ${w.material * 100}%、版型 ${w.fit * 100}%、車工 ${w.build * 100}%、保養 ${w.care * 100}%、機能 ${w.function * 100}%。扣分 ${fmt(it.penalty)}。</p></div>
      <div class="block"><h4>搭配建議</h4><p>${esc(it.pairing || '—')}</p></div>
      <div class="block"><h4>尺寸建議</h4>
        <dl class="kv"><dt>A｜尺寸表</dt><dd>${esc(sz.a.reason)}</dd>
        <dt>B｜同身形評論</dt><dd>${sz.b.n} 則（173–177cm／73–77kg）。穿：${votes}。反應：偏大 ${r.big || 0}、正常 ${r.normal || 0}、偏小 ${r.small || 0}</dd>
        <dt>最終建議</dt><dd><b>${esc(sz.final || '—')}</b>　${esc(sz.final_reason)}</dd></dl>
        ${chartTable}${it.size_note ? `<p class="tape-note">${esc(it.size_note)}</p>` : ''}${it.model ? `<p class="tape-note">模特兒：${esc(it.model)}</p>` : ''}</div>
      <div class="block"><h4>排雷數據</h4>
        <dl class="kv"><dt>評論</dt><dd>抓 ${rv.fetched || 0} 則（站上共 ${rv.total_on_site ?? '—'} 則），同身形 ${rv.body_matched || 0} 則</dd>
        <dt>縮水／毛球／領口</dt><dd>全部 ${pct(rv.defect_pct)}，同身形 ${pct(rv.body_defect_pct)}</dd>
        <dt>貼身顯肚</dt><dd>${pct(rv.tight_pct)}</dd><dt>薄透</dt><dd>${pct(rv.sheer_pct)}</dd>
        <dt>厚度標示</dt><dd>${esc(f.thickness || '未標示')}</dd><dt>資料來源</dt><dd>${esc(rv.source || '—')}</dd></dl></div>
      <div class="block"><h4>價格</h4>
        <dl class="kv"><dt>售價</dt><dd>NT$${num(p.sale)}${p.original && p.original !== p.sale ? `（原價 NT$${num(p.original)}）` : ''}</dd>
        <dt>預算</dt><dd>上限 NT$${num(it.budget.limit)}，${esc(it.budget.status)}</dd>
        ${it.premium_pct != null ? `<dt>代購溢價</dt><dd>${fmt(it.premium_pct)}%</dd>` : ''}
        ${it.budget_reason ? `<dt>加價理由</dt><dd>${esc(it.budget_reason)}</dd>` : ''}</dl></div>
      <div class="block"><h4>材質與保養</h4>
        <dl class="kv"><dt>成分</dt><dd>${esc(f.composition || '未標示')}</dd><dt>產地</dt><dd>${esc(f.origin || '未標示')}</dd>
        <dt>洗滌</dt><dd>${esc(f.care || '未標示')}</dd><dt>適穿溫度</dt><dd>${it.temps ? `${it.temps[0]}–${it.temps[1]}°C` : '—'}</dd>
        <dt>衣櫥格</dt><dd>${esc(slotLabel(it.slot))}</dd><dt>顏色</dt><dd>${esc((it.colors || []).join('、'))}</dd></dl>
        ${notes ? `<ul>${notes}</ul>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- 折扣
  function renderDeals() {
    const d = S.report.discounts || { events: [], coupons: [] };
    const ev = [...(d.events || [])].sort((a, b) => (a.end || a.start || '9') < (b.end || b.start || '9') ? -1 : 1);
    const row = (e) => {
      const start = daysTo(e.start); const end = daysTo(e.end);
      let when = '進行中';
      if (start != null && start > 0) when = `${start} 天後開始`;
      else if (end != null && end >= 0) when = end === 0 ? '今天結束' : `還有 ${end} 天`;
      else if (end != null && end < 0) when = '已結束';
      const soon = start != null && start > 0 && start <= S.rules.sales_reminders.push_within_days;
      return `<li class="row"><p class="when">${esc(when)}</p><h3>${esc(e.name)}</h3>
        <p class="meta">${esc(e.brand)}${e.start ? `｜${esc(e.start)} 起` : ''}${e.end ? `｜到 ${esc(e.end)}` : ''}${e.calendar ? '｜已建日曆提醒' : ''}${soon ? '｜7 天內開跑' : ''}</p>
        <p>${esc(e.detail)}</p>${e.source && e.source.startsWith('http') ? `<p class="meta"><a href="${esc(e.source)}" target="_blank" rel="noopener">來源</a></p>` : ''}</li>`;
    };
    $('#tab-deals').innerHTML = `<h2>折扣檔期</h2>
      <p class="lead">45 天內的大檔會建 Google 日曆提醒，7 天內開跑會在月報推播裡提醒。更新於 ${esc(d.updated || S.report.month)}。</p>
      <ul class="rows">${ev.map(row).join('') || '<li class="empty">這期沒有整理到檔期。</li>'}</ul>
      <h3 class="section-h">折價券與會員優惠</h3>
      <ul class="rows">${(d.coupons || []).map((c) => `<li class="row"><h3>${esc(c.brand)}</h3><p>${esc(c.detail)}</p><p class="meta">${esc(c.source || '')}</p></li>`).join('') || '<li class="empty">目前沒有折價券。</li>'}</ul>`;
  }

  // ---------------------------------------------------------------- 穿搭
  function wardrobePool() {
    const reportById = Object.fromEntries(S.report.items.map((i) => [i.id, i]));
    const owned = activeOrders().filter((o) => o.slot).map((o) => ({ id: o.id, name: `${o.brand} ${o.name}${o.color ? '（' + o.color + '）' : ''}`, slot: o.slot, temps: o.temps, src: '已購' }));
    const listed = S.list.map((x) => {
      const it = reportById[x.id] || x;
      return { id: x.id, name: `${brandName(x.brand)} ${x.name}`, slot: it.slot, temps: it.temps, src: '清單' };
    }).filter((x) => x.slot);
    return [...owned, ...listed];
  }

  function autoOutfits(band) {
    const pool = wardrobePool().filter((x) => !x.temps || (x.temps[0] < band.max && x.temps[1] > band.min));
    const by = (pred) => pool.filter((x) => pred(x.slot));
    const inner = by((s) => s.startsWith('tee'));
    const shirts = by((s) => s.startsWith('shirt'));
    const knits = by((s) => s === 'knit');
    const outers = by((s) => s.startsWith('outer'));
    const bottoms = by((s) => s.startsWith('pants'));
    const layers = { t28: [inner], t24: [inner.concat(shirts)], t20: [inner, shirts], t16: [inner.concat(knits), outers.concat(knits)], tcold: [knits.concat(inner), outers] }[band.id] || [inner];
    if (!bottoms.length || layers.some((l) => !l.length)) return [];
    const out = [];
    for (let i = 0; i < 3; i++) {
      const pieces = layers.map((l, k) => l[(i + k) % l.length]);
      const pants = bottoms[i % bottoms.length];
      const all = [...pieces, pants];
      if (new Set(all.map((x) => x.id)).size !== all.length) continue;
      const key = all.map((x) => x.id).join('|');
      if (!out.some((o) => o.key === key)) out.push({ key, pieces: all });
    }
    return out;
  }

  function renderOutfits() {
    const bands = S.rules.temperature_bands;
    const band = bands.find((b) => b.id === S.band) || bands[2];
    const expert = ((S.report.outfits || {}).bands || {})[band.id] || [];
    const auto = autoOutfits(band);
    $('#tab-outfits').innerHTML = `<h2>依溫度穿搭（${esc(S.rules.profile.city)}）</h2>
      <div class="bands" role="group" aria-label="溫度帶">${bands.map((b) => `<button class="chip ${b.id === S.todayBand ? 'today' : ''}" data-band="${b.id}" aria-pressed="${b.id === band.id}">${esc(b.label)}${b.id === S.todayBand ? '（今天）' : ''}</button>`).join('')}</div>
      <p class="base"><b>基本層次：</b>${esc(band.base)}</p>
      <h3 class="section-h">專家搭配</h3>
      ${expert.map((o) => `<div class="outfit"><h3>${esc(o.title)}</h3><ol>${o.pieces.map((p) => `<li>${esc(p)}</li>`).join('')}</ol><p class="note">${esc(o.note)}</p></div>`).join('') || '<p class="empty">這期沒有這個溫度帶的專家搭配。</p>'}
      <h3 class="section-h">自動配（已購＋清單）</h3>
      ${auto.map((o, i) => `<div class="outfit"><h3>組合 ${i + 1}</h3><ol>${o.pieces.map((p) => `<li>${esc(p.name)}<span class="meta">　${esc(p.src)}｜${esc(slotLabel(p.slot))}</span></li>`).join('')}</ol></div>`).join('') ||
        '<p class="empty">已購與清單裡還湊不出這個溫度的完整組合。到「選物」加幾件到清單，這裡會自動更新。</p>'}`;
    $('#tab-outfits').querySelectorAll('[data-band]').forEach((b) => b.onclick = () => { S.band = b.dataset.band; renderOutfits(); });
  }

  // ---------------------------------------------------------------- 衣櫥
  function renderWardrobe() {
    const owned = activeOrders();
    const picksBySlot = {};
    S.report.items.forEach((i) => { (picksBySlot[i.slot] = picksBySlot[i.slot] || []).push(i); });
    let full = 0; let planned = 0;
    const cells = S.rules.capsule_slots.map((s) => {
      const have = owned.filter((o) => o.slot === s.id);
      const want = S.list.filter((x) => x.slot === s.id);
      const state = have.length ? 'full' : want.length ? 'planned' : 'gap';
      if (state === 'full') full++; if (state === 'planned') planned++;
      const sugg = (picksBySlot[s.id] || []).slice(0, 2);
      return { s, have, want, state, sugg };
    });
    const meter = cells.map((c) => `<i class="${c.state === 'gap' ? '' : c.state}"></i>`).join('');
    $('#tab-wardrobe').innerHTML = `<h2>12 格膠囊衣櫥</h2>
      <p class="lead">已購 ${full} 格、清單補上 ${planned} 格、還缺 ${12 - full - planned} 格。已取消、退款或標成已淘汰的不算。</p>
      <div class="meter" aria-hidden="true">${meter}</div>
      <div class="slots">${cells.map(({ s, have, want, state, sugg }) => `<div class="slot ${state}">
        <h3>${esc(s.label)}</h3><p class="hint">${esc(s.hint)}</p>
        <p class="state">${state === 'full' ? `已有 ${have.length} 件` : state === 'planned' ? '清單補上' : '缺'}</p>
        ${have.length || want.length ? `<ul>${have.slice(0, 4).map((o) => `<li>${esc(o.brand)} ${esc(o.name)}</li>`).join('')}${want.map((x) => `<li>（清單）${esc(x.name)}</li>`).join('')}</ul>` : ''}
        ${state === 'gap' && sugg.length ? `<ul>${sugg.map((i) => `<li>本月可補：<a href="#item-${esc(i.id)}" data-jump="${esc(i.id)}">${esc(brandName(i.brand))} ${esc(i.name)}</a></li>`).join('')}</ul>` : ''}
      </div>`).join('')}</div>`;
    $('#tab-wardrobe').querySelectorAll('[data-jump]').forEach((a) => a.onclick = (e) => {
      e.preventDefault(); S.filter = { cat: 'all', brand: 'all', budget: false, gaps: false };
      location.hash = 'picks'; renderPicks();
      setTimeout(() => document.getElementById('item-' + a.dataset.jump)?.scrollIntoView({ block: 'start' }), 50);
    });
  }

  // ---------------------------------------------------------------- 清單
  function syncPayload() {
    return { app: 'ccloth', version: 1, synced: new Date().toISOString(), items: S.list, retired: [...S.retired] };
  }
  function renderList() {
    const repoIds = new Set((S.repoList.items || []).map((x) => x.id));
    const repoOnly = (S.repoList.items || []).filter((x) => !inList(x.id));
    const reportById = Object.fromEntries(S.report.items.map((i) => [i.id, i]));
    const row = (x, local) => {
      const it = reportById[x.id];
      const now = it ? it.budget.price_twd : x.price_now;
      const change = x.price_at_add && now && now !== x.price_at_add ? `（加入時 NT$${num(x.price_at_add)}）` : '';
      return `<li class="row"><h3><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(brandName(x.brand))} ${esc(x.name)}</a></h3>
        <p class="meta">${esc(CAT[x.category] || '')}｜${esc(slotLabel(x.slot))}｜建議 ${esc(x.size || (it && it.size.final) || '—')}｜NT$${num(now)}${change}｜${local ? (repoIds.has(x.id) ? '已同步' : '只在這支手機') : '已同步（這支手機沒有）'}</p>
        ${local ? `<p><button class="btn ghost" data-remove="${esc(x.id)}">從清單移除</button></p>` : ''}</li>`;
    };
    $('#tab-list').innerHTML = `<h2>我的清單</h2>
      <p class="lead">清單存在這支手機的瀏覽器裡。按「同步到 GitHub」會開一個 Issue，在 GitHub 按 Submit 後，15 號的分析就會匯入、重新檢查價格，買過的會自動移除。</p>
      <ul class="rows">${S.list.map((x) => row(x, true)).join('') || '<li class="empty">清單是空的。到「選物」按「＋ 加入清單」。</li>'}</ul>
      ${repoOnly.length ? `<h3 class="section-h">上次同步、但不在這支手機的</h3><ul class="rows">${repoOnly.map((x) => row(x, false)).join('')}</ul>` : ''}
      <div class="tag-actions">
        <button class="btn" id="sync">同步到 GitHub</button>
        <button class="btn ghost" id="copy">複製 JSON</button>
      </div>
      <div id="json-box" hidden><p class="tape-note">清單太長時，網址放不下，請複製下面的 JSON，貼到新 Issue 的內文（標題用「Ccloth 清單」開頭）。</p><textarea class="json" readonly></textarea></div>`;
    $('#tab-list').querySelectorAll('[data-remove]').forEach((b) => b.onclick = () => toggleList({ id: b.dataset.remove, name: (S.list.find((x) => x.id === b.dataset.remove) || {}).name }));
    $('#sync').onclick = () => {
      const date = new Date().toISOString().slice(0, 10);
      const body = '由 Ccloth 網站產生，請直接按 Submit。\n\n```json\n' + JSON.stringify(syncPayload(), null, 1) + '\n```';
      const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('Ccloth 清單 ' + date)}&body=${encodeURIComponent(body)}`;
      if (url.length > 7500) { showJSON(); toast('清單太長，改用複製 JSON。'); window.open(`https://github.com/${REPO}/issues/new?title=${encodeURIComponent('Ccloth 清單 ' + date)}`, '_blank', 'noopener'); return; }
      window.open(url, '_blank', 'noopener');
    };
    $('#copy').onclick = async () => {
      showJSON();
      try { await navigator.clipboard.writeText(JSON.stringify(syncPayload(), null, 1)); toast('已複製 JSON'); } catch { toast('請手動選取下方 JSON 複製'); }
    };
  }
  function showJSON() { const box = $('#json-box'); box.hidden = false; box.querySelector('textarea').value = JSON.stringify(syncPayload(), null, 1); }

  // ---------------------------------------------------------------- 已購
  function renderOrders() {
    const V = S.rules.order_verdicts;
    const checks = S.report.orders_check || {};
    const all = S.orders.items;
    const f = S.orderFilter;
    const shown = all.filter((o) => f === 'all' || o.verdict === f);
    const counts = Object.fromEntries(Object.keys(V).map((k) => [k, all.filter((o) => o.verdict === k).length]));
    $('#tab-orders').innerHTML = `<h2>已購單品</h2>
      <p class="lead">從 Gmail 訂單信匯入（不含訂單編號與收件資料），逐件對照規則判定。已經不穿的可以標「已淘汰」，衣櫥與穿搭就不會再算它，下次同步清單時一起送出。</p>
      <div class="filters"><button class="chip" data-v="all" aria-pressed="${f === 'all'}">全部 ${all.length}</button>
        ${Object.entries(V).map(([k, v]) => `<button class="chip" data-v="${k}" aria-pressed="${f === k}">${esc(v.label)} ${counts[k]}</button>`).join('')}</div>
      <ul class="rows">${shown.map((o) => {
        const retired = o.retired || S.retired.has(o.id);
        const ck = checks[o.id];
        return `<li class="row"><p><span class="pill ${VERDICT_CLASS[o.verdict] || ''}">${esc(V[o.verdict] ? V[o.verdict].label : o.verdict)}</span>
          <span class="meta">${esc(o.date)}｜${esc(o.shop)}${o.status === 'ordered' ? '｜運送中' : ''}${retired ? '｜已淘汰' : ''}</span></p>
          <h3>${esc(o.brand)} ${esc(o.name)}</h3>
          <p class="meta">${esc(o.color || '')}${o.size ? `｜${esc(o.size)}` : ''}｜NT$${num(o.price)}${o.qty > 1 ? ` × ${o.qty}` : ''}｜${esc(slotLabel(o.slot))}${o.temps ? `｜${o.temps[0]}–${o.temps[1]}°C` : ''}</p>
          <p>${esc(o.verdict_reason || '')}</p>
          ${ck ? `<p class="meta">實測對照：最大偏差 ${fmt(ck.max_dev)}cm</p>` : ''}
          <p><button class="btn ghost" data-retire="${esc(o.id)}" aria-pressed="${retired}">${retired ? '取消已淘汰' : '標為已淘汰'}</button></p></li>`;
      }).join('') || '<li class="empty">沒有符合的單品。</li>'}</ul>`;
    $('#tab-orders').querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { S.orderFilter = b.dataset.v; renderOrders(); });
    $('#tab-orders').querySelectorAll('[data-retire]').forEach((b) => b.onclick = () => {
      const id = b.dataset.retire;
      if (S.retired.has(id)) S.retired.delete(id); else S.retired.add(id);
      store.set(LS_RETIRED, [...S.retired]);
      renderOrders(); renderWardrobe(); renderOutfits();
    });
  }

  // ---------------------------------------------------------------- 潮流
  function renderTrends() {
    const t = S.report.trends || {};
    const group = (title, arr) => `<h3 class="section-h">${title}</h3><ul class="rows">${(arr || []).map((x) => `<li class="row"><h3>${esc(x.title)}</h3>${x.why ? `<p class="meta">${esc(x.why)}</p>` : ''}<p><b>Robin 怎麼穿：</b>${esc(x.how_robin)}</p></li>`).join('')}</ul>`;
    $('#tab-trends').innerHTML = `<h2>潮流概況</h2>
      ${group('本季', t.this_season)}${group('下一季', t.next_season)}${group('不退流行', t.timeless)}${group('對你不利的流行', t.unfavorable)}
      ${(t.sources || []).length ? `<p class="tape-note" style="margin-top:14px">來源：${t.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('、')}</p>` : ''}`;
  }

  // ---------------------------------------------------------------- 品牌
  function renderBrands() {
    const lists = S.rules.brand_lists;
    const L = lists[0];
    const labels = Object.fromEntries(Object.entries(S.rules.experts).map(([k, v]) => [k, v.label]));
    $('#tab-brands').innerHTML = `<h2>品牌強項</h2>
      <p class="lead">「${esc(L.label)}」綜合分權重：${Object.entries(L.weights).map(([k, w]) => `${labels[k]} ${w * 100}%`).join('、')}。</p>
      ${(S.report.brands || []).map((b) => {
        if (b.status !== 'verified') return `<div class="brand pending"><div class="brand-head"><h3>${esc(b.name)}</h3><span class="meta">待確認網址</span></div><p>${esc(b.notes || '')}</p></div>`;
        const m = b.metrics || {};
        const score = (b.overall || {})[L.id];
        const change = b.overall_change != null ? `（較上月 ${b.overall_change > 0 ? '+' : ''}${fmt(b.overall_change)}）` : '';
        return `<div class="brand"><div class="brand-head"><h3><a href="${esc(b.store)}" target="_blank" rel="noopener">${esc(b.name)}</a></h3><span class="big">${fmt2(score)}</span></div>
          <p class="meta">${esc(b.origin || '')}｜${esc(b.price_band || '')}｜${esc(b.size_system || '')}${esc(change)}</p>
          <div class="bars">${['material', 'build', 'care', 'fit', 'function'].map((k) => m[k] ? `<div class="bar" title="${esc(m[k].basis)}"><span>${labels[k]}</span><span class="fill"><i style="width:${m[k].score * 20}%"></i></span><span class="n">${fmt(m[k].score)}</span></div>` : '').join('')}</div>
          <dl class="kv"><dt>強項</dt><dd>${esc(b.strengths || '—')}</dd><dt>特點</dt><dd>${esc(b.features || '—')}</dd>
          <dt>適合你的</dt><dd>${esc(b.fits_robin || '—')}</dd><dt>代表單品</dt><dd>${esc((b.signature_items || []).join('、'))}</dd>
          <dt>本月入選</dt><dd>${b.picks.length ? b.picks.map((p) => esc(p.name)).join('、') : '無'}</dd><dt>與上月比</dt><dd>${esc(b.changes_vs_last || '—')}</dd></dl>
          <details class="more"><summary>評分依據</summary><dl class="kv">${Object.entries(m).map(([k, v]) => `<dt>${labels[k]}</dt><dd>${esc(v.basis)}</dd>`).join('')}</dl></details></div>`;
      }).join('')}`;
  }

  // ---------------------------------------------------------------- 方法
  function renderMethod() {
    const R = S.rules;
    const L = R.measurement_labels;
    const ranges = Object.entries(R.fit_ranges).map(([c, dims]) => `<tr><td>${esc(CAT[c])}</td><td>${Object.entries(dims).map(([d, [lo, hi]]) => `${esc(L[d] || d)} ${lo}–${hi}`).join('、')}</td><td>${esc(R.fit_notes[c] || '')}</td></tr>`).join('');
    const a = R.alerts;
    const lv = (x) => x == null ? '—' : x;
    const alertRows = [
      [a.defects.label + '（1–3 星）', '—', `> ${a.defects.warn_pct}%`, `≥ ${a.defects.severe_pct}% 且 ≥ ${a.defects.severe_min_count} 則`],
      [a.tight.label, '—', `> ${a.tight.warn_pct}%`, `≥ ${a.tight.severe_pct}% 且 ≥ ${a.tight.severe_min_count} 則`],
      [a.sheer.label, '—', `> ${a.sheer.warn_pct}%`, `≥ ${a.sheer.severe_pct}% 且 ≥ ${a.sheer.severe_min_count} 則`],
      [a.size_range.label, `≤ ${a.size_range.note_max_cm}cm`, `${a.size_range.note_max_cm}–${a.size_range.warn_max_cm}cm`, `> ${a.size_range.warn_max_cm}cm`],
      [a.budget.label, `0–${a.budget.note_max_pct}%`, `${a.budget.note_max_pct}–${a.budget.warn_max_pct}%`, `> ${a.budget.warn_max_pct}%`],
      [a.premium.label, `≥ ${a.premium.note_pct}%`, `≥ ${a.premium.warn_pct}%`, '—'],
      ['連肩袖、羅紋下擺、Slim 褲、低腰、薄軟布', '—', '警告', `下擺差 ≥ ${R.hem_rule.severe_diff_cm}cm、前襠 < ${a.rise_severe_below_cm}cm`],
      [a.one_way_zip.label, '注意', '—', '—'],
      [a.small_sample.label, '注意', '—', '—'],
    ].map((r) => `<tr>${r.map((c) => `<td>${esc(lv(c))}</td>`).join('')}</tr>`).join('');
    const sr = S.report.self_review || [];
    $('#tab-method').innerHTML = `<div class="method"><h2>選品方法</h2>
      <p class="lead">${esc(R.profile.height_cm)}cm／${esc(R.profile.weight_kg)}kg，肩 ${R.profile.body_flat_cm.shoulder}、胸 ${R.profile.body_flat_cm.chest}、腰 ${R.profile.body_flat_cm.waist}（${esc(R.profile.body_note)}），${esc(R.profile.skin_tone)}膚色，目標「${esc(R.profile.goal)}」。每月 15 日自動執行，先自我審查規則與程式，再選品。</p>
      <h3 class="section-h">這期的自我審查</h3>
      <ul class="rows">${sr.map((x) => `<li class="row"><h3>${esc(x.area)}</h3><p class="meta">${esc(x.finding)}</p><p>${esc(x.change)}</p></li>`).join('') || '<li class="empty">這期沒有調整。</li>'}</ul>
      <h3 class="section-h">版型範圍（平量 cm）</h3>
      <div class="table-wrap"><table><thead><tr><th>類別</th><th>範圍</th><th>其他</th></tr></thead><tbody>${ranges}</tbody></table></div>
      <p class="tape-note" style="margin-top:6px">${esc(R.hem_rule.text)}。尺寸基準：上衣韓版 ${esc(R.size_base.top_outer.korean)}、日系 ${esc(R.size_base.top_outer.japanese)}；褲子 ${R.size_base.pants.waist_inch.join(' 或 ')} 腰 ${esc(R.size_base.pants.length_note)}。</p>
      <h3 class="section-h">分級提醒</h3>
      <div class="table-wrap"><table><thead><tr><th>項目</th><th>注意 −${R.levels['1'].penalty}</th><th>警告 −${R.levels['2'].penalty}</th><th>嚴重（剔除）</th></tr></thead><tbody>${alertRows}</tbody></table></div>
      <p class="tape-note" style="margin-top:6px">排序：${esc(R.ranking.formula)}，上限 ${R.ranking.max_items} 件。缺貨與女裝不列入。</p>
      <h3 class="section-h">排雷評論</h3>
      <p>只看身高 ${R.reviews.body_filter.height_cm.join('–')}cm、體重 ${R.reviews.body_filter.weight_kg.join('–')}kg 的評論算同身形。否定片語（例如「不會縮水」「遮肚」）先刪掉再比對關鍵字。${esc(R.reviews.low_star_note)}。</p>
      <h3 class="section-h">預算</h3>
      <p>上衣、褲子 NT$${num(R.budget.limits_twd.tee)}，外套 NT$${num(R.budget.limits_twd.outer)}。超出時必須寫加價理由。${esc(R.premium.applies_when)}。</p>
      </div>`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
