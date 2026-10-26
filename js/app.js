/* Истори-тренажер, этап 1b.
   Уроки по 8 заданий, шесть механик, подготовка к контрольной уровнями, микс дня.
   Без сборки и без аккаунтов: прогресс в localStorage (схема v2). */

const COURSE = 'srednie-veka-6';
const LESSON_LEN = 8;
const STORE_KEY = 'istoria-trainer-v3';
const OLD_KEY2 = 'istoria-trainer-v2';
const OLD_KEY = 'istoria-trainer-v1';
const XP_PER_TASK = 10;

const $ = (id) => document.getElementById(id);
const shuffle = (a) => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const pick = (a, n) => shuffle(a).slice(0, n);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

// ---------- хранилище ----------
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s) return s;
    const s2 = JSON.parse(localStorage.getItem(OLD_KEY2));
    if (s2) return { v: 3, xp: s2.xp || 0, streak: s2.streak || 0, lastDay: s2.lastDay || null, wrong: s2.wrong || [], seen: s2.seen || {}, moreClicks: s2.moreClicks || 0 };
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old) return { v: 2, streak: old.streak || 0, lastDay: old.lastDay || null, wrong: old.wrongIds || [] };
  } catch { /* нет доступа к хранилищу — работаем в памяти */ }
  return {};
}
const state = Object.assign({ v: 3, xp: 0, streak: 0, lastDay: null, wrong: [], seen: {}, steps: {}, layouts: {}, hearts: 0, bosses: {}, current: null, moreClicks: 0 }, loadState());
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* приватный режим */ } }
function touchStreak() {
  const t = today();
  if (state.lastDay === t) return;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak = state.lastDay === y ? state.streak + 1 : 1;
  state.lastDay = t; save();
}
function renderStats() { $('xp').textContent = '⭐ ' + state.xp; $('streak').textContent = '🔥 ' + state.streak; }

// ---------- персонажи-заглушки (до выбора команды) ----------
const CHAR = {
  optimist: { face: '😄', say: ['Да! Так и знал, что ты сможешь.', 'Это было красиво.', 'Еще одна дата в копилке.', 'Красавчик.'] },
  panic:    { face: '😱', say: ['Все пропало... ладно, не все.', 'Я же говорил, что дата страшная!', 'Ох. Ну, давай еще раз.', 'Сердце не выдержит.'] },
  nerd:     { face: '🤓', say: ['Вообще-то, вот что надо запомнить:', 'Для протокола:', 'Записывай:', 'Маленький лайфхак:'] },
  neutral:  { face: '🙂', say: ['Поехали.', 'Следующее.', 'Так, внимание.'] },
};
function speak(role, text) {
  $('char-face').textContent = CHAR[role].face;
  const line = CHAR[role].say[Math.floor(Math.random() * CHAR[role].say.length)];
  $('char-say').textContent = text ? `${line} ${text}` : line;
}

// ---------- данные ----------
const D = {};
async function loadContent() {
  const names = ['topics', 'facts', 'terms', 'persons', 'causes', 'cloze', 'truefalse', 'lessons'];
  const res = await Promise.all(names.map(n => fetch(`content/${COURSE}/${n}.json`).then(r => { if (!r.ok) throw new Error(n); return r.json(); })));
  names.forEach((n, i) => D[n] = res[i]);
  D.factById = Object.fromEntries(D.facts.map(f => [f.id, f]));
  D.topicById = Object.fromEntries(D.topics.topics.map(t => [t.id, t]));
}
const byTopics = (arr, topics) => arr.filter(x => topics.includes(x.topic));

// ---------- экраны ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}

// ---------- карта параграфа ----------
// Узлы параграфа: 3 шага → сундук (прошлый параграф) → 2 шага → контрольная. Шаг = 8 заданий.
const STEP_PLAN = ['step', 'step', 'step', 'chest', 'step', 'step', 'exam'];
const STEP_MECH = [ // механики шага, чередуются; факт попадает в 2–3 шага в разных механиках
  ['pairs', 'choice', 'tf', 'cloze', 'pairs', 'choice', 'type', 'tf'],
  ['choice', 'order', 'pairsx', 'tf', 'choice', 'cloze', 'type', 'pairs'],
  ['tf', 'pairs', 'choice', 'type', 'order', 'choice', 'cloze', 'pairsx'],
  ['pairs', 'type', 'choice', 'cloze', 'tf', 'order', 'choice', 'pairs'],
  ['order', 'choice', 'pairsx', 'type', 'tf', 'pairs', 'cloze', 'choice'],
];
const EPOCH = { '15': '🏹', '16-17': '🐉', '18': '🐘', '19': '🐪', '20': '🦅', '21-22': '🏰', '23': '🕌', '24': '🧭' };

function topicOrder() { return D.topics.chapters.flatMap(c => c.topics); }
function prevTopic(tid) { const o = topicOrder(); const i = o.indexOf(tid); return i > 0 ? o[i - 1] : null; }
function nextTopic(tid) { const o = topicOrder(); const i = o.indexOf(tid); return i < o.length - 1 ? o[i + 1] : null; }
function chapterOf(tid) { return D.topics.chapters.find(c => c.topics.includes(tid)); }
function isLastInChapter(tid) { const ch = chapterOf(tid); return ch.topics[ch.topics.length - 1] === tid; }

// Раскладка фактов параграфа по 5 шагам: фиксируется один раз на ученика.
function layoutFor(tid) {
  if (state.layouts[tid]) return state.layouts[tid];
  const facts = D.facts.filter(f => f.topic === tid).map(f => f.id);
  const terms = D.terms.filter(t => t.topic === tid).map(t => t.id);
  const persons = D.persons.filter(p => p.topic === tid).map(p => p.id);
  const spread = (ids) => { // каждый id в 2–3 шага из 5
    const steps = [[], [], [], [], []];
    shuffle(ids).forEach((id, i) => {
      const n = ids.length <= 6 ? 3 : 2;
      const starts = pick([0, 1, 2, 3, 4], n);
      starts.forEach(k => steps[k].push(id));
    });
    return steps;
  };
  const lay = { facts: spread(facts), terms: spread(terms), persons: spread(persons) };
  state.layouts[tid] = lay; save();
  return lay;
}
const stepKey = (tid, i) => `${tid}:${i}`;
function stepBest(tid, i) { return (state.steps[stepKey(tid, i)] || {}).best || 0; }
function stepDone(tid, i) { return stepBest(tid, i) >= 70; }
function nodeOpen(tid, idx) { // индекс в STEP_PLAN
  if (STEP_PLAN[idx] === 'chest') return true;
  for (let k = 0; k < idx; k++) if (STEP_PLAN[k] !== 'chest' && !stepDone(tid, k)) return false;
  return true;
}
function topicDone(tid) { return STEP_PLAN.every((k, i) => k === 'chest' || stepDone(tid, i)); }

function currentTopic() {
  if (state.current && D.topicById[state.current]) return state.current;
  const first = topicOrder().find(t => !topicDone(t)) || topicOrder()[0];
  state.current = first; return first;
}

function renderHome() {
  const tid = currentTopic();
  const t = D.topicById[tid], ch = chapterOf(tid);
  const dailyPool = dailyFacts();
  $('daily').classList.toggle('hidden', dailyPool.length < 3);
  $('topic-pill-para').textContent = `Глава ${ch.id} · ${t.paragraph}`;
  $('topic-pill-title').textContent = t.title;
  $('hearts-home').textContent = '❤️'.repeat(state.hearts) + '🖤'.repeat(Math.max(0, 3 - state.hearts));

  const box = $('map'); box.innerHTML = '';
  let currentIdx = STEP_PLAN.findIndex((k, i) => k !== 'chest' && !stepDone(tid, i));
  if (currentIdx < 0) currentIdx = STEP_PLAN.length;
  let stepNo = 0;
  STEP_PLAN.forEach((kind, idx) => {
    const row = document.createElement('div');
    row.className = 'node-row ' + (['l', 'c', 'r', 'c', 'l', 'c', 'r'][idx]);
    const b = document.createElement('button');
    const open = nodeOpen(tid, idx) && !(kind === 'chest' && !prevTopic(tid));
    const best = stepBest(tid, idx);
    b.className = `node ${kind}` + (open ? '' : ' locked') + (idx === currentIdx ? ' current' : '') + (best >= 70 ? ' done' : '');
    b.disabled = !open;
    let icon = '⭐', label = '';
    if (kind === 'step') { stepNo++; icon = best >= 70 ? '✓' : '⭐'; label = `Шаг ${stepNo}`; }
    if (kind === 'chest') { icon = '🎁'; label = prevTopic(tid) ? `Сундук: ${D.topicById[prevTopic(tid)].paragraph}` : 'Сундук<br><span class="small muted">со следующего параграфа</span>'; }
    if (kind === 'exam') { icon = best >= 70 ? '🏆' : '📝'; label = 'Контрольная'; }
    b.innerHTML = `<span class="node-icon">${icon}</span>`;
    b.onclick = () => kind === 'step' ? startStep(tid, idx) : kind === 'chest' ? startChest(tid) : startTopicExam(tid);
    row.appendChild(b);
    const cap = document.createElement('div');
    cap.className = 'node-cap';
    cap.innerHTML = `${esc(label)}${best ? `<br><span class="small muted">${best}%</span>` : ''}`;
    row.appendChild(cap);
    if (idx === currentIdx) {
      const c = document.createElement('div'); c.className = 'mascot';
      c.textContent = EPOCH[tid] || '🙂'; row.appendChild(c);
    }
    box.appendChild(row);
  });

  // босс главы — после последнего параграфа главы
  if (isLastInChapter(tid)) {
    const row = document.createElement('div'); row.className = 'node-row c boss-row';
    const open = ch.topics.every(topicDone);
    const b = document.createElement('button');
    const won = (state.bosses[ch.id] || {}).won;
    b.className = 'node boss' + (open ? '' : ' locked') + (won ? ' done' : '');
    b.disabled = !open;
    b.innerHTML = `<span class="node-icon">${won ? '🏅' : '🐲'}</span>`;
    b.onclick = () => startBoss(ch.id);
    row.appendChild(b);
    const cap = document.createElement('div'); cap.className = 'node-cap';
    cap.innerHTML = `Босс главы ${ch.id}${open ? '' : '<br><span class="small muted">пройди все параграфы главы</span>'}`;
    row.appendChild(cap);
    box.appendChild(row);
  }
  // переход дальше
  const nt = nextTopic(tid);
  const foot = document.createElement('div'); foot.className = 'map-foot';
  foot.innerHTML = nt ? `<button class="btn ${topicDone(tid) ? 'primary' : ''}" id="next-topic">Дальше: ${esc(D.topicById[nt].paragraph)} ${esc(D.topicById[nt].title)} →</button>` : '<p class="muted small">Это последний параграф курса.</p>';
  box.appendChild(foot);
  if (nt) $('next-topic').onclick = () => { state.current = nt; save(); renderHome(); window.scrollTo(0, 0); };
}

// список параграфов (плашка)
function renderTopicPicker() {
  const box = $('picker-list'); box.innerHTML = '';
  for (const ch of D.topics.chapters) {
    const h = document.createElement('div'); h.className = 'picker-ch'; h.textContent = `Глава ${ch.id}. ${ch.title}`; box.appendChild(h);
    for (const tid of ch.topics) {
      const t = D.topicById[tid];
      const done = STEP_PLAN.filter((k, i) => k !== 'chest' && stepDone(tid, i)).length;
      const b = document.createElement('button'); b.className = 'card picker-item' + (tid === state.current ? ' active' : '');
      b.innerHTML = `<span class="para">${esc(t.paragraph)}</span> ${esc(t.title)}<div class="small muted">${done} из 6 ${topicDone(tid) ? '✓' : ''}</div>`;
      b.onclick = () => { state.current = tid; save(); $('picker').classList.add('hidden'); renderHome(); };
      box.appendChild(b);
    }
  }
}
$('topic-pill').onclick = () => { renderTopicPicker(); $('picker').classList.toggle('hidden'); };
$('picker-close').onclick = () => $('picker').classList.add('hidden');

// ---------- карточки перед уроком ----------
let cards = null;
function openCards(tid, idx) {
  const lay = layoutFor(tid); const k = STEP_PLAN.slice(0, idx).filter(x => x !== 'chest').length;
  const ids = lay.facts[k] && lay.facts[k].length ? lay.facts[k] : D.facts.filter(f => f.topic === tid).map(f => f.id);
  cards = { tid, idx, i: 0, flipped: false, facts: ids.map(id => D.factById[id]) };
  $('cards-title').textContent = `${D.topicById[tid].paragraph} · Шаг ${k + 1}`;
  renderCard();
  show('screen-cards');
}
function renderCard() {
  const f = cards.facts[cards.i];
  $('flip-front').innerHTML = cards.flipped ? `<div class="small muted">${esc(f.date)}</div><div>${esc(f.event)}</div>` : `<div class="date">${esc(f.date)}</div><div class="small muted">нажми</div>`;
  $('flip').classList.toggle('back', cards.flipped);
  $('cards-count').textContent = `${cards.i + 1} / ${cards.facts.length}`;
}
$('flip').onclick = () => { cards.flipped = !cards.flipped; renderCard(); };
$('cards-prev').onclick = () => { cards.i = (cards.i - 1 + cards.facts.length) % cards.facts.length; cards.flipped = false; renderCard(); };
$('cards-next').onclick = () => { cards.i = (cards.i + 1) % cards.facts.length; cards.flipped = false; renderCard(); };
$('cards-start').onclick = () => runStep(cards.tid, cards.idx);
$('cards-home').onclick = () => { renderHome(); show('screen-home'); };

// ---------- генераторы заданий ----------
// Каждое задание: { kind, render(el), check() -> {ok, half?, answerText}, fact? }
const yearFacts = (facts) => facts.filter(f => f.year && !/в\./.test(f.date));

function tChoiceDate(fact, pool) {
  const ask = Math.random() < 0.5;
  const others = pool.filter(f => f.id !== fact.id);
  if (ask) { // событие → дата
    const opts = shuffle([fact.date, ...pick([...new Set(others.filter(f => f.date !== fact.date).map(f => f.date))], 3)]);
    return choice(`Когда: ${fact.event}?`, opts, fact.date, fact);
  }
  const opts = shuffle([fact.event, ...pick(others.filter(f => f.event !== fact.event).map(f => f.event), 3)]);
  return choice(`${fact.date} — что произошло?`, opts, fact.event, fact);
}
function tChoiceTerm(term, pool) {
  const opts = shuffle([term.definition, ...pick(pool.filter(t => t.id !== term.id).map(t => t.definition), 3)]);
  return choice(`${term.term} — это…`, opts, term.definition, null, `${term.term} — ${term.definition.toLowerCase()}`);
}
function tChoicePerson(p, pool) {
  const opts = shuffle([p.who, ...pick(pool.filter(x => x.id !== p.id).map(x => x.who), 3)]);
  return choice(`${p.name} — кто это?`, opts, p.who, null, `${p.name} — ${p.who.toLowerCase()}`);
}
function tCause(c) {
  const opts = shuffle([c.effect, ...c.wrong]);
  return choice(`${c.cause}. Что из этого следует?`, opts, c.effect, null, `${c.cause} → ${c.effect.toLowerCase()}`);
}
function choice(q, opts, answer, fact, answerText) {
  let chosen = null;
  return {
    kind: 'choice', fact, answerText: answerText || (fact ? `${fact.date} — ${fact.event}` : answer),
    render(el) {
      el.innerHTML = `<h2>${esc(q)}</h2><div class="options">${opts.map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>`;
      el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        chosen = b.textContent;
        el.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (x.textContent === answer) x.classList.add('correct'); });
        if (chosen !== answer) b.classList.add('wrong');
        finishTask(chosen === answer);
      });
    },
  };
}

const PAIR_LIMIT = 5;
function tPairs(facts) {
  return pairsTask(pick(facts, Math.min(4, facts.length)).map(f => ({ id: f.id, l: f.date, r: f.event })), 'Соедини даты и события');
}
function tPairsTerms(terms) {
  return pairsTask(pick(terms, 4).map(t => ({ id: t.id, l: t.term, r: t.definition })), 'Соедини термины и значения');
}
function tPairsPersons(persons) {
  return pairsTask(pick(persons, 4).map(p => ({ id: p.id, l: p.name, r: p.who })), 'Кто есть кто: соедини');
}
function pairsTask(set, title) {
  let left = null, mistakes = 0, done = 0;
  return {
    kind: 'pairs', answerText: set.map(x => `${x.l} — ${x.r}`).join('; '), quiet: true,
    render(el) {
      // одна сетка: левая и правая колонки идут строками, строки одной высоты
      const L = shuffle(set), R = shuffle(set);
      el.innerHTML = `<h2>${esc(title)}</h2><p class="small muted">Ошибок можно сделать: ${PAIR_LIMIT}</p><div class="pairs">${
        L.map((x, i) => `<button class="pair" data-id="${x.id}" data-side="l">${esc(x.l)}</button><button class="pair" data-id="${R[i].id}" data-side="r">${esc(R[i].r)}</button>`).join('')}</div>`;
      const all = () => el.querySelectorAll('.pair');
      all().forEach(b => b.onclick = () => {
        if (b.classList.contains('matched') || b.disabled) return;
        if (!left || left.dataset.side === b.dataset.side) { all().forEach(x => x.classList.remove('sel')); left = b; b.classList.add('sel'); return; }
        if (left.dataset.id === b.dataset.id) {
          [left, b].forEach(x => { x.classList.remove('sel'); x.classList.add('matched'); });
          if (++done === set.length) finishTask(mistakes === 0, mistakes <= 1);
        } else {
          mistakes++;
          [left, b].forEach(x => x.classList.add('shake'));
          setTimeout(() => all().forEach(x => x.classList.remove('shake', 'sel')), 400);
          if (mistakes >= PAIR_LIMIT) { // провал задания: показываем пары и идем дальше
            all().forEach(x => { x.disabled = true; x.classList.remove('sel'); if (!x.classList.contains('matched')) x.classList.add('reveal'); });
            finishTask(false);
          }
        }
        left = null;
      });
    },
  };
}

function tOrder(facts) {
  const uniq = []; const seen = new Set();
  for (const f of shuffle(facts)) { if (!seen.has(f.year)) { seen.add(f.year); uniq.push(f); } if (uniq.length === 4) break; }
  const sorted = [...uniq].sort((a, b) => a.year - b.year);
  const chosen = [];
  return {
    kind: 'order', answerText: sorted.map(f => `${f.date} ${f.event}`).join(' → '),
    render(el) {
      el.innerHTML = `<h2>Расставь по порядку: от раннего к позднему</h2><div class="slots" id="slots">${sorted.map((_, i) => `<div class="slot">${i + 1}</div>`).join('')}</div>
        <div class="options" id="order-opts">${shuffle(uniq).map(f => `<button class="opt" data-id="${f.id}">${esc(f.event)}</button>`).join('')}</div>`;
      el.querySelectorAll('#order-opts .opt').forEach(b => b.onclick = () => {
        if (b.disabled) return;
        b.disabled = true; chosen.push(+b.dataset.id);
        const slot = el.querySelectorAll('.slot')[chosen.length - 1];
        slot.textContent = `${chosen.length}. ${b.textContent}`; slot.classList.add('filled');
        if (chosen.length === sorted.length) {
          const ok = chosen.every((id, i) => id === sorted[i].id);
          el.querySelectorAll('.slot').forEach((s, i) => s.classList.add(chosen[i] === sorted[i].id ? 'correct' : 'wrong'));
          finishTask(ok);
        }
      });
    },
  };
}

function tCloze(c) {
  const filled = [];
  const words = shuffle([...c.answers, ...c.extra]);
  return {
    kind: 'cloze', answerText: c.text.replace(/\{(\d)\}/g, (_, i) => c.answers[+i]),
    render(el) {
      const html = c.text.replace(/\{(\d)\}/g, (_, i) => `<span class="blank" data-i="${i}">____</span>`);
      el.innerHTML = `<h2>Вставь пропущенное</h2><p class="cloze">${html}</p><div class="chips">${words.map(w => `<button class="chip">${esc(w)}</button>`).join('')}</div>`;
      const blanks = el.querySelectorAll('.blank');
      el.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
        if (ch.disabled || filled.length >= blanks.length) return;
        ch.disabled = true; filled.push({ w: ch.textContent, chip: ch });
        blanks[filled.length - 1].textContent = ch.textContent; blanks[filled.length - 1].classList.add('filled');
        if (filled.length === blanks.length) {
          const ok = filled.every((f, i) => f.w === c.answers[i]);
          blanks.forEach((b, i) => b.classList.add(filled[i].w === c.answers[i] ? 'correct' : 'wrong'));
          finishTask(ok);
        }
      });
      blanks.forEach((b, i) => b.onclick = () => { // убрать слово назад
        if (filled.length !== i + 1 || b.classList.contains('correct') || b.classList.contains('wrong')) return;
        const f = filled.pop(); f.chip.disabled = false; b.textContent = '____'; b.classList.remove('filled');
      });
    },
  };
}

function tTrueFalse(s) {
  return {
    kind: 'tf', answerText: s.isTrue ? `Верно: ${s.statement}` : `Неверно. ${s.note}`,
    render(el) {
      el.innerHTML = `<h2>Правда или ложь?</h2><p class="statement">${esc(s.statement)}</p><div class="options tf"><button class="opt" data-v="1">Правда</button><button class="opt" data-v="0">Ложь</button></div>`;
      el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const v = b.dataset.v === '1';
        el.querySelectorAll('.opt').forEach(x => { x.disabled = true; if ((x.dataset.v === '1') === s.isTrue) x.classList.add('correct'); });
        if (v !== s.isTrue) b.classList.add('wrong');
        finishTask(v === s.isTrue);
      });
    },
  };
}

function tType(fact) {
  const period = /[—-]/.test(fact.date) && !/^ок/.test(fact.date);
  return {
    kind: 'type', fact, answerText: `${fact.date} — ${fact.event}`,
    render(el) {
      el.innerHTML = `<h2>${period ? 'В каком году началось' : 'В каком году'}: ${esc(fact.event)}?</h2>
        <input class="year" id="year-input" type="number" inputmode="numeric" placeholder="год" min="100" max="1600">`;
      const inp = el.querySelector('#year-input');
      inp.focus();
      const btn = $('check-btn');
      btn.classList.remove('hidden');
      btn.onclick = () => {
        const v = parseInt(inp.value, 10);
        if (!v) { inp.focus(); return; }
        btn.classList.add('hidden'); inp.disabled = true;
        const diff = Math.abs(v - fact.year);
        inp.classList.add(diff === 0 ? 'correct' : 'wrong');
        finishTask(diff === 0, diff === 1);
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') btn.onclick(); };
    },
  };
}

// ---------- сборка шага / сундука / контрольной / босса ----------
function buildTasksFrom(pool, mech) {
  // pool: {facts, terms, persons, causes, cloze, tf} — массивы объектов; mech — список механик
  const yf = yearFacts(pool.facts);
  const wrongFirst = [...pool.facts.filter(f => state.wrong.includes(f.id)), ...shuffle(pool.facts.filter(f => !state.wrong.includes(f.id)))];
  let fi = 0; const nextFact = () => wrongFirst[fi++ % wrongFirst.length];
  const usedTf = new Set(), usedCloze = new Set(), usedCause = new Set();
  const tasks = [];
  const allFacts = D.facts, allTopicFacts = pool.allFacts || pool.facts;
  for (const m of mech) {
    if (m === 'pairs' && pool.facts.length >= 3) tasks.push(tPairs(pool.facts.length >= 4 ? pool.facts : allTopicFacts));
    else if (m === 'pairsx' && (pool.terms.length >= 4 || pool.persons.length >= 4)) tasks.push(pool.terms.length >= 4 && (pool.persons.length < 4 || Math.random() < 0.5) ? tPairsTerms(pool.terms) : tPairsPersons(pool.persons));
    else if ((m === 'pairsx' || m === 'pairs') && allTopicFacts.length >= 3) tasks.push(tPairs(allTopicFacts));
    else if (m === 'order' && yearFacts(allTopicFacts).length >= 4) tasks.push(tOrder(yf.length >= 4 ? pool.facts : allTopicFacts));
    else if (m === 'cloze' && pool.cloze.some(c => !usedCloze.has(c.id))) { const c = pick(pool.cloze.filter(c => !usedCloze.has(c.id)), 1)[0]; usedCloze.add(c.id); tasks.push(tCloze(c)); }
    else if (m === 'tf' && pool.tf.some(x => !usedTf.has(x.id))) { const x = pick(pool.tf.filter(x => !usedTf.has(x.id)), 1)[0]; usedTf.add(x.id); tasks.push(tTrueFalse(x)); }
    else if (m === 'type' && yf.length) tasks.push(tType(pick(yf, 1)[0]));
    else {
      const r = Math.random();
      if (r < 0.5 && pool.facts.length) tasks.push(tChoiceDate(nextFact(), allTopicFacts.length >= 4 ? allTopicFacts : allFacts));
      else if (r < 0.7 && pool.terms.length) tasks.push(tChoiceTerm(pick(pool.terms, 1)[0], D.terms));
      else if (r < 0.85 && pool.persons.length) tasks.push(tChoicePerson(pick(pool.persons, 1)[0], D.persons));
      else if (pool.causes.some(c => !usedCause.has(c.id))) { const c = pick(pool.causes.filter(c => !usedCause.has(c.id)), 1)[0]; usedCause.add(c.id); tasks.push(tCause(c)); }
      else if (pool.facts.length) tasks.push(tChoiceDate(nextFact(), allFacts));
      else if (pool.terms.length) tasks.push(tChoiceTerm(pick(pool.terms, 1)[0], D.terms));
    }
  }
  return tasks.slice(0, LESSON_LEN);
}
function topicPool(tid) {
  return { facts: D.facts.filter(f => f.topic === tid), allFacts: D.facts.filter(f => f.topic === tid),
    terms: D.terms.filter(x => x.topic === tid), persons: D.persons.filter(x => x.topic === tid),
    causes: D.causes.filter(x => x.topic === tid), cloze: D.cloze.filter(x => x.topic === tid), tf: D.truefalse.filter(x => x.topic === tid) };
}
function buildStep(tid, idx) {
  const k = STEP_PLAN.slice(0, idx).filter(x => x !== 'chest').length; // 0..4
  const lay = layoutFor(tid), p = topicPool(tid);
  const sub = (all, ids) => { const s = all.filter(x => ids.includes(x.id)); return s.length ? s : all; };
  const pool = { ...p, facts: sub(p.facts, lay.facts[k]), terms: sub(p.terms, lay.terms[k]), persons: sub(p.persons, lay.persons[k]) };
  return buildTasksFrom(pool, STEP_MECH[k]);
}
function buildChest(tid) {
  const pt = prevTopic(tid);
  const p = topicPool(pt);
  return buildTasksFrom(p, ['pairs', 'tf', 'choice', 'order', 'pairsx', 'choice', 'cloze', 'type']);
}
function buildTopicExam(tid) {
  const p = topicPool(tid);
  return buildTasksFrom(p, ['order', 'cloze', 'choice', 'pairsx', 'type', 'choice', 'tf', 'cloze']);
}
function buildBoss(ch) {
  const yf = yearFacts(byTopics(D.facts, ch.topics));
  return pick(yf, 8).map(tType);
}

function dailyFacts() {
  const wrong = state.wrong.map(id => D.factById[id]).filter(Boolean);
  const seenIds = new Set(Object.keys(state.seen).map(Number));
  const stale = D.facts.filter(f => seenIds.has(f.id) && !state.wrong.includes(f.id))
    .sort((a, b) => state.seen[a.id] - state.seen[b.id]);
  return [...wrong, ...stale];
}
function buildDaily() {
  const facts = dailyFacts().slice(0, 5);
  return facts.map((f, i) => i % 3 === 2 && f.year ? tType(f) : tChoiceDate(f, D.facts));
}

// ---------- прогон раунда ----------
let run = null;
function startRun(kind, tasks, meta) {
  run = { kind, tasks, i: 0, score: 0, hearts: kind === 'boss' ? Math.max(1, state.hearts) : null, meta, xp: 0 };
  touchStreak(); renderStats();
  $('hearts').classList.toggle('hidden', run.hearts === null);
  speak('neutral', meta.intro || '');
  show('screen-task');
  renderTask();
}
function startStep(tid, idx) { openCards(tid, idx); }
function runStep(tid, idx) { const k = STEP_PLAN.slice(0, idx).filter(x => x !== 'chest').length; startRun('step', buildStep(tid, idx), { tid, idx, intro: `${D.topicById[tid].paragraph}, шаг ${k + 1}. ${LESSON_LEN} заданий.` }); }
function startChest(tid) {
  const pt = prevTopic(tid);
  if (!pt) { alert('Это первый параграф курса, сундук откроется со следующего.'); return; }
  startRun('chest', buildChest(tid), { tid, idx: STEP_PLAN.indexOf('chest'), intro: `Сундук: вспоминаем ${D.topicById[pt].paragraph}. За 70% — сердце на босса.` });
}
function startTopicExam(tid) { startRun('exam', buildTopicExam(tid), { tid, idx: STEP_PLAN.indexOf('exam'), intro: `Контрольная по ${D.topicById[tid].paragraph}. Как учитель спросит.` }); }
function startBoss(chId) {
  const ch = D.topics.chapters.find(c => c.id === chId);
  startRun('boss', buildBoss(ch), { chapter: ch, intro: `Босс главы ${ch.id}. Даты с клавиатуры, жизней: ${Math.max(1, state.hearts)}.` });
}
function startDaily() { startRun('daily', buildDaily(), { intro: 'Микс дня: то, что подзабылось.' }); }

function renderHearts() { if (run.hearts !== null) $('hearts').textContent = '❤️'.repeat(run.hearts); }
function renderTask() {
  const t = run.tasks[run.i];
  $('progress-bar').style.width = (run.i / run.tasks.length * 100) + '%';
  renderHearts();
  ['feedback', 'assoc', 'more-btn', 'more-text', 'check-btn'].forEach(id => $(id).classList.add('hidden'));
  $('feedback').classList.remove('ok', 'bad', 'half');
  const el = $('task'); el.innerHTML = '';
  t.render(el);
}

function finishTask(ok, half = false) {
  const t = run.tasks[run.i];
  const fb = $('feedback');
  fb.classList.remove('hidden');
  fb.classList.add(ok ? 'ok' : half ? 'half' : 'bad');
  const hook = t.fact && t.fact.hook ? ` ${t.fact.hook}` : '';
  if (ok) {
    run.score++; run.xp += XP_PER_TASK;
    speak('optimist');
    $('feedback-text').innerHTML = t.quiet ? '<b>Ты прав.</b> Все пары на месте.' : `<b>Ты прав.</b> ${esc(t.answerText)}.${esc(hook)}`;
    if (t.fact) state.wrong = state.wrong.filter(id => id !== t.fact.id);
  } else {
    if (half) {
      run.score += 0.5; run.xp += XP_PER_TASK / 2; speak('nerd', 'Одна промашка — засчитываю половину.');
      $('feedback-text').innerHTML = t.quiet ? '<b>Почти.</b> Собрал, но с одной ошибкой.' : `<b>Почти.</b> Правильно: ${esc(t.answerText)}.`;
    } else {
      speak('panic');
      $('feedback-text').innerHTML = `<b>Ты не прав.</b> Правильно: ${esc(t.answerText)}.`;
    }
    if (t.fact) {
      if (t.fact.assoc) { $('assoc').textContent = `💡 ${t.fact.assoc}`; $('assoc').classList.remove('hidden'); }
      if (!state.wrong.includes(t.fact.id)) state.wrong.push(t.fact.id);
    }
    if (run.hearts !== null && !half) { run.hearts--; renderHearts(); }
  }
  if (t.fact) state.seen[t.fact.id] = Date.now();
  if (t.fact && t.fact.more) { $('more-btn').classList.remove('hidden'); $('more-text').textContent = t.fact.more; }
  save();
}
$('more-btn').onclick = () => { $('more-text').classList.remove('hidden'); $('more-btn').classList.add('hidden'); state.moreClicks++; save(); };

function next() {
  if (run.hearts === 0) return finishRun(true);
  run.i++;
  if (run.i >= run.tasks.length) return finishRun(false);
  renderTask();
}

function finishRun(lost) {
  $('progress-bar').style.width = '100%';
  const n = run.tasks.length, s = run.score, pct = Math.round(s / n * 100);
  state.xp += run.xp;
  let title, text, face = '🎉';
  const passed = pct >= 70;
  if (run.kind === 'step' || run.kind === 'exam' || run.kind === 'chest') {
    const { tid, idx } = run.meta;
    const key = stepKey(tid, idx), prev = state.steps[key] || { best: 0, rounds: 0 };
    state.steps[key] = { best: Math.max(prev.best, pct), rounds: prev.rounds + 1 };
    const name = run.kind === 'step' ? 'Шаг' : run.kind === 'exam' ? 'Контрольная' : 'Сундук';
    if (run.kind === 'chest' && passed && !prev.rewarded) { state.hearts = Math.min(3, state.hearts + 1); state.steps[key].rewarded = true; }
    else if (prev.rewarded) state.steps[key].rewarded = true;
    title = pct === 100 ? 'Все верно. Серьезно, все.' : passed ? `${pct}%. ${name} пройден${run.kind === 'exam' ? 'а' : ''}.` : `${pct}%. Нужно 70. Ошибки запомнил, спрошу их первыми.`;
    text = run.kind === 'chest' && passed ? `+1 сердце на босса (всего ${state.hearts})` : `${D.topicById[tid].paragraph} · ${D.topicById[tid].title}`;
    face = pct === 100 ? '🏆' : passed ? '😄' : '🤓';
  } else if (run.kind === 'boss') {
    const ch = run.meta.chapter.id;
    if (lost) { title = 'Жизни кончились.'; text = `Босс устоял. Прошел ${run.i} из ${n}. Сердца копятся в сундуках.`; face = '😱'; }
    else {
      state.bosses[ch] = { won: passed || (state.bosses[ch] || {}).won, best: Math.max(pct, (state.bosses[ch] || {}).best || 0) };
      title = passed ? `Босс главы ${ch} повержен. 🏅` : `${pct}%. Босс устоял, нужно 70.`;
      text = run.meta.chapter.title; face = passed ? '🏆' : '🤓';
    }
    state.hearts = 0;
  } else {
    title = `${s} из ${n}`; text = 'Микс дня закрыт. Завтра будет новый.'; face = s === n ? '😄' : '🙂';
  }
  save(); renderStats();
  $('result-face').textContent = face;
  $('result-title').textContent = title;
  $('result-text').textContent = text;
  $('result-xp').textContent = run.xp ? `+${run.xp} XP` : '';
  show('screen-result');
}

// ---------- кнопки ----------
$('next-btn').onclick = next;
$('check-btn').onclick = () => {};
$('quit').onclick = () => { if (confirm('Выйти? Прогресс этого раунда не сохранится.')) { renderHome(); show('screen-home'); } };
$('again-btn').onclick = () => run.kind === 'step' ? runStep(run.meta.tid, run.meta.idx) : run.kind === 'chest' ? startChest(run.meta.tid) : run.kind === 'exam' ? startTopicExam(run.meta.tid) : run.kind === 'boss' ? startBoss(run.meta.chapter.id) : startDaily();
$('home-btn').onclick = () => { renderHome(); show('screen-home'); };
$('brand').onclick = () => { if ($('screen-home').classList.contains('hidden') && !$('screen-task').classList.contains('hidden')) return $('quit').onclick(); renderHome(); show('screen-home'); };
$('daily-btn').onclick = startDaily;

loadContent().then(() => { renderStats(); renderHome(); show('screen-home'); })
  .catch(e => { $('map').innerHTML = `<p class="muted">Не удалось загрузить контент (${esc(e.message)}). Открой сайт через сервер, а не как файл.</p>`; });
