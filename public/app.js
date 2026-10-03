import { api, isMock } from './api.js';
import { JUDGES, PERSONAS } from './judges.js';
import { readPdf, MAX_SLIDES } from './slides.js';
import { Recorder, warmUpMic, MAX_SECONDS, MAX_BYTES } from './recorder.js';
import * as voice from './voice.js';

const PITCH_SECONDS = 180;
const QA_SECONDS = 60;

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Runs fn once; later calls get the same result. A failure lets it run again.
function once(fn) {
  let promise;
  return () => (promise ??= fn().catch((e) => ((promise = null), Promise.reject(e))));
}

// ---- Settings, remembered in this browser ------------------------------------------

const SETTINGS_KEY = 'toughcrowd.settings';
const settings = loadSettings();

function loadSettings() {
  const defaults = { judges: ['business'], format: 'practice', answerMode: 'voice', voiceMode: 'eleven' };
  try {
    const saved = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
    saved.judges = PERSONAS.filter((p) => saved.judges?.includes(p));
    return saved;
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

// ---- Session state ------------------------------------------------------------------

const state = {
  source: 'pdf', // how the team told the judges: 'pdf', 'voice', 'form' or 'text'
  explaining: false, // an out-loud explanation is being transcribed
  reading: false, // a PDF is being read
  slides: [], // [{text, image}] from the PDF
  pdfReady: false,
  summary: '', // what the judges know; sent with every request
  answerMode: 'voice',
  rapid: false, // full judging round: no feedback until the end
  queue: [], // [{persona, question, followUp, attempts: [{transcript, result, pending}]}]
  index: 0,
  busy: false, // an answer is being sent
  timeUp: false,
  session: 0, // bumped whenever a session starts or ends, so stale work is ignored
  slideIndex: 0,
};

const recorder = new Recorder();
const timers = { pitch: 0, qa: 0 };
const current = () => state.queue[state.index];

// ---- Screens and small UI helpers ---------------------------------------------------

function show(name) {
  for (const screen of ['setup', 'pitch', 'table', 'results']) $(`screen-${screen}`).hidden = screen !== name;
  $('leave-btn').hidden = name === 'setup';
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(message, bad = false) {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast${bad ? ' bad' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 6000);
}

function working(message) {
  $('working').hidden = !message;
  if (message) $('working-msg').textContent = message;
}

// actions: [[label, onClick, primary?]]
function problem(message, actions = []) {
  $('problem').hidden = !message;
  if (!message) return;
  $('problem-msg').textContent = message;
  const box = $('problem-actions');
  box.replaceChildren(
    ...actions.map(([label, onClick, primary]) => {
      const b = document.createElement('button');
      b.className = `btn btn-sm ${primary ? 'btn-primary' : 'btn-ghost'}`;
      b.textContent = label;
      b.onclick = onClick;
      return b;
    }),
  );
}

// ---- 1. Setup -----------------------------------------------------------------------

const EXAMPLE = `ToughCrowd: practise for hackathon judging.
Problem: students freeze when judges ask hard questions, and nobody practises the Q&A.
Solution: upload your slides; AI judges read them and question you out loud with realistic voices. Answer out loud, then see feedback on what you said and how you said it: filler words, pace and long pauses.
Judges: an investor, a non-technical grandma, and a skeptical engineer.
How it works: a vision model reads the slides once; ElevenLabs speaks the questions and transcribes answers with word timings; our code counts fillers and pauses from the timings.
Built at StormHacks 2026 with plain JavaScript and Vercel serverless functions.`;

function initSetup() {
  $('mock-banner').hidden = !isMock;

  for (const tab of $$('[data-source]')) tab.onclick = () => setSource(tab.dataset.source);

  const dropzone = $('dropzone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  // A file dropped anywhere else would make Chrome open it and leave the page.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  $('pdf-input').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) handleFile(file);
  };
  for (const id of ['paste-text', 'summary-text', 'explain-text', ...FORM_FIELDS.map(([id]) => id)]) {
    $(id).oninput = updateStart;
  }
  $('explain-rec').onclick = toggleExplain;
  $('example-btn').onclick = () => {
    $('paste-text').value = EXAMPLE;
    updateStart();
  };

  renderJudgePicks();

  for (const radio of $$('input[name=format]')) {
    radio.checked = radio.value === settings.format;
    radio.onchange = () => {
      settings.format = radio.value;
      saveSettings();
    };
  }

  for (const group of $$('[data-setting]')) {
    const key = group.dataset.setting;
    const buttons = $$('button', group);
    const sync = () => buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === settings[key]));
    for (const b of buttons) {
      b.onclick = () => {
        settings[key] = b.dataset.value;
        saveSettings();
        sync();
      };
    }
    sync();
  }

  $('start-btn').onclick = startSession;
  updateStart();
}

const SOURCES = ['pdf', 'voice', 'form', 'text'];

function setSource(source) {
  if (explainRecorder.recording) return;
  state.source = source;
  for (const tab of $$('[data-source]')) tab.setAttribute('aria-selected', tab.dataset.source === source);
  for (const s of SOURCES) $(`source-${s}`).hidden = s !== source;
  $('summary-box').hidden = source !== 'pdf' || !state.pdfReady;
  updateStart();
}

// The "Describe it" boxes, in the order they go into the summary.
const FORM_FIELDS = [
  ['f-name', 'Project name'],
  ['f-what', 'What it does'],
  ['f-who', 'Who it is for'],
  ['f-how', 'How it works'],
  ['f-hard', 'Hardest part, or what they are proudest of'],
];

// What the judges know, from whichever way the team chose. Empty means not ready yet.
function currentSummary() {
  switch (state.source) {
    case 'pdf':
      return state.pdfReady ? $('summary-text').value.trim() : '';
    case 'voice': {
      const said = $('explain-text').value.trim();
      return said ? `The team explained their project out loud (no slides):\n${said}` : '';
    }
    case 'form': {
      if (!$('f-what').value.trim()) return '';
      const lines = FORM_FIELDS.map(([id, label]) => [label, $(id).value.trim()])
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}: ${value}`);
      return `The team described their project (no slides):\n${lines.join('\n')}`;
    }
    default:
      return $('paste-text').value.trim();
  }
}

const NEEDS = {
  pdf: 'Upload your slides, or tell the judges about your project another way.',
  voice: 'Record your explanation first.',
  form: 'Say what your project does first.',
  text: 'Paste a paragraph about your project first.',
};

function updateStart() {
  const hasSummary = currentSummary().length > 0;
  const hasJudges = settings.judges.length > 0;
  const busy = state.reading || state.explaining || explainRecorder.recording;
  $('start-btn').disabled = busy || !hasSummary || !hasJudges;
  $('start-hint').textContent = state.reading
    ? 'Wait for the judges to finish reading.'
    : busy
      ? 'Finish your explanation first.'
      : !hasSummary
        ? NEEDS[state.source]
        : !hasJudges
          ? 'Pick at least one judge.'
          : '';
}

// ---- "Explain out loud": record, transcribe, and let them fix the text ----

const EXPLAIN_SECONDS = 120;
const explainRecorder = new Recorder();

function explainMsg(text, kind = '') {
  const el = $('explain-msg');
  el.hidden = !text;
  el.className = `status-line ${kind}`;
  el.innerHTML = (kind === 'busy' ? DOTS : '') + esc(text);
}

function resetExplainUI() {
  const btn = $('explain-rec');
  btn.classList.remove('on');
  btn.disabled = state.explaining;
  btn.setAttribute('aria-label', 'Start explaining');
  $('explain-clock').textContent = '0:00';
  $('explain-clock').classList.remove('warn');
  $('explain-hint').textContent = $('explain-text').value.trim()
    ? 'Press the button to record again. This replaces the text below.'
    : "In about a minute, say what your project does, who it's for and how it works. Press the button to start.";
  for (const bar of $$('#explain-meter i')) bar.style.transform = '';
}

async function toggleExplain() {
  if (state.explaining) return;
  if (explainRecorder.recording) return stopExplain();
  const bars = $$('#explain-meter i');
  try {
    await explainRecorder.start({
      onTick: (s) => {
        $('explain-clock').textContent = fmtTime(s);
        $('explain-clock').classList.toggle('warn', s > EXPLAIN_SECONDS - 15);
        if (s >= EXPLAIN_SECONDS) stopExplain();
      },
      onLevel: (level) => showLevel(bars, level),
    });
  } catch {
    return explainMsg("Couldn't use your microphone. Allow it in Chrome's address bar, or describe your project in writing.", 'bad');
  }
  $('explain-rec').classList.add('on');
  $('explain-rec').setAttribute('aria-label', 'Stop recording');
  $('explain-hint').textContent = `Recording. Press again when you're done (${fmtTime(EXPLAIN_SECONDS)} max).`;
  explainMsg('');
  updateStart();
}

async function stopExplain() {
  if (state.explaining || !explainRecorder.recording) return;
  state.explaining = true;
  const { blob, seconds } = await explainRecorder.stop();
  resetExplainUI();
  updateStart();
  try {
    if (seconds < 3) throw new Error('That was too short. Take a minute to explain your project.');
    explainMsg('Writing down what you said…', 'busy');
    const { text } = await api.transcribe(blob);
    if (!text?.trim()) throw new Error("We couldn't hear anything. Check your microphone and try again.");
    $('explain-text').value = text.trim();
    $('explain-result').hidden = false;
    explainMsg(`Got it: ${fmtTime(seconds)} of explanation.`, 'ok');
  } catch (e) {
    explainMsg(e.message, 'bad');
  } finally {
    state.explaining = false;
    resetExplainUI();
    updateStart();
  }
}

function setSlidesMsg(text, kind = '') {
  const el = $('slides-msg');
  el.className = `status-line ${kind}`;
  el.innerHTML = (kind === 'busy' ? DOTS : '') + esc(text);
}

async function handleFile(file) {
  if (state.reading) return;
  const thumbs = $('thumbs');
  $('slides-status').hidden = false;
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    thumbs.replaceChildren();
    setSlidesMsg(
      `"${file.name}" isn't a PDF. Export your deck as a PDF (in Google Slides: File, Download, PDF) and drop that in.`,
      'bad',
    );
    return;
  }

  state.reading = true;
  state.pdfReady = false;
  state.slides = [];
  $('summary-box').hidden = true;
  thumbs.replaceChildren();
  thumbs.classList.add('reading');
  updateStart();
  try {
    setSlidesMsg('Opening your slides…', 'busy');
    const { slides, total, used } = await readPdf(file, (n, count, canvas) => {
      thumbs.append(canvas);
      setSlidesMsg(`Reading slide ${n} of ${count}…`, 'busy');
    });
    setSlidesMsg(`The judges are studying ${plural(used, 'slide')}, pictures included…`, 'busy');
    const summary = await api.slides(slides);
    state.slides = slides;
    $('summary-text').value = summary;
    state.pdfReady = true;
    $('summary-box').hidden = false;
    const skipped = total > used ? ` Only the first ${MAX_SLIDES} of ${total} are used.` : '';
    setSlidesMsg(`${file.name}: ${plural(used, 'slide')} read.${skipped}`, 'ok');
  } catch (e) {
    setSlidesMsg(`${e.message} You can also paste your slide text instead.`, 'bad');
  } finally {
    state.reading = false;
    thumbs.classList.remove('reading');
    updateStart();
  }
}

function renderJudgePicks() {
  const box = $('judge-picks');
  box.innerHTML = PERSONAS.map((p) => {
    const j = JUDGES[p];
    return `
      <label class="judge-pick">
        <input type="checkbox" value="${p}" ${settings.judges.includes(p) ? 'checked' : ''} />
        <img src="${j.img}" alt="" />
        <span class="jp-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <span class="jp-body">
          <strong>${esc(j.name)}</strong>
          <span class="jp-role">${esc(j.role)}</span>
          <q>${esc(j.sample)}</q>
        </span>
      </label>`;
  }).join('');
  for (const input of $$('input', box)) {
    input.onchange = () => {
      settings.judges = $$('input:checked', box).map((i) => i.value);
      saveSettings();
      updateStart();
    };
  }
}

async function startSession() {
  state.summary = currentSummary();
  state.rapid = settings.format === 'judging';
  state.answerMode = settings.answerMode;
  if (state.answerMode === 'voice') {
    try {
      await warmUpMic();
    } catch {
      state.answerMode = 'type';
      toast("Couldn't use your microphone, so you'll type your answers. Allow the mic in Chrome's address bar to speak them.", true);
    }
  }
  if (state.rapid) startPitch();
  else startQA();
}

function leave() {
  endSession();
  show('setup');
}

function endSession() {
  state.session++;
  voice.stop();
  if (recorder.recording) recorder.stop();
  clearInterval(timers.pitch);
  clearInterval(timers.qa);
}

// ---- 2. Pitch (full judging round) --------------------------------------------------

function startPitch() {
  endSession();
  show('pitch');
  state.slideIndex = 0;
  renderPitchSlide();
  $('pitch-clock').textContent = fmtTime(PITCH_SECONDS);
  $('pitch-clock').className = 'clock';
  $('pitch-bar').className = 'bar-fill';
  $('pitch-bar').style.transform = 'scaleX(1)';
  $('pitch-start').hidden = false;
  $('pitch-done').hidden = true;
}

function pitchSlides() {
  return state.source === 'pdf' ? state.slides : [];
}

function renderPitchSlide() {
  const slides = pitchSlides();
  const box = $('pitch-slide');
  if (!slides.length) {
    box.innerHTML = '<p class="no-slides">No slides to show, so pitch from memory. The judges have your notes.</p>';
    return;
  }
  box.innerHTML = `<img src="${slides[state.slideIndex].image}" alt="Slide ${state.slideIndex + 1} of ${slides.length}" />`;
}

function startPitchClock() {
  $('pitch-start').hidden = true;
  $('pitch-done').hidden = false;
  const session = state.session;
  const end = performance.now() + PITCH_SECONDS * 1000;
  timers.pitch = setInterval(() => {
    const left = (end - performance.now()) / 1000;
    const kind = left <= 0 ? ' over' : left <= 30 ? ' warn' : '';
    $('pitch-clock').textContent = fmtTime(left);
    $('pitch-clock').className = `clock${kind}`;
    $('pitch-bar').className = `bar-fill${kind}`;
    $('pitch-bar').style.transform = `scaleX(${Math.max(0, left / PITCH_SECONDS)})`;
    if (left <= 0) {
      clearInterval(timers.pitch);
      toast("Time! The judges have questions.");
      setTimeout(() => session === state.session && startQA(), 1500);
    }
  }, 200);
}

// ---- 3. The judging table -----------------------------------------------------------

function renderPanel() {
  $('panel').innerHTML = settings.judges
    .map(
      (p) => `
      <div class="seat" data-persona="${p}" data-state="idle">
        <div class="seat-portrait"><img src="${JUDGES[p].img}" alt="" /></div>
        <div class="seat-name">${esc(JUDGES[p].name)}</div>
        <div class="seat-state"></div>
      </div>`,
    )
    .join('');
}

const SEAT_LABEL = {
  thinking: `${DOTS} thinking`,
  speaking: 'asking',
  listening: 'listening',
  deliberating: `${DOTS} deliberating`,
  done: '',
};

// persona null means every judge at once.
function setSeats(persona, seatState) {
  for (const seat of $$('.seat')) {
    const on = persona === null || seat.dataset.persona === persona;
    seat.classList.toggle('active', on);
    seat.classList.toggle('recording', on && recorder.recording);
    seat.dataset.state = on ? seatState : 'idle';
    seat.querySelector('.seat-state').innerHTML = on ? SEAT_LABEL[seatState] : '';
  }
}

function clearTable() {
  for (const id of ['question-card', 'answer-voice', 'answer-type', 'working', 'problem', 'feedback']) $(id).hidden = true;
}

async function startQA() {
  endSession();
  const session = state.session;
  show('table');
  state.queue = [];
  state.index = 0;
  state.timeUp = false;
  state.busy = false;
  renderPanel();
  clearTable();
  $('qa-timer').hidden = true;
  setSeats(null, 'thinking');
  working('The judges are reading your slides and writing their questions…');

  const judges = [...settings.judges];
  const results = await Promise.allSettled(judges.map((p) => api.questions(state.summary, p)));
  if (session !== state.session) return;
  working(false);

  const lists = results.map((r, i) =>
    r.status === 'fulfilled' && Array.isArray(r.value)
      ? r.value
          .filter((q) => typeof q === 'string' && q.trim())
          .map((q) => ({ persona: judges[i], question: q.trim(), followUp: false, attempts: [] }))
      : [],
  );
  // Take turns: each judge's first question, then each judge's second, and so on.
  for (let round = 0; lists.some((l) => round < l.length); round++) {
    for (const list of lists) if (list[round]) state.queue.push(list[round]);
  }

  const failed = results.find((r) => r.status === 'rejected');
  if (!state.queue.length) {
    setSeats(null, 'done');
    problem(`The judges couldn't come up with questions. ${failed?.reason?.message ?? ''}`, [
      ['Try again', startQA, true],
      ...(isMock ? [] : [['Try with fake judges', () => (location.search = '?mock')]]),
      ['Back to setup', leave],
    ]);
    return;
  }
  if (failed) toast(`One of the judges couldn't make it: ${failed.reason.message}`, true);

  if (state.rapid) startQaClock();
  ask();
}

function startQaClock() {
  $('qa-timer').hidden = false;
  $('qa-clock').classList.remove('over');
  const end = performance.now() + QA_SECONDS * 1000;
  timers.qa = setInterval(() => {
    const left = (end - performance.now()) / 1000;
    const kind = left <= 0 ? ' over' : left <= 15 ? ' warn' : '';
    $('qa-clock').textContent = fmtTime(left);
    $('qa-clock').className = `clock-sm${kind}`;
    $('qa-bar').className = `bar-fill${kind}`;
    $('qa-bar').style.transform = `scaleX(${Math.max(0, left / QA_SECONDS)})`;
    if (left > 0) return;
    clearInterval(timers.qa);
    state.timeUp = true;
    const midAnswer = recorder.recording || (!$('answer-type').hidden && $('type-text').value.trim());
    if (midAnswer) toast("That's time! Finish your sentence and send it.");
    else finish();
  }, 200);
}

async function ask() {
  const item = current();
  if (!item) return finish();
  clearTable();
  $('q-who').innerHTML = esc(JUDGES[item.persona].name) + (item.followUp ? '<span class="q-follow">Follow-up</span>' : '');
  $('q-progress').textContent = `Question ${state.index + 1} of ${state.queue.length}`;
  $('q-text').textContent = item.question;
  const card = $('question-card');
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth; // restart the entrance animation
  card.style.animation = '';
  showAnswer();

  // Make the next question's audio while this one is being answered.
  const upcoming = state.queue[state.index + 1];
  if (upcoming) voice.prefetch(upcoming.question, upcoming.persona, settings.voiceMode);

  await speakItem(item);
}

async function speakItem(item) {
  setSeats(item.persona, 'thinking');
  try {
    await voice.speak(item.question, item.persona, settings.voiceMode, () => {
      if (!recorder.recording) setSeats(item.persona, 'speaking');
    });
  } catch (e) {
    toast(`The judge's voice didn't work: ${e.message} The question is written above.`, true);
  }
  if (current() === item && !state.busy && $('feedback').hidden) setSeats(item.persona, 'listening');
}

function showAnswer() {
  const speaking = state.answerMode === 'voice';
  $('answer-voice').hidden = !speaking;
  $('answer-type').hidden = speaking;
  resetRecordUI();
  if (!speaking) {
    $('type-text').value = '';
    $('type-text').focus({ preventScroll: true });
  }
}

async function switchAnswerMode(mode) {
  if (recorder.recording) return;
  if (mode === 'voice') {
    try {
      await warmUpMic();
    } catch {
      return toast("Couldn't use your microphone. Allow it in Chrome's address bar and try again.", true);
    }
  }
  state.answerMode = mode;
  showAnswer();
}

// ---- Recording ----

const METER_SHAPE = [0.45, 0.75, 1, 1.2, 1, 0.75, 0.45];

function showLevel(bars, level) {
  bars.forEach((bar, i) => {
    bar.style.transform = `scaleY(${Math.min(1, 0.12 + level * METER_SHAPE[i] * (0.8 + Math.random() * 0.4))})`;
  });
}

function resetRecordUI() {
  const btn = $('rec-btn');
  btn.classList.remove('on');
  btn.disabled = false;
  btn.setAttribute('aria-label', 'Start answering');
  $('rec-clock').textContent = '0:00';
  $('rec-clock').classList.remove('warn');
  $('rec-hint').textContent = 'Press the button or Space, then answer out loud.';
  for (const bar of $$('#meter i')) bar.style.transform = '';
}

async function toggleRecording() {
  if (state.busy || state.stopping) return;
  if (recorder.recording) return stopRecording();
  const item = current();
  if (!item) return;
  voice.stop();
  const bars = $$('#meter i');
  try {
    await recorder.start({
      onTick: (s) => {
        $('rec-clock').textContent = fmtTime(s);
        $('rec-clock').classList.toggle('warn', s > MAX_SECONDS - 20);
      },
      onLevel: (level) => showLevel(bars, level),
      onLimit: () => {
        toast("That's the 3-minute limit, so your answer was sent.");
        stopRecording();
      },
    });
  } catch {
    return toast("Couldn't start the microphone. Allow it in Chrome's address bar, or type instead.", true);
  }
  const btn = $('rec-btn');
  btn.classList.add('on');
  btn.setAttribute('aria-label', 'Stop and send your answer');
  $('rec-hint').textContent = "Recording. Press again when you're done.";
  setSeats(item.persona, 'listening');
}

async function stopRecording() {
  state.stopping = true;
  const { blob, seconds } = await recorder.stop();
  state.stopping = false;
  resetRecordUI();
  setSeats(current().persona, 'listening');
  if (seconds < 1.5) return toast('That was too short. Press the button, answer, then press it again.');
  if (blob.size > MAX_BYTES) return toast('That recording is too big to send. Keep answers under 3 minutes.', true);
  submit(once(() => api.transcribe(blob)));
}

// A typed answer gets the same shape as /api/transcribe's answer. durationSeconds 0
// means "typed": there's no pace or pauses to measure.
function typedTranscript(text) {
  const count = (word) => (text.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
  return {
    text,
    durationSeconds: 0,
    wordsPerMinute: 0,
    fillers: { um: count('u+m+'), uh: count('u+h+'), like: count('like') },
    longPauses: 0,
  };
}

// ---- Sending an answer ----

function submit(getTranscript) {
  const item = current();
  const session = state.session;
  const attempt = { transcript: null, result: null, pending: null };
  item.attempts.push(attempt);

  const run = async (onTranscribed) => {
    attempt.transcript = await getTranscript();
    onTranscribed?.();
    attempt.result = await api.feedback(state.summary, item.question, item.persona, attempt.transcript);
  };
  const drop = () => item.attempts.splice(item.attempts.indexOf(attempt), 1);

  if (state.rapid) {
    // Like the real thing: straight on to the next question, grades come at the end.
    attempt.pending = run().catch(drop);
    return next();
  }

  state.busy = true;
  $('answer-voice').hidden = true;
  $('answer-type').hidden = true;
  problem(false);
  setSeats(item.persona, 'deliberating');
  working(state.answerMode === 'voice' ? 'Listening back to your answer…' : `${JUDGES[item.persona].name} is reading your answer…`);
  attempt.pending = run(() => {
    if (session === state.session) working(`${JUDGES[item.persona].name} is deciding what to make of that…`);
  }).then(
    () => {
      if (session !== state.session) return;
      state.busy = false;
      working(false);
      renderFeedback(item);
    },
    (e) => {
      drop();
      if (session !== state.session) return;
      state.busy = false;
      working(false);
      setSeats(item.persona, 'listening');
      problem(e.message, [
        ['Send it again', () => submit(getTranscript), true],
        ['Answer again', () => (problem(false), showAnswer())],
      ]);
    },
  );
}

function next() {
  voice.stop();
  if (state.rapid && state.timeUp) return finish();
  state.index++;
  if (state.index >= state.queue.length) return finish();
  ask();
}

// ---- Feedback -----------------------------------------------------------------------

const clampScore = (n) => Math.min(10, Math.max(1, Math.round(Number(n) || 1)));
const scoreRating = (s) => (s >= 8 ? 'good' : s >= 5 ? 'ok' : 'bad');
const RATING_COLOR = { good: 'var(--green)', ok: 'var(--amber)', bad: 'var(--red)' };

function scoreRing(value, text = value) {
  const offset = (289 * (1 - value / 10)).toFixed(1);
  return `
    <div class="score" style="--offset:${offset};--score-color:${RATING_COLOR[scoreRating(value)]}" role="img" aria-label="Score ${text} out of 10">
      <svg viewBox="0 0 104 104" aria-hidden="true"><circle class="track" cx="52" cy="52" r="46" /><circle class="arc" cx="52" cy="52" r="46" /></svg>
      <span class="score-num">${text}<small>/10</small></span>
    </div>`;
}

function tile(label, value, note, rating) {
  return `
    <div class="tile ${rating}">
      <div class="tile-label">${label}</div>
      <div class="tile-value">${value}</div>
      <div class="tile-note">${note}</div>
    </div>`;
}

const AIM = 'Aim for 130 to 160.';
function paceTile(wpm) {
  wpm = Math.round(wpm);
  const [note, rating] =
    wpm < 110 ? [`Slow. ${AIM}`, 'bad']
    : wpm < 130 ? [`A little slow. ${AIM}`, 'ok']
    : wpm <= 160 ? ['Right in the zone.', 'good']
    : wpm <= 180 ? [`A little fast. ${AIM}`, 'ok']
    : [`Too fast. ${AIM}`, 'bad'];
  return tile('Pace', `${wpm}<small> wpm</small>`, note, rating);
}

function fillerTile(fillers, seconds) {
  const um = fillers?.um || 0;
  const uh = fillers?.uh || 0;
  const like = fillers?.like || 0;
  const total = um + uh + like;
  const perMinute = total / Math.max(seconds / 60, 0.5);
  const rating = total <= 1 || perMinute <= 2 ? 'good' : perMinute <= 5 ? 'ok' : 'bad';
  return tile('Filler words', total, `${um} um · ${uh} uh · ${like} like`, rating);
}

function pauseTile(pauses) {
  const rating = pauses <= 1 ? 'good' : pauses <= 3 ? 'ok' : 'bad';
  return tile('Long pauses', pauses, 'Gaps of 2 seconds or more', rating);
}

function lengthTile(seconds, note) {
  const [defaultNote, rating] =
    seconds <= 60 ? ['Short and sharp.', 'good']
    : seconds <= 90 ? ['Judges like under a minute.', 'ok']
    : ['Too long for a quick Q&A.', 'bad'];
  return tile('Length', fmtTime(seconds), note ?? defaultNote, rating);
}

function deliveryReport(t) {
  if (!t.durationSeconds) {
    return '<p class="report-note">You typed this answer, so there are no delivery numbers. Answer out loud to see filler words, pace and pauses.</p>';
  }
  return `<div class="report">
    ${fillerTile(t.fillers, t.durationSeconds)}
    ${paceTile(t.wordsPerMinute)}
    ${pauseTile(t.longPauses)}
    ${lengthTile(t.durationSeconds)}
  </div>`;
}

function highlightFillers(text) {
  return esc(text).replace(/\b(u+m+|u+h+|like)\b/gi, '<mark class="filler">$1</mark>');
}

function renderFeedback(item) {
  const { transcript, result } = item.attempts.at(-1);
  const score = clampScore(result.score);
  const previous = item.attempts.length > 1 ? clampScore(item.attempts.at(-2).result.score) : null;
  const isLast = state.index >= state.queue.length - 1 && !result.followUp;

  let delta = '';
  if (previous !== null) {
    const diff = score - previous;
    const kind = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
    delta = `<span class="fb-delta ${kind}">Before ${previous} → now ${score}${diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}</span>`;
  }

  const box = $('feedback');
  box.innerHTML = `
    <div class="fb-top">
      ${scoreRing(score)}
      <div class="fb-body">
        <p class="eyebrow">${esc(JUDGES[item.persona].name)}</p>
        <p class="fb-text">${esc(result.feedback)}</p>
        ${delta}
      </div>
    </div>
    ${deliveryReport(transcript)}
    <details class="transcript"${transcript.durationSeconds ? ' open' : ''}>
      <summary>What you said</summary>
      <p>${highlightFillers(transcript.text) || '<em>Nothing was heard.</em>'}</p>
    </details>
    ${result.followUp ? `<p class="follow-up"><span>Follow-up</span><q>${esc(result.followUp)}</q></p>` : ''}
    <div class="fb-actions">
      <button class="btn btn-ghost" data-act="retry">Try this one again</button>
      ${result.followUp ? '<button class="btn" data-act="follow-up">Answer the follow-up</button>' : ''}
      <button class="btn btn-primary" data-act="next">${isLast ? 'See results' : 'Next question'}</button>
    </div>`;
  box.hidden = false;
  setSeats(item.persona, 'done');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function onFeedbackAction(e) {
  const action = e.target.closest('[data-act]')?.dataset.act;
  const item = current();
  if (!action || !item) return;
  if (action === 'retry') {
    $('feedback').hidden = true;
    setSeats(item.persona, 'listening');
    showAnswer();
    $('question-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (action === 'follow-up') {
    const { followUp } = item.attempts.at(-1).result;
    state.queue.splice(state.index + 1, 0, { persona: item.persona, question: followUp, followUp: true, attempts: [] });
    next();
  } else if (action === 'next') {
    next();
  }
}

// ---- 4. Results ---------------------------------------------------------------------

async function finish() {
  const pending = state.queue.flatMap((i) => i.attempts.map((a) => a.pending)).filter(Boolean);
  endSession();
  const session = state.session;
  show('results');
  if (pending.length) {
    $('results').innerHTML = `<div class="working">${DOTS}<span>The judges are comparing notes…</span></div>`;
    await Promise.allSettled(pending);
    if (session !== state.session) return;
  }
  renderResults();
}

function renderResults() {
  const graded = (item) => item.attempts.filter((a) => a.result);
  const asked = state.queue.slice(0, state.index + 1);
  const answered = asked.filter((i) => graded(i).length);
  const actions = `
    <div class="cta-row">
      <button class="btn btn-primary btn-lg" data-act="again">Go again with new questions</button>
      <button class="btn btn-ghost" data-act="setup">Change slides or judges</button>
    </div>`;

  if (!answered.length) {
    $('results').innerHTML = `
      <div class="results-hero"><div><p class="eyebrow">Verdict</p><h1>No answers yet.</h1>
      <p>Answer at least one question to get a verdict.</p></div></div>${actions}`;
    return;
  }

  const latest = answered.map((i) => graded(i).at(-1));
  const average = latest.reduce((sum, a) => sum + clampScore(a.result.score), 0) / latest.length;
  const avgText = average.toFixed(1).replace(/\.0$/, '');
  const headline =
    average >= 8 ? 'The judges are impressed.'
    : average >= 6 ? 'Solid. A few answers to tighten.'
    : average >= 4 ? 'Getting there. Practise the weak ones.'
    : "Rough round. That's what practice is for.";

  const spoken = latest.map((a) => a.transcript).filter((t) => t.durationSeconds > 0);
  let totals = '';
  if (spoken.length) {
    const seconds = spoken.reduce((s, t) => s + t.durationSeconds, 0);
    const sum = (key) => spoken.reduce((s, t) => s + (t.fillers?.[key] || 0), 0);
    const wpm = spoken.reduce((s, t) => s + t.wordsPerMinute * t.durationSeconds, 0) / seconds;
    const pauses = spoken.reduce((s, t) => s + (t.longPauses || 0), 0);
    totals = `<div class="totals">
      ${fillerTile({ um: sum('um'), uh: sum('uh'), like: sum('like') }, seconds)}
      ${paceTile(wpm)}
      ${pauseTile(pauses)}
      ${lengthTile(seconds, `Speaking, over ${plural(spoken.length, 'answer')}`)}
    </div>`;
  }

  const rows = asked
    .map((item) => {
      const j = JUDGES[item.persona];
      const tries = graded(item);
      const who = `${esc(j.name)}${item.followUp ? ' · follow-up' : ''}`;
      if (!tries.length) {
        return `<li class="result skipped"><img src="${j.img}" alt="" /><div>
          <div class="result-who">${who}</div><p class="result-q">${esc(item.question)}</p>
          <p class="result-fb">Not answered.</p></div><div></div></li>`;
      }
      const { transcript: t, result } = tries.at(-1);
      const score = clampScore(result.score);
      const stats = t.durationSeconds
        ? `${plural((t.fillers?.um || 0) + (t.fillers?.uh || 0) + (t.fillers?.like || 0), 'filler')} · ${Math.round(t.wordsPerMinute)} wpm · ${plural(t.longPauses || 0, 'long pause')} · ${fmtTime(t.durationSeconds)}`
        : 'Typed answer';
      const first = tries.length > 1 ? `<small>first try ${clampScore(tries[0].result.score)}</small>` : '<small>/10</small>';
      return `<li class="result"><img src="${j.img}" alt="" /><div>
          <div class="result-who">${who}</div>
          <p class="result-q">${esc(item.question)}</p>
          <p class="result-fb">${esc(result.feedback)}</p>
          <div class="result-stats">${stats}</div></div>
          <div class="result-score ${scoreRating(score)}">${score}${first}</div></li>`;
    })
    .join('');

  $('results').innerHTML = `
    <div class="results-hero">
      ${scoreRing(average, avgText)}
      <div>
        <p class="eyebrow">Verdict</p>
        <h1>${headline}</h1>
        <p>Average score over ${plural(answered.length, 'answer')} from ${plural(new Set(answered.map((i) => i.persona)).size, 'judge')}.</p>
      </div>
    </div>
    ${totals}
    <ol class="result-list">${rows}</ol>
    ${actions}`;
}

function onResultsAction(e) {
  const action = e.target.closest('[data-act]')?.dataset.act;
  if (action === 'again') startSession();
  else if (action === 'setup') leave();
}

// ---- Wiring -------------------------------------------------------------------------

function initTable() {
  $('rec-btn').onclick = toggleRecording;
  $('replay-btn').onclick = () => {
    const item = current();
    if (item && !recorder.recording) speakItem(item);
  };
  for (const b of $$('[data-switch]')) b.onclick = () => switchAnswerMode(b.dataset.switch);
  $('answer-type').onsubmit = (e) => {
    e.preventDefault();
    const text = $('type-text').value.trim();
    if (text && !state.busy) submit(async () => typedTranscript(text));
  };
  $('type-text').onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('answer-type').requestSubmit();
  };
  $('feedback').onclick = onFeedbackAction;
  $('results').onclick = onResultsAction;
  $('end-btn').onclick = finish;
  $('leave-btn').onclick = leave;
  $('pitch-start').onclick = startPitchClock;
  $('pitch-done').onclick = startQA;

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('textarea, input, select, button, summary, a')) return;
    if (!$('screen-pitch').hidden) {
      const slides = pitchSlides();
      const step = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[e.key];
      if (step && slides.length) {
        e.preventDefault();
        state.slideIndex = Math.min(slides.length - 1, Math.max(0, state.slideIndex + step));
        renderPitchSlide();
      }
    } else if (!$('screen-table').hidden && e.key === ' ' && !$('answer-voice').hidden) {
      e.preventDefault();
      toggleRecording();
    }
  });
}

initSetup();
initTable();
