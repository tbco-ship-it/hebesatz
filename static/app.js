(async function () {
  const cssHref = document.querySelector('link[href*="static/style.css"]').getAttribute('href');
  const v = (cssHref.match(/\?v=([^&]+)/) || [])[1] || '';
  const base = cssHref.replace(/static\/style\.css.*$/, '');
  const $ = id => document.getElementById(id);
  const eur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  // German decimal input: 85,20 or 1.234,56 or 85.20
  const parseVal = value => { const raw = String(value ?? '').trim().replace(/\s*€$/, ''); if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$|^\d+\.\d{1,2}$/.test(raw)) return null; const n = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw); return Number.isFinite(n) && n > 0 ? n : null; };
  const fmtInput = el => { const n = parseVal(el.value); if (n !== null) el.value = n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const sheet = document.querySelector('.sheet[data-b]');
  if (sheet && $('mb') && !$('q')) {
    const b = parseFloat(sheet.dataset.b), mb = $('mb'), err = $('est-err');
    const paint = () => { const n = parseVal(mb.value); err.hidden = n !== null || !mb.value.trim(); if (n === null) { $('est-year').textContent = '–'; $('est-q').textContent = '–'; return; } $('est-year').textContent = eur(n * b / 100); $('est-q').textContent = eur(n * b / 100 / 4); };
    mb.addEventListener('input', paint); mb.addEventListener('blur', () => { fmtInput(mb); paint(); });
    return;
  }

  const input = $('q'); if (!input) return;
  const out = $('result'), menu = $('q-menu'), mb = $('mb'), status = $('search-status');
  let IDX;
  input.disabled = true; status.hidden = false; status.textContent = 'Gemeindeliste wird geladen …';
  try { const r = await fetch(base + 'static/index.json?v=' + v); if (!r.ok) throw new Error(r.status); IDX = await r.json(); }
  catch (e) { status.textContent = 'Die Suche ist gerade nicht verfügbar. Bitte Seite neu laden oder über die Bundesländer navigieren.'; input.disabled = false; return; }
  input.disabled = false; status.hidden = true;
  const LA = IDX.laender;
  const norm = s => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const D = IDX.items.map(a => ({ name: a[0], lc: a[1], slug: a[2], b: a[3], b24: a[4], pop: a[5], changed: !!a[6], gew: a[7], land: LA[a[1]][0], q: norm(a[0]), ql: norm(a[0] + LA[a[1]][0]) }));
  function card(g) {
    const n = parseVal(mb.value);
    const chg = g.changed && g.b24 ? ` · zur Reform 2025 von ${g.b24} % geändert` : '';
    const est = n ? `<p class="sheet-text">Bei einem Messbetrag von ${eur(n)}: <b>${eur(n * g.b / 100)}</b> Grundsteuer im Jahr, ${eur(n * g.b / 100 / 4)} je Quartal.</p>` : '';
    return `<section class="sheet quiet"><p class="sheet-label">${g.land}${g.pop ? ' · ' + g.pop.toLocaleString('de-DE') + ' Einwohner' : ''}</p><div class="sheet-num"><span class="num">${g.b} %</span><span class="pct">Grundsteuer B</span></div><p class="sheet-title">${g.name}</p><p class="sheet-text">Landesmedian ${LA[g.lc][2]} %, bundesweit ${IDX.de_med} %${chg}${g.gew ? ` · Gewerbesteuer ${g.gew} %` : ''}.</p>${est}<p class="sheet-actions"><a class="next" href="${base}${LA[g.lc][1]}/${g.slug}/">Alle Hebesätze, Nachbarn & Rechner</a></p></section>`;
  }
  let items = [], active = -1, current = null;
  function open(q) {
    const nq = norm(q);
    items = nq ? D.filter(g => g.q.startsWith(nq) || g.ql.includes(nq)).sort((a, b) => (b.q.startsWith(nq) - a.q.startsWith(nq)) || (b.pop || 0) - (a.pop || 0)).slice(0, 8) : [];
    menu.innerHTML = items.length ? items.map((g, i) => `<li role="option" id="q-option-${i}" data-i="${i}" ${i === active ? 'aria-selected="true"' : ''}>${g.name}<small class="muted"> ${g.land} · ${g.b} %</small></li>`).join('') : (nq ? '<li class="empty">Keine Gemeinde gefunden. Versuchen Sie die amtliche Schreibweise (z. B. „Frankfurt am Main“).</li>' : '<li class="empty">Gemeindenamen eingeben.</li>');
    menu.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `q-option-${active}`); else input.removeAttribute('aria-activedescendant');
  }
  function close() { menu.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function leaveLanding() {
    const html = document.documentElement; if (!html.classList.contains('landing')) return;
    const stage = $('stage'), hero = stage.firstElementChild;
    const y0 = hero.getBoundingClientRect().top;
    html.classList.remove('landing');
    const dy = y0 - hero.getBoundingClientRect().top;
    if (dy > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.style.transition = 'none'; stage.style.transform = `translateY(${dy}px)`; void stage.offsetHeight;
      stage.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)'; stage.style.transform = 'translateY(0)';
      stage.addEventListener('transitionend', () => { stage.style.transition = ''; stage.style.transform = ''; }, { once: true });
    }
    if (window.__reveal) window.__reveal($('below'), true, 300);
  }
  function show(html) { leaveLanding(); out.classList.remove('reveal', 'is-in'); out.innerHTML = html; }
  function choose(g) {
    current = g; input.value = g.name; close(); show(card(g)); localStorage.setItem('hebesatz.q', JSON.stringify([g.lc, g.slug]));
    if (innerWidth < 900) setTimeout(() => out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  }
  input.addEventListener('focus', () => { setTimeout(() => input.select(), 0); open(input.value); });
  input.addEventListener('input', () => { active = -1; open(input.value); });
  input.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); open(input.value); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); open(input.value); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = items[active >= 0 ? active : 0]; if (it) choose(it); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  menu.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { choose(items[+li.dataset.i]); e.preventDefault(); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
  mb.addEventListener('blur', () => fmtInput(mb));
  mb.addEventListener('input', () => { if (current) out.innerHTML = card(current); });
  const rem = JSON.parse(localStorage.getItem('hebesatz.q') || 'null');
  const remembered = rem && D.find(g => g.lc === rem[0] && g.slug === rem[1]);
  if (remembered) { $('last-name').textContent = remembered.name; $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
})();
