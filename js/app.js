/* Истори-тренажер, этап 1: без аккаунтов, прогресс в localStorage.
   Один файл, без сборки. Контент читается из content/<курс>/*.json. */

const COURSE = 'srednie-veka-6';
const ROUND = 10;               // вопросов за подход
const STORE_KEY = 'istoria-trainer-v1';

const $ = (id) => document.getElementById(id);
const shuffle = (a) => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

// ---------- хранилище ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* приватный режим — живем без сохранения */ }
}
const state = Object.assign({ topics: {}, streak: 0, lastDay: null, wrongIds: [] }, load());

function touchStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastDay === today) return;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak = state.lastDay === y ? state.streak + 1 : 1;
  state.lastDay = today;
  save(state);
}
function renderStreak() { $('streak').textContent = '🔥 ' + (state.streak || 0); }

// ---------- персонаж (временный, до выбора команды) ----------
// Три роли: optimist / panic / nerd. Пока это эмодзи и текст; потом сюда встанут SVG из assets/characters.
const CHAR = {
  optimist: { face: '😄', say: ['Да! Так и знал, что ты сможешь.', 'Это было красиво.', 'Еще одна дата в копилке.'] },
  panic:    { face: '😱', say: ['Все пропало... ладно, не все.', 'Я же говорил, что дата страшная!', 'Ох. Ну, давай еще раз.'] },
  nerd:     { face: '🤓', say: ['Вообще-то, тут есть нюанс:', 'Факт, который никто не просил:', 'Для протокола:'] },
};
function speak(role, text) {
  $('char-face').textContent = CHAR[role].face;
  const line = CHAR[role].say[Math.floor(Math.random() * CHAR[role].say.length)];
  $('char-say').textContent = text ? line + ' ' + text : line;
}

// ---------- данные ----------
let TOPICS = [], FACTS = [];
async function loadContent() {
  const [t, f] = await Promise.all([
    fetch(`content/${COURSE}/topics.json`).then(r => r.json()),
    fetch(`content/${COURSE}/facts.json`).then(r => r.json()),
  ]);
  TOPICS = t.topics; FACTS = f;
}

// ---------- экраны ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}

function renderTopics() {
  const list = $('topic-list');
  list.innerHTML = '';
  for (const t of TOPICS) {
    const facts = FACTS.filter(f => f.topic === t.id && f.type === 'дата');
    const prog = state.topics[t.id] || { best: 0, rounds: 0 };
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<div class="para">${t.paragraph} · ${t.block}</div>
      <div>${t.title}</div>
      <div class="count">${facts.length} дат${prog.rounds ? ` · <span class="done">лучший результат ${prog.best}/${Math.min(ROUND, facts.length)}</span>` : ''}</div>`;
    b.onclick = () => startRound(t);
    list.appendChild(b);
  }
}

// ---------- раунд ----------
let round = null;

function buildQuestion(fact, pool) {
  // Режим 1: событие → дата. Варианты — даты из того же параграфа, если хватает, иначе из всего курса.
  const sameTopic = pool.filter(f => f.id !== fact.id && f.date && f.date !== fact.date);
  const others = sameTopic.length >= 3 ? sameTopic : FACTS.filter(f => f.type === 'дата' && f.id !== fact.id && f.date !== fact.date);
  const distractors = shuffle([...new Set(others.map(f => f.date))]).slice(0, 3);
  return { fact, text: `Когда: ${fact.event}?`, options: shuffle([fact.date, ...distractors]), answer: fact.date };
}

function startRound(topic) {
  const pool = FACTS.filter(f => f.topic === topic.id && f.type === 'дата');
  // Ошибки прошлых раундов идут первыми — так работает повторение.
  const wrongFirst = pool.filter(f => state.wrongIds.includes(f.id));
  const rest = shuffle(pool.filter(f => !state.wrongIds.includes(f.id)));
  const picked = [...shuffle(wrongFirst), ...rest].slice(0, ROUND);
  round = { topic, qs: picked.map(f => buildQuestion(f, pool)), i: 0, score: 0 };
  touchStreak(); renderStreak();
  speak('nerd', `Параграф ${topic.paragraph}. ${picked.length} вопросов.`);
  show('screen-quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = round.qs[round.i];
  $('progress-bar').style.width = (round.i / round.qs.length * 100) + '%';
  $('question').textContent = q.text;
  $('feedback').classList.add('hidden');
  const box = $('options');
  box.innerHTML = '';
  for (const opt of q.options) {
    const b = document.createElement('button');
    b.className = 'opt'; b.textContent = opt;
    b.onclick = () => answer(b, opt);
    box.appendChild(b);
  }
}

function answer(btn, opt) {
  const q = round.qs[round.i];
  const ok = opt === q.answer;
  document.querySelectorAll('.opt').forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add('correct');
    else if (b === btn && !ok) b.classList.add('wrong');
  });
  const fb = $('feedback');
  fb.classList.remove('hidden', 'ok', 'bad');
  fb.classList.add(ok ? 'ok' : 'bad');
  const hook = q.fact.hook ? ` ${q.fact.hook}` : '';
  if (ok) {
    round.score++;
    state.wrongIds = state.wrongIds.filter(id => id !== q.fact.id);
    speak('optimist');
    $('feedback-text').textContent = `${q.fact.date} — ${q.fact.event}.${hook}`;
  } else {
    if (!state.wrongIds.includes(q.fact.id)) state.wrongIds.push(q.fact.id);
    speak('panic');
    $('feedback-text').textContent = `Правильно: ${q.fact.date}. ${q.fact.event}.${hook}`;
  }
  save(state);
}

function next() {
  round.i++;
  if (round.i >= round.qs.length) return finish();
  renderQuestion();
}

function finish() {
  $('progress-bar').style.width = '100%';
  const t = round.topic.id;
  const prev = state.topics[t] || { best: 0, rounds: 0 };
  state.topics[t] = { best: Math.max(prev.best, round.score), rounds: prev.rounds + 1 };
  save(state);
  const n = round.qs.length, s = round.score;
  $('result-title').textContent = s === n ? 'Все верно. Серьезно, все.' : s >= n * 0.7 ? `${s} из ${n}. Крепко.` : `${s} из ${n}. Ошибки запомнил, в следующий раз спрошу их первыми.`;
  $('result-text').textContent = `${round.topic.paragraph} · ${round.topic.title}`;
  show('screen-result');
}

// ---------- старт ----------
$('next-btn').onclick = next;
$('again-btn').onclick = () => startRound(round.topic);
$('home-btn').onclick = () => { renderTopics(); show('screen-topics'); };

loadContent().then(() => { renderStreak(); renderTopics(); show('screen-topics'); })
  .catch(e => { $('topic-list').innerHTML = `<p class="muted">Не удалось загрузить вопросы: ${e.message}. Открой сайт через сервер, а не как файл.</p>`; });
