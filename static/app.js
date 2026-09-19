(async function () {
  const cssHref = document.querySelector('link[href*="static/style.css"]').getAttribute('href');
  const v = (cssHref.match(/\?v=([^&]+)/) || [])[1] || '';
  const base = cssHref.replace(/static\/style\.css.*$/, '');
  const $ = id => document.getElementById(id);
  const eur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const pct = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n) + ' %';
  // German money input: 85,20 · 85.20 · 1.234 (= 1234) · 1.234,56 · 1.000.000. Returns null when not parseable.
  const parseVal = value => {
    let s = String(value ?? '').trim().replace(/\s*€\s*$/u, '').trim();
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d+(?:[,.]\d{1,2})?$/.test(s)) s = s.replace(',', '.');
    else return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? n : null;
  };
  // Hebesatz override: 655 · 1.181 · 1181 (percent, integer or one decimal)
  const parseRate = value => { let s = String(value ?? '').trim().replace(/\s*%\s*$/u, ''); if (/^\d{1,3}(?:\.\d{3})+(?:,\d)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,4}(?:[,.]\d)?$/.test(s)) s = s.replace(',', '.'); else return null; const n = Number(s); return n > 0 && n <= 5000 ? n : null; };
  const fmtInput = el => { const n = parseVal(el.value); if (n !== null && el.value.trim()) el.value = n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const markInvalid = (el, bad) => el.setAttribute('aria-invalid', String(bad));
  const store = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, val) => { try { localStorage.setItem(k, JSON.stringify(val)); } catch (e) { /* private mode / quota */ } } };

  const sheet = document.querySelector('.sheet[data-b]');
  if (sheet && $('mb') && !$('q')) {
    const b0 = sheet.dataset.b ? parseFloat(sheet.dataset.b) : null, mb = $('mb'), hb = $('hb'), err = $('est-err');
    const rate = () => (hb && hb.value.trim() ? parseRate(hb.value) : b0);
    const paint = () => {
      const n = parseVal(mb.value), b = rate(), typed = !!mb.value.trim();
      err.hidden = n !== null || !typed; markInvalid(mb, n === null && typed);
      if (hb) { markInvalid(hb, !!hb.value.trim() && parseRate(hb.value) === null); }
      $('est-b').textContent = b === null ? '–' : pct(b);
      if (n === null || b === null) { $('est-year').textContent = '–'; $('est-q').textContent = '–'; return; }
      $('est-year').textContent = eur(n * b / 100); $('est-q').textContent = eur(n * b / 100 / 4);
    };
    mb.addEventListener('input', paint); mb.addEventListener('blur', () => { fmtInput(mb); paint(); });
    if (hb) { hb.addEventListener('input', paint); }
    paint();
    return;
  }

  const input = $('q'); if (!input) return;
  const out = $('result'), menu = $('q-menu'), mb = $('mb'), status = $('search-status');
  let IDX;
  status.hidden = false; status.textContent = 'Gemeindeliste wird geladen …';
  try { const r = await fetch(base + 'static/index.json?v=' + v); if (!r.ok) throw new Error(r.status); IDX = await r.json(); }
  catch (e) {
    input.disabled = true; status.hidden = false;
    status.replaceChildren(document.createTextNode('Die Gemeindesuche konnte nicht geladen werden. '));
    const link = document.createElement('a'); link.href = base + 'bundeslaender/'; link.textContent = 'Gemeinden nach Bundesland öffnen'; status.append(link);
    return;
  }
  status.hidden = true;
  const LA = IDX.laender;
  const norm = s => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  // index row: name, land code, slug, b, b2024, population, status (0 unchanged since 2024 · 1 reported H1-2025 · 2 NRW split rates likely), Kreis name, AGS
  const D = IDX.items.map(a => ({ name: a[0], lc: a[1], slug: a[2], b: a[3], b24: a[4], pop: a[5], st: a[6], kreis: a[7], ags: a[8], land: LA[a[1]][0], q: norm(a[0]), ql: norm(a[0] + LA[a[1]][0]) }));
  function card(g) {
    const n = parseVal(mb.value), split = g.st === 2;
    const where = `${g.kreis && g.kreis !== g.name ? g.kreis + ' · ' : ''}${g.land}${g.pop ? ' · ' + g.pop.toLocaleString('de-DE') + ' Einwohner' : ''}`;
    if (split) return `<section class="sheet quiet"><p class="sheet-label">${where}</p><div class="sheet-num"><span class="num">Wohnen / Nichtwohnen</span><span class="pct">Grundsteuer B 2025</span></div><p class="sheet-title">${g.name}</p><p class="data-warning">Die Stadt setzt 2025 voraussichtlich getrennte Hebesätze für Wohn- und Nichtwohngrundstücke; die amtliche Tabelle führt keinen Wert (bis 2024: ${pct(g.b24)}). Rechnen Sie auf der Gemeindeseite mit dem Hebesatz aus Ihrem Bescheid.</p><p class="sheet-actions"><a class="next" href="${base}${LA[g.lc][1]}/${g.slug}/">Zur Gemeindeseite mit Rechner</a></p></section>`;
    const chg = g.st === 1 && g.b24 !== null && g.b24 !== g.b ? ` · zur Reform 2025 von ${pct(g.b24)} geändert` : g.st === 1 ? ' · für 2025 bestätigt' : ' · unverändert seit 2024';
    const est = n !== null && mb.value.trim() ? `<p class="sheet-text">Bei einem Messbetrag von ${eur(n)}: <b>${eur(n * g.b / 100)}</b> Grundsteuer im Jahr, ${eur(n * g.b / 100 / 4)} je Quartal (rechnerisch; maßgeblich ist Ihr Bescheid).</p>` : '';
    return `<section class="sheet quiet"><p class="sheet-label">${where}</p><div class="sheet-num"><span class="num rate-value">${pct(g.b)}</span><span class="pct">Grundsteuer B 2025</span></div><p class="sheet-title">${g.name}</p><p class="sheet-text">Datenstand 30.06.2025${chg}. Landesmedian ${pct(LA[g.lc][2])}, bundesweit ${pct(IDX.de_med)}.</p>${est}<p class="sheet-actions"><a class="next" href="${base}${LA[g.lc][1]}/${g.slug}/">Alle Hebesätze, Kreis & Rechner</a></p></section>`;
  }
  let items = [], active = -1, current = null;
  function open(q) {
    const nq = norm(q);
    items = nq ? D.filter(g => g.q.startsWith(nq) || g.ql.includes(nq)).sort((a, b) => ((b.q === nq) - (a.q === nq)) || (b.q.startsWith(nq) - a.q.startsWith(nq)) || (b.pop || 0) - (a.pop || 0)).slice(0, 8) : [];
    menu.innerHTML = items.length ? items.map((g, i) => `<li role="option" id="q-option-${i}" data-i="${i}" aria-selected="${i === active}">${g.name}<small class="muted"> ${g.st === 2 ? 'Wohnen/Nichtwohnen' : pct(g.b)}</small><small class="kreis">${g.kreis && g.kreis !== g.name ? g.kreis + ' · ' : ''}${g.land}</small></li>`).join('') : (nq ? '<li class="empty">Keine Gemeinde gefunden. Versuchen Sie die amtliche Schreibweise (z. B. „Frankfurt am Main“).</li>' : '<li class="empty">Gemeindenamen eingeben.</li>');
    menu.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (active >= 0) { input.setAttribute('aria-activedescendant', `q-option-${active}`); menu.children[active]?.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
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
    current = g; input.value = g.name; close(); show(card(g)); store.set('hebesatz.q', [g.lc, g.slug]);
    // phone: keep the amount field reachable — scroll to it when no amount has been typed yet, else to the result
    if (innerWidth < 900) { input.blur(); const target = parseVal(mb.value) === null || !mb.value.trim() ? mb.closest('.field') : out; setTimeout(() => target.scrollIntoView({ behavior: 'auto', block: 'center' }), 60); }
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
  mb.addEventListener('blur', () => { fmtInput(mb); markInvalid(mb, parseVal(mb.value) === null && !!mb.value.trim()); });
  mb.addEventListener('input', () => { markInvalid(mb, parseVal(mb.value) === null && !!mb.value.trim()); if (current) out.innerHTML = card(current); });
  const rem = store.get('hebesatz.q');
  const remembered = rem && D.find(g => g.lc === rem[0] && g.slug === rem[1]);
  if (remembered) { $('last-name').textContent = remembered.name; $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
  if (input.value.trim() && document.activeElement === input) open(input.value);  // typed while the index was loading
})();
