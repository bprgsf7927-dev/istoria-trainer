/* Истори-тренажер, этап 1b.
   Уроки по 8 заданий, шесть механик, подготовка к контрольной уровнями, микс дня.
   Без сборки и без аккаунтов: прогресс в localStorage (схема v2). */

const COURSE = 'srednie-veka-6';
const LESSON_LEN = 8;
const STORE_KEY = 'istoria-trainer-v2';
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
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old) return { v: 2, streak: old.streak || 0, lastDay: old.lastDay || null, wrong: old.wrongIds || [] };
  } catch { /* нет доступа к хранилищу — работаем в памяти */ }
  return {};
}
const state = Object.assign({ v: 2, xp: 0, streak: 0, lastDay: null, wrong: [], seen: {}, lessons: {}, exams: {}, moreClicks: 0 }, loadState());
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

// ---------- главный экран ----------
function lessonBest(id) { return (state.lessons[id] || {}).best || 0; }
function examLevel(ch) { return state.exams[ch] || {}; }

function renderHome() {
  const box = $('home-list');
  box.innerHTML = '';
  const dailyPool = dailyFacts();
  $('daily').classList.toggle('hidden', dailyPool.length < 3);

  for (const ch of D.topics.chapters) {
    const h = document.createElement('h2');
    h.className = 'chapter';
    h.textContent = `Глава ${ch.id}. ${ch.title}`;
    box.appendChild(h);

    for (const tid of ch.topics) {
      const t = D.topicById[tid];
      const lessons = D.lessons.filter(l => l.topic === tid);
      const wrap = document.createElement('div');
      wrap.className = 'topic';
      wrap.innerHTML = `<div class="topic-head"><span class="para">${esc(t.paragraph)}</span> ${esc(t.title)}</div>`;
      const list = document.createElement('div');
      list.className = 'cards';
      lessons.forEach((l, i) => {
        const best = lessonBest(l.id);
        const b = document.createElement('button');
        b.className = 'card lesson' + (best === LESSON_LEN ? ' done' : '');
        b.innerHTML = `<div class="lesson-title">Урок ${i + 1}. ${esc(l.title)}</div>
          <div class="small muted">${l.factIds.length} дат · ${best ? `лучший ${best}/${LESSON_LEN}` : 'не пройден'}${best === LESSON_LEN ? ' ✓' : ''}</div>`;
        b.onclick = () => openCards(l);
        list.appendChild(b);
      });
      wrap.appendChild(list);
      box.appendChild(wrap);
    }

    // подготовка к контрольной по главе
    const ex = examLevel(ch.id);
    const exam = document.createElement('div');
    exam.className = 'exam';
    const l1 = ex.l1 || 0, l2 = ex.l2 || 0, l3 = ex.l3 || 0;
    const open2 = l1 >= 70, open3 = l2 >= 70;
    exam.innerHTML = `<div class="exam-head">🎯 Контрольная по главе ${ch.id}${ex.badge ? ' · 🏅 закрыта' : ''}</div>
      <div class="levels">
        <button class="level" data-ch="${ch.id}" data-lv="1"><b>1. Разминка</b><span>пары и правда-ложь · 10</span><em>${l1 ? l1 + '%' : ''}</em></button>
        <button class="level" data-ch="${ch.id}" data-lv="2" ${open2 ? '' : 'disabled'}><b>2. Как учитель спросит</b><span>порядок, вставка, выбор · 10</span><em>${open2 ? (l2 ? l2 + '%' : '') : '🔒 70% на уровне 1'}</em></button>
        <button class="level" data-ch="${ch.id}" data-lv="3" ${open3 ? '' : 'disabled'}><b>3. Босс</b><span>напечатать с клавиатуры · 8 · две жизни</span><em>${open3 ? (l3 ? l3 + '%' : '') : '🔒 70% на уровне 2'}</em></button>
      </div>`;
    exam.querySelectorAll('.level').forEach(b => b.onclick = () => startExam(b.dataset.ch, +b.dataset.lv));
    box.appendChild(exam);
  }
}

// ---------- карточки перед уроком ----------
let cards = null;
function openCards(lesson) {
  cards = { lesson, i: 0, flipped: false, facts: lesson.factIds.map(id => D.factById[id]) };
  $('cards-title').textContent = lesson.title;
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
$('cards-start').onclick = () => startLesson(cards.lesson);
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

function tPairs(facts) {
  const set = pick(facts, Math.min(4, facts.length));
  let left = null, mistakes = 0, done = 0;
  return {
    kind: 'pairs', answerText: set.map(f => `${f.date} — ${f.event}`).join('; '),
    render(el) {
      el.innerHTML = `<h2>Соедини пары</h2><div class="pairs">
        <div class="col">${shuffle(set).map(f => `<button class="pair" data-id="${f.id}" data-side="l">${esc(f.date)}</button>`).join('')}</div>
        <div class="col">${shuffle(set).map(f => `<button class="pair" data-id="${f.id}" data-side="r">${esc(f.event)}</button>`).join('')}</div></div>`;
      el.querySelectorAll('.pair').forEach(b => b.onclick = () => {
        if (b.classList.contains('matched')) return;
        if (!left || left.dataset.side === b.dataset.side) { el.querySelectorAll('.pair').forEach(x => x.classList.remove('sel')); left = b; b.classList.add('sel'); return; }
        if (left.dataset.id === b.dataset.id) {
          [left, b].forEach(x => { x.classList.remove('sel'); x.classList.add('matched'); });
          if (++done === set.length) finishTask(mistakes === 0, mistakes <= 1);
        } else {
          mistakes++;
          [left, b].forEach(x => x.classList.add('shake'));
          setTimeout(() => el.querySelectorAll('.pair').forEach(x => x.classList.remove('shake', 'sel')), 400);
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

// ---------- сборка урока / уровня / микса ----------
function buildLesson(lesson) {
  const facts = lesson.factIds.map(id => D.factById[id]);
  const topicFacts = D.facts.filter(f => f.topic === lesson.topic);
  const terms = byTopics(D.terms, [lesson.topic]), persons = byTopics(D.persons, [lesson.topic]);
  const causes = byTopics(D.causes, [lesson.topic]), cloze = byTopics(D.cloze, [lesson.topic]), tf = byTopics(D.truefalse, [lesson.topic]);
  // ошибки прошлых раундов — первыми
  const ordered = [...facts.filter(f => state.wrong.includes(f.id)), ...shuffle(facts.filter(f => !state.wrong.includes(f.id)))];
  let fi = 0; const nextFact = () => ordered[fi++ % ordered.length];
  const plan = ['pairs', 'choice', 'order', 'cloze', 'tf', 'type', 'pairs', 'choice'];
  const tasks = [];
  const usedTf = new Set(), usedCloze = new Set();
  for (const kind of plan) {
    if (kind === 'pairs' && facts.length >= 3) tasks.push(tPairs(facts.length >= 4 ? facts : topicFacts));
    else if (kind === 'order' && yearFacts(topicFacts).length >= 4) tasks.push(tOrder(yearFacts(facts).length >= 4 ? facts : topicFacts));
    else if (kind === 'cloze' && cloze.some(c => !usedCloze.has(c.id))) { const c = pick(cloze.filter(c => !usedCloze.has(c.id)), 1)[0]; usedCloze.add(c.id); tasks.push(tCloze(c)); }
    else if (kind === 'tf' && tf.some(s => !usedTf.has(s.id))) { const s = pick(tf.filter(s => !usedTf.has(s.id)), 1)[0]; usedTf.add(s.id); tasks.push(tTrueFalse(s)); }
    else if (kind === 'type' && yearFacts(facts).length) tasks.push(tType(pick(yearFacts(facts), 1)[0]));
    else {
      // выбор: дата, или термин / персона / причина — чтобы урок не был только про даты
      const r = Math.random();
      if (r < 0.55 || (!terms.length && !persons.length && !causes.length)) tasks.push(tChoiceDate(nextFact(), topicFacts.length >= 4 ? topicFacts : D.facts));
      else if (r < 0.75 && terms.length >= 4) tasks.push(tChoiceTerm(pick(terms, 1)[0], D.terms));
      else if (r < 0.9 && persons.length >= 2) tasks.push(tChoicePerson(pick(persons, 1)[0], D.persons));
      else if (causes.length) tasks.push(tCause(pick(causes, 1)[0]));
      else tasks.push(tChoiceDate(nextFact(), D.facts));
    }
  }
  return tasks.slice(0, LESSON_LEN);
}

function buildExam(chapter, level) {
  const topics = chapter.topics;
  const facts = byTopics(D.facts, topics), yf = yearFacts(facts);
  const tf = byTopics(D.truefalse, topics), cloze = byTopics(D.cloze, topics), terms = byTopics(D.terms, topics), persons = byTopics(D.persons, topics), causes = byTopics(D.causes, topics);
  const tasks = [];
  if (level === 1) {
    const tfs = pick(tf, 5);
    for (let i = 0; i < 10; i++) tasks.push(i % 2 === 0 ? tPairs(pick(facts, 6)) : tTrueFalse(tfs[(i - 1) / 2]));
  } else if (level === 2) {
    const cl = pick(cloze, 3), cs = pick(causes, 2);
    const plan = ['order', 'cloze', 'choice', 'cause', 'order', 'cloze', 'choice', 'cause', 'cloze', 'choice'];
    let ci = 0, ca = 0;
    for (const k of plan) {
      if (k === 'order') tasks.push(tOrder(pick(yf, 7)));
      else if (k === 'cloze') tasks.push(tCloze(cl[ci++ % cl.length]));
      else if (k === 'cause') tasks.push(tCause(cs[ca++ % cs.length]));
      else { const r = Math.random(); tasks.push(r < 0.4 ? tChoiceDate(pick(facts, 1)[0], facts) : r < 0.7 ? tChoiceTerm(pick(terms, 1)[0], D.terms) : tChoicePerson(pick(persons, 1)[0], D.persons)); }
    }
  } else {
    for (const f of pick(yf, 8)) tasks.push(tType(f));
  }
  return tasks;
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
  run = { kind, tasks, i: 0, score: 0, hearts: kind === 'exam' && meta.level === 3 ? 2 : null, meta, xp: 0 };
  touchStreak(); renderStats();
  $('hearts').classList.toggle('hidden', run.hearts === null);
  speak('neutral', meta.intro || '');
  show('screen-task');
  renderTask();
}
function startLesson(l) { startRun('lesson', buildLesson(l), { lesson: l, intro: `${l.title}. ${LESSON_LEN} заданий.` }); }
function startExam(chId, level) {
  const ch = D.topics.chapters.find(c => c.id === chId);
  startRun('exam', buildExam(ch, level), { chapter: ch, level, intro: level === 3 ? 'Босс. Две жизни, без вариантов.' : `Глава ${ch.id}, уровень ${level}.` });
}
function startDaily() { startRun('daily', buildDaily(), { intro: 'Микс дня: то, что подзабылось.' }); }

function renderHearts() { if (run.hearts !== null) $('hearts').textContent = '❤️'.repeat(run.hearts) + '🖤'.repeat(2 - run.hearts); }
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
    $('feedback-text').textContent = `${t.answerText}.${hook}`;
    if (t.fact) state.wrong = state.wrong.filter(id => id !== t.fact.id);
  } else {
    if (half) { run.score += 0.5; run.xp += XP_PER_TASK / 2; speak('nerd', 'Почти. Ошибка на один год — засчитываю половину.'); }
    else speak('panic');
    $('feedback-text').textContent = `Правильно: ${t.answerText}.`;
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
  if (run.kind === 'lesson') {
    const id = run.meta.lesson.id, prev = state.lessons[id] || { best: 0, rounds: 0 };
    state.lessons[id] = { best: Math.max(prev.best, Math.floor(s)), rounds: prev.rounds + 1 };
    title = s === n ? 'Все верно. Серьезно, все.' : s >= n * 0.7 ? `${s} из ${n}. Крепко.` : `${s} из ${n}. Ошибки запомнил, спрошу их первыми.`;
    text = run.meta.lesson.title;
    face = s === n ? '🏆' : s >= n * 0.7 ? '😄' : '🤓';
  } else if (run.kind === 'exam') {
    const ch = run.meta.chapter.id, lv = run.meta.level, ex = state.exams[ch] || {};
    if (lost) { title = 'Жизни кончились.'; text = `Босс устоял. Прошел ${run.i} из ${n}. Еще раз?`; face = '😱'; }
    else {
      ex['l' + lv] = Math.max(ex['l' + lv] || 0, pct);
      if (lv === 3 && pct >= 70) ex.badge = true;
      title = pct >= 70 ? (lv === 3 ? 'Глава закрыта. 🏅' : `Уровень ${lv} пройден: ${pct}%`) : `${pct}%. Нужно 70, чтобы открыть следующий.`;
      text = `Глава ${ch}. ${run.meta.chapter.title}`;
      face = pct >= 70 ? '🏆' : '🤓';
    }
    state.exams[ch] = ex;
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
$('again-btn').onclick = () => run.kind === 'lesson' ? startLesson(run.meta.lesson) : run.kind === 'exam' ? startExam(run.meta.chapter.id, run.meta.level) : startDaily();
$('home-btn').onclick = () => { renderHome(); show('screen-home'); };
$('brand').onclick = () => { if ($('screen-home').classList.contains('hidden') && !$('screen-task').classList.contains('hidden')) return $('quit').onclick(); renderHome(); show('screen-home'); };
$('daily-btn').onclick = startDaily;

loadContent().then(() => { renderStats(); renderHome(); show('screen-home'); })
  .catch(e => { $('home-list').innerHTML = `<p class="muted">Не удалось загрузить контент (${esc(e.message)}). Открой сайт через сервер, а не как файл.</p>`; });
