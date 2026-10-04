import { api, isMock, onPasscodeNeeded } from './api.js';
import { JUDGES, PERSONAS, CUSTOM_IMG, OCCASIONS, DIFFICULTY } from './judges.js';
import { readPdf, MAX_SLIDES } from './slides.js';
import { Recorder, warmUpMic, MAX_SECONDS, MAX_BYTES } from './recorder.js';
import * as voice from './voice.js';

const PITCH_EXTRA_SECONDS = 60; // keep recording a little past the pitch time
const PITCH_BITS_PER_SECOND = 24000; // up to 15 minutes of pitch still fits under 4 MB

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

// ---- Remembered in this browser: settings, your own judges, past sessions ----------

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Judges the person made: [{id, name, description, voice}], voice being a built-in judge.
const CUSTOM_KEY = 'toughcrowd.judges';
let customJudges = load(CUSTOM_KEY, []).filter((j) => j?.id && j.name && j.description && JUDGES[j.voice]);
const saveCustomJudges = () => store(CUSTOM_KEY, customJudges);

const SETTINGS_KEY = 'toughcrowd.settings';
const settings = loadSettings();

function loadSettings() {
  const defaults = {
    judges: ['business'],
    occasion: 'hackathon',
    difficulty: 3,
    perJudge: '3',
    format: 'practice',
    pitchMin: OCCASIONS.hackathon.pitch,
    qaMin: OCCASIONS.hackathon.qa,
    answerMode: 'voice',
    voiceMode: 'eleven',
    interrupts: 'off',
    conversation: 'on', // judges follow up until they're satisfied
    occasionText: '', // describes the occasion when it's "Something else"
  };
  const saved = { ...defaults, ...load(SETTINGS_KEY, {}) };
  saved.judges = (saved.judges ?? []).filter((id) => judgeById(id));
  if (!OCCASIONS[saved.occasion]) saved.occasion = defaults.occasion;
  saved.difficulty = Math.min(5, Math.max(1, Math.round(Number(saved.difficulty)) || 3));
  return saved;
}

const saveSettings = () => store(SETTINGS_KEY, settings);

// What the occasion is called: its label, or what the person wrote for "Something else".
function occasionLabel(setting, description) {
  return setting === 'custom' ? description || 'Something else' : OCCASIONS[setting]?.label ?? 'Practice';
}

// Everything about a judge, built-in or the person's own. `persona` and `custom` are what
// the server is told; `voice` is the built-in judge whose voice they speak with.
function judgeById(id) {
  if (JUDGES[id]) return { ...JUDGES[id], id, persona: id, voice: id, custom: null };
  const mine = customJudges.find((j) => j.id === id);
  if (!mine) return null;
  return {
    id,
    name: mine.name,
    role: 'Your own judge',
    sample: mine.description,
    img: CUSTOM_IMG,
    interrupt: "Sorry, let me stop you there. What's the short version?",
    ack: 'Mm, okay.',
    persona: 'custom',
    voice: mine.voice,
    custom: { name: mine.name, description: mine.description },
  };
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
  judges: [], // judge ids for this session
  scene: { difficulty: 3, setting: 'hackathon' }, // sent with questions and feedback
  pitchSeconds: 180,
  qaSeconds: 60,
  rapid: false, // full run-through: no feedback until the end
  conversation: false, // judges follow up until satisfied (Q&A practice only)
  queue: [], // [{judge (id), question, followUp, attempts: [{transcript, result, pending}]}]
  index: 0,
  busy: false, // an answer is being sent
  timeUp: false,
  session: 0, // bumped whenever a session starts or ends, so stale work is ignored
  slideIndex: 0,
  slideCount: 0, // how many slides were read, so a refresh can still say so
  slidesName: '',
  recorded: false, // this session's score is already in the history
  qaEndsAt: 0, // wall-clock end of the Q&A, so a refresh can keep the clock honest
  setupRestored: false, // don't save the setup over what was kept until it's been read back
};

const recorder = new Recorder();
const pitchRecorder = new Recorder();
const timers = { pitch: 0, qa: 0 };
const current = () => state.queue[state.index];
const judgeOf = (item) => judgeById(item.judge);
// The question being answered now: a follow-up, in a back-and-forth.
const questionNow = (item) => item.thread?.question ?? item.question;

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
  initCustomJudgeForm();
  initScene();
  renderHistory();

  for (const radio of $$('input[name=format]')) {
    radio.checked = radio.value === settings.format;
    radio.onchange = () => {
      settings.format = radio.value;
      saveSettings();
      $('lengths').hidden = settings.format !== 'judging';
    };
  }
  $('lengths').hidden = settings.format !== 'judging';

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
  $('history-clear').onclick = () => {
    store(HISTORY_KEY, []);
    renderHistory();
  };
  restoreSetup();
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
  const hasOccasion = settings.occasion !== 'custom' || settings.occasionText.trim().length > 0;
  const busy = state.reading || state.explaining || explainRecorder.recording;
  $('start-btn').disabled = busy || !hasSummary || !hasJudges || !hasOccasion;
  $('start-hint').textContent = state.reading
    ? 'Wait for the judges to finish reading.'
    : busy
      ? 'Finish your explanation first.'
      : !hasSummary
        ? NEEDS[state.source]
        : !hasJudges
          ? 'Pick at least one judge.'
          : !hasOccasion
            ? "Say what you're practising for in step 3."
            : '';
  saveSetup();
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
    state.slideCount = used;
    state.slidesName = file.name;
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

function allJudgeIds() {
  return [...PERSONAS, ...customJudges.map((j) => j.id)];
}

function renderJudgePicks() {
  const box = $('judge-picks');
  const cards = allJudgeIds().map((id) => {
    const j = judgeById(id);
    const remove = j.custom
      ? `<button type="button" class="jp-remove" data-remove="${id}" aria-label="Remove ${esc(j.name)}">Remove</button>`
      : '';
    return `
      <label class="judge-pick">
        <input type="checkbox" value="${id}" ${settings.judges.includes(id) ? 'checked' : ''} />
        <img src="${j.img}" alt="" />
        ${remove}
        <span class="jp-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <span class="jp-body">
          <strong>${esc(j.name)}</strong>
          <span class="jp-role">${esc(j.role)}</span>
          <q>${esc(j.sample)}</q>
        </span>
      </label>`;
  });
  cards.push(`
    <button type="button" class="judge-add" id="judge-add">
      <span class="plus" aria-hidden="true">+</span>
      Make your own judge
    </button>`);
  box.innerHTML = cards.join('');
  for (const input of $$('input', box)) {
    input.onchange = () => {
      settings.judges = $$('input:checked', box).map((i) => i.value);
      saveSettings();
      updateStart();
    };
  }
  for (const b of $$('[data-remove]', box)) {
    b.onclick = (e) => {
      e.preventDefault(); // don't also tick the card
      customJudges = customJudges.filter((j) => j.id !== b.dataset.remove);
      settings.judges = settings.judges.filter((id) => id !== b.dataset.remove);
      saveCustomJudges();
      saveSettings();
      renderJudgePicks();
      updateStart();
    };
  }
  $('judge-add').onclick = () => {
    $('custom-judge').hidden = false;
    $('cj-name').focus();
  };
}

function initCustomJudgeForm() {
  $('cj-voice').innerHTML = PERSONAS.map(
    (p) => `<option value="${p}">Like ${esc(JUDGES[p].name.replace(/^The /, 'the '))}</option>`,
  ).join('');
  const form = $('custom-judge');
  const close = () => {
    form.reset();
    form.hidden = true;
  };
  $('cj-cancel').onclick = close;
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = $('cj-name').value.trim();
    const description = $('cj-desc').value.trim();
    if (!name || !description) return;
    const id = `custom-${Date.now().toString(36)}`;
    customJudges.push({ id, name, description, voice: $('cj-voice').value });
    settings.judges.push(id);
    saveCustomJudges();
    saveSettings();
    close();
    renderJudgePicks();
    updateStart();
  };
}

// ---- Set the scene: what for, how tough, how many questions ----

function initScene() {
  $('occasion-picks').innerHTML = Object.entries(OCCASIONS)
    .map(([key, o]) => `<button type="button" role="radio" data-occasion="${key}">${esc(o.label)}</button>`)
    .join('');
  for (const b of $$('[data-occasion]')) {
    b.onclick = () => {
      settings.occasion = b.dataset.occasion;
      // A new occasion brings its usual lengths.
      settings.pitchMin = OCCASIONS[settings.occasion].pitch;
      settings.qaMin = OCCASIONS[settings.occasion].qa;
      saveSettings();
      syncScene();
      if (settings.occasion === 'custom') $('occasion-text').focus();
    };
  }

  $('occasion-text').value = settings.occasionText;
  $('occasion-text').oninput = () => {
    settings.occasionText = $('occasion-text').value;
    saveSettings();
    updateStart();
  };

  // The slider glides while you drag it and snaps to the nearest level when you let go.
  // The arrow keys move one level at a time.
  const slider = $('difficulty');
  slider.value = settings.difficulty;
  const setLevel = (level, snap) => {
    settings.difficulty = Math.min(5, Math.max(1, level));
    if (snap) slider.value = settings.difficulty;
    saveSettings();
    syncScene();
  };
  slider.oninput = () => setLevel(Math.round(Number(slider.value)), false);
  slider.onchange = () => setLevel(Math.round(Number(slider.value)), true);
  slider.onkeydown = (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    setLevel(settings.difficulty + step, true);
  };

  for (const [id, key] of [
    ['pitch-min', 'pitchMin'],
    ['qa-min', 'qaMin'],
  ]) {
    $(id).onchange = () => {
      settings[key] = Math.min(15, Math.max(1, Math.round(Number($(id).value)) || 1));
      saveSettings();
      syncScene();
    };
  }
  syncScene();
}

function syncScene() {
  for (const b of $$('[data-occasion]')) b.setAttribute('aria-checked', b.dataset.occasion === settings.occasion);
  $('occasion-custom').hidden = settings.occasion !== 'custom';
  updateStart();
  const level = DIFFICULTY[settings.difficulty];
  $('difficulty').setAttribute('aria-valuetext', level.name);
  $('difficulty-name').textContent = level.name;
  $('difficulty-blurb').textContent = level.blurb;
  $('pitch-min').value = settings.pitchMin;
  $('qa-min').value = settings.qaMin;
  $('format-full-text').textContent =
    `A ${settings.pitchMin}-minute pitch on a timer, then ${plural(settings.qaMin, 'minute')} of ` +
    'rapid-fire questions. Feedback at the end, like the real thing.';
  $('conversation-hint').textContent =
    'With follow-ups until satisfied, each judge keeps asking until they like your answer ' +
    `(up to ${plural(maxFollowUps(settings.difficulty), 'follow-up')} at this difficulty), then tells you what ` +
    'they thought, out loud. The run-through stays one question each, to keep it quick.';
  const [practice, rapid] = interruptTimes(settings.difficulty);
  $('interrupt-hint').textContent =
    `With interruptions on, a judge cuts in when a spoken answer runs past ${practice} seconds ` +
    `(${rapid} in the run-through), and you get ${WRAP_UP_SECONDS} seconds to wrap up. ` +
    'Tougher judges cut in sooner.';
}

async function startSession() {
  forget(SESSION_KEY);
  state.recorded = false;
  state.summary = currentSummary();
  state.judges = settings.judges.filter((id) => judgeById(id));
  state.scene = { difficulty: settings.difficulty, setting: settings.occasion };
  if (settings.occasion === 'custom') state.scene.settingDescription = settings.occasionText.trim();
  state.pitchSeconds = settings.pitchMin * 60;
  state.qaSeconds = settings.qaMin * 60;
  state.rapid = settings.format === 'judging';
  state.conversation = settings.conversation === 'on' && !state.rapid;
  state.answerMode = settings.answerMode;
  if (state.answerMode === 'voice') {
    try {
      await warmUpMic();
    } catch {
      state.answerMode = 'type';
      toast("Couldn't use your microphone, so you'll type your answers. Allow the mic in Chrome's address bar to speak them.", true);
    }
  }
  state.pitch = null; // {seconds, transcript, error, pending} once a pitch is recorded
  if (state.rapid) startPitch();
  else startQA();
}

function leave() {
  endSession();
  forget(SESSION_KEY);
  renderHistory();
  show('setup');
}

function endSession() {
  state.session++;
  voice.stop();
  if (recorder.recording) recorder.stop();
  if (pitchRecorder.recording) pitchRecorder.stop(); // left mid-pitch: throw it away
  clearInterval(timers.pitch);
  clearInterval(timers.qa);
}

// ---- 2. Pitch (full judging round) --------------------------------------------------

function startPitch() {
  endSession();
  show('pitch');
  $('pitch-eyebrow').textContent = `Your pitch · ${occasionLabel(state.scene.setting, state.scene.settingDescription)}`;
  state.slideIndex = 0;
  renderPitchSlide();
  $('pitch-clock').textContent = fmtTime(state.pitchSeconds);
  $('pitch-clock').className = 'clock';
  $('pitch-bar').className = 'bar-fill';
  $('pitch-bar').style.transform = 'scaleX(1)';
  $('pitch-start').hidden = false;
  $('pitch-done').hidden = true;
  $('pitch-rec').hidden = true;
  $('pitch-hint').textContent =
    state.answerMode === 'voice'
      ? "Pitch out loud as if the judges were in front of you. Your pitch is recorded, so at the end you'll see its filler words, pace and pauses."
      : "Pitch out loud as if the judges were in front of you. You're answering by typing, so your pitch isn't recorded.";
  if (pitchSlides().length) $('pitch-hint').textContent += ' Use the arrow keys to change slides.';
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

async function startPitchClock() {
  $('pitch-start').hidden = true;
  $('pitch-done').hidden = false;
  const session = state.session;
  if (state.answerMode === 'voice') {
    try {
      await pitchRecorder.start({
        limit: state.pitchSeconds + PITCH_EXTRA_SECONDS,
        bitsPerSecond: PITCH_BITS_PER_SECOND,
        onLimit: () => pitchRecorder.stop(),
      });
      $('pitch-rec').hidden = false;
    } catch {
      toast("Couldn't use your microphone, so your pitch isn't being recorded.", true);
    }
  }
  const end = performance.now() + state.pitchSeconds * 1000;
  timers.pitch = setInterval(() => {
    const left = (end - performance.now()) / 1000;
    const kind = left <= 0 ? ' over' : left <= 30 ? ' warn' : '';
    $('pitch-clock').textContent = fmtTime(left);
    $('pitch-clock').className = `clock${kind}`;
    $('pitch-bar').className = `bar-fill${kind}`;
    $('pitch-bar').style.transform = `scaleX(${Math.max(0, left / state.pitchSeconds)})`;
    if (left <= 0) {
      clearInterval(timers.pitch);
      toast("Time! The judges have questions.");
      setTimeout(() => session === state.session && finishPitch(), 1500);
    }
  }, 200);
}

// Stop recording the pitch and transcribe it while the questions start.
async function finishPitch() {
  clearInterval(timers.pitch);
  $('pitch-rec').hidden = true;
  if (pitchRecorder.recording) {
    const { blob, seconds } = await pitchRecorder.stop();
    if (seconds >= 5 && blob.size <= MAX_BYTES) {
      const pitch = { seconds, transcript: null, error: null };
      pitch.pending = api.transcribe(blob).then(
        (t) => (pitch.transcript = t),
        (e) => (pitch.error = e.message),
      );
      state.pitch = pitch;
    }
  }
  startQA();
}

// A pitch recorded earlier, uploaded instead of pitching live: handy for demos.
async function uploadPitch(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) return toast('That file is over 4 MB. Use a shorter recording, or an mp3 or m4a.', true);
  clearInterval(timers.pitch);
  $('pitch-rec').hidden = true;
  if (pitchRecorder.recording) await pitchRecorder.stop(); // drop the live recording
  const pitch = { seconds: 0, transcript: null, error: null };
  pitch.pending = api.transcribe(file).then(
    (t) => (pitch.transcript = t),
    (e) => (pitch.error = e.message),
  );
  state.pitch = pitch;
  toast('Got your recorded pitch. The judges have questions.');
  startQA();
}

// ---- 3. The judging table -----------------------------------------------------------

function renderPanel() {
  $('panel').innerHTML = state.judges
    .map(
      (id) => `
      <div class="seat" data-judge="${id}" data-state="idle">
        <div class="seat-portrait"><img src="${judgeById(id).img}" alt="" /></div>
        <div class="seat-name">${esc(judgeById(id).name)}</div>
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

// judgeId null means every judge at once.
function setSeats(judgeId, seatState) {
  for (const seat of $$('.seat')) {
    const on = judgeId === null || seat.dataset.judge === judgeId;
    seat.classList.toggle('active', on);
    seat.classList.toggle('recording', on && recorder.recording);
    seat.dataset.state = on ? seatState : 'idle';
    seat.querySelector('.seat-state').innerHTML = on ? SEAT_LABEL[seatState] : '';
  }
}

function clearTable() {
  for (const id of ['thread', 'question-card', 'interjection', 'answer-voice', 'answer-type', 'working', 'problem', 'feedback']) {
    $(id).hidden = true;
  }
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

  const judges = state.judges;
  const results = await Promise.allSettled(judges.map((id) => api.questions(state.summary, judgeById(id), state.scene)));
  if (session !== state.session) return;
  working(false);

  const lists = results.map((r, i) =>
    r.status === 'fulfilled' && Array.isArray(r.value)
      ? r.value
          .filter((q) => typeof q === 'string' && q.trim())
          .slice(0, Number(settings.perJudge) || 3)
          .map((q) => ({ judge: judges[i], question: q.trim(), followUp: false, attempts: [] }))
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

// seconds: how long is left; the full Q&A time unless picking up after a refresh.
function startQaClock(seconds = state.qaSeconds) {
  $('qa-timer').hidden = false;
  $('qa-clock').classList.remove('over');
  state.qaEndsAt = Date.now() + seconds * 1000;
  const end = performance.now() + seconds * 1000;
  timers.qa = setInterval(() => {
    const left = (end - performance.now()) / 1000;
    const kind = left <= 0 ? ' over' : left <= 15 ? ' warn' : '';
    $('qa-clock').textContent = fmtTime(left);
    $('qa-clock').className = `clock-sm${kind}`;
    $('qa-bar').className = `bar-fill${kind}`;
    $('qa-bar').style.transform = `scaleX(${Math.max(0, left / state.qaSeconds)})`;
    if (left > 0) return;
    clearInterval(timers.qa);
    state.timeUp = true;
    const midAnswer = recorder.recording || (!$('answer-type').hidden && $('type-text').value.trim());
    if (midAnswer) toast("That's time! Finish your sentence and send it.");
    else finish();
  }, 200);
}

// Puts the question being asked on the card: the opening one, or a follow-up.
function showQuestion(item) {
  const followUps = item.thread?.turns.length ?? 0;
  const tag = followUps
    ? `<span class="q-follow">Follow-up ${followUps}</span>`
    : item.followUp
      ? '<span class="q-follow">Follow-up</span>'
      : '';
  $('q-who').innerHTML = esc(judgeOf(item).name) + tag;
  $('q-progress').textContent = `Question ${state.index + 1} of ${state.queue.length}`;
  $('q-text').textContent = questionNow(item);
  const reply = item.thread?.reply;
  $('q-reply').hidden = !reply;
  $('q-reply').textContent = reply ? `“${reply}”` : '';
  $('voice-error').hidden = true;
  const card = $('question-card');
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth; // restart the entrance animation
  card.style.animation = '';
}

async function ask() {
  const item = current();
  if (!item) return finish();
  item.thread = null;
  saveSession();
  clearTable();
  showQuestion(item);
  renderThread(item);
  showAnswer();
  if (state.conversation) voice.prefetch(judgeOf(item).ack, judgeOf(item).voice, settings.voiceMode);

  // Make the next question's audio while this one is being answered.
  const upcoming = state.queue[state.index + 1];
  if (upcoming) voice.prefetch(upcoming.question, judgeOf(upcoming).voice, settings.voiceMode);
  if (interruptsOn() && state.answerMode === 'voice') {
    voice.prefetch(judgeOf(item).interrupt, judgeOf(item).voice, settings.voiceMode);
  }

  await speakItem(item);
}

// Speaks a line in the judge's voice. If the realistic voice fails, say why on the
// question card and use the browser's voice instead, so the judge is still heard.
async function judgeSays(text, judge, onStart) {
  try {
    await voice.speak(text, judge.voice, settings.voiceMode, onStart);
  } catch (e) {
    $('voice-error').textContent = `The realistic voice didn't work, so this is the browser's voice. ${e.message}`;
    $('voice-error').hidden = false;
    await voice.speak(text, judge.voice, 'browser', onStart);
  }
}

async function speakItem(item) {
  setSeats(item.judge, 'thinking');
  await judgeSays(questionNow(item), judgeOf(item), () => {
    if (!recorder.recording) setSeats(item.judge, 'speaking');
  });
  if (current() === item && !state.busy && $('feedback').hidden) setSeats(item.judge, 'listening');
}

function showAnswer() {
  const speaking = state.answerMode === 'voice';
  $('interjection').hidden = true;
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

// ---- Interruptions (optional): the judge cuts in when a spoken answer runs long ----

const WRAP_UP_SECONDS = 15;

// Seconds into an answer before the judge cuts in, by difficulty: [practice, run-through].
function interruptTimes(difficulty) {
  return [
    [60, 30],
    [55, 25],
    [45, 20],
    [35, 15],
    [25, 12],
  ][difficulty - 1];
}
const interruptAfter = () => interruptTimes(state.scene.difficulty)[state.rapid ? 1 : 0];
const interruptsOn = () => settings.interrupts === 'on';

async function interrupt(item) {
  const cut = { at: recorder.elapsed(), wrapEnd: null };
  state.cut = cut;
  recorder.pause(); // the judge's voice stays out of the recording
  const judge = judgeOf(item);
  $('interjection-who').textContent = `${judge.name} cuts in`;
  $('interjection-text').textContent = judge.interrupt;
  $('interjection').hidden = false;
  $('rec-hint').textContent = `${judge.name} cut in. Listen…`;
  setSeats(item.judge, 'speaking');
  await judgeSays(judge.interrupt, judge);
  if (settings.voiceMode === 'off') await new Promise((r) => setTimeout(r, 2500));
  if (state.cut !== cut || !recorder.paused) return; // they stopped in the meantime
  recorder.resume();
  cut.wrapEnd = performance.now() + WRAP_UP_SECONDS * 1000;
  setSeats(item.judge, 'listening');
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
  state.cut = null;
  $('interjection').hidden = true;
  const bars = $$('#meter i');
  try {
    await recorder.start({
      onTick: (s) => {
        $('rec-clock').textContent = fmtTime(s);
        $('rec-clock').classList.toggle('warn', s > MAX_SECONDS - 20);
        if (interruptsOn() && !state.cut && s >= interruptAfter()) interrupt(item);
        if (state.cut?.wrapEnd) {
          const left = (state.cut.wrapEnd - performance.now()) / 1000;
          $('rec-hint').textContent = `Wrap up: ${Math.max(0, Math.ceil(left))} seconds left.`;
          if (left <= 0) stopRecording();
        }
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
  setSeats(item.judge, 'listening');
}

async function stopRecording() {
  if (state.stopping) return;
  state.stopping = true;
  voice.stop(); // in case a judge is still cutting in
  const cut = state.cut;
  state.cut = null;
  const { blob, seconds } = await recorder.stop();
  state.stopping = false;
  resetRecordUI();
  setSeats(current().judge, 'listening');
  if (seconds < 1.5) return toast('That was too short. Press the button, answer, then press it again.');
  if (blob.size > MAX_BYTES) return toast('That recording is too big to send. Keep answers under 3 minutes.', true);
  submit(once(() => api.transcribe(blob)), { cutAt: cut?.at });
}

// An audio file instead of speaking: same transcript, fillers, pace and pauses.
function uploadAnswer(file) {
  if (!file || state.busy || state.stopping || recorder.recording || !current()) return;
  if (file.size > MAX_BYTES) return toast('That file is over 4 MB. Use a shorter recording, or an mp3 or m4a.', true);
  voice.stop();
  $('interjection').hidden = true;
  submit(once(() => api.transcribe(file)));
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
    words: [],
  };
}

// ---- Sending an answer ----

// extra.cutAt: seconds into the answer when the judge cut in, if they did.
function submit(getTranscript, extra = {}) {
  if (state.conversation) return submitTurn(getTranscript, extra);
  const item = current();
  const session = state.session;
  const attempt = { transcript: null, result: null, pending: null, cutAt: extra.cutAt ?? null };
  item.attempts.push(attempt);

  // Tell the grader about an interruption, so the feedback can mention it.
  const question =
    attempt.cutAt === null
      ? item.question
      : `${item.question}\n(The judge cut in after ${Math.round(attempt.cutAt)} seconds because the answer ran long, and gave them ${WRAP_UP_SECONDS} seconds to wrap up.)`;

  const run = async (onTranscribed) => {
    attempt.transcript = await getTranscript();
    onTranscribed?.();
    attempt.result = await api.feedback(state.summary, question, judgeOf(item), attempt.transcript, state.scene);
  };
  const drop = () => item.attempts.splice(item.attempts.indexOf(attempt), 1);

  if (state.rapid) {
    // Like the real thing: straight on to the next question, grades come at the end.
    attempt.pending = run().then(() => saveSession(), drop);
    return next();
  }

  state.busy = true;
  $('answer-voice').hidden = true;
  $('answer-type').hidden = true;
  problem(false);
  setSeats(item.judge, 'deliberating');
  working(state.answerMode === 'voice' ? 'Listening back to your answer…' : `${judgeOf(item).name} is reading your answer…`);
  attempt.pending = run(() => {
    if (session === state.session) working(`${judgeOf(item).name} is deciding what to make of that…`);
  }).then(
    () => {
      if (session !== state.session) return;
      state.busy = false;
      working(false);
      renderFeedback(item);
      saveSession();
    },
    (e) => {
      drop();
      if (session !== state.session) return;
      state.busy = false;
      working(false);
      setSeats(item.judge, 'listening');
      problem(e.message, [
        ['Send it again', () => submit(getTranscript, extra), true],
        ['Answer again', () => (problem(false), showAnswer())],
      ]);
    },
  );
}

// ---- A back-and-forth: the judge follows up until satisfied ------------------------

// Most follow-ups a judge asks before wrapping up, by difficulty.
const maxFollowUps = (difficulty) => [1, 1, 2, 3, 3][difficulty - 1];

// The question as the grader sees it: with a note if the judge had to cut in.
function questionForGrader(question, cutAt) {
  return cutAt === null || cutAt === undefined
    ? question
    : `${question}\n(The judge cut in after ${Math.round(cutAt)} seconds because the answer ran long, and gave them ${WRAP_UP_SECONDS} seconds to wrap up.)`;
}

// One answer in a back-and-forth. The judge says "Hmm, okay" straight away, thinks, then
// either asks a follow-up out loud or wraps up with a spoken verdict and the feedback.
async function submitTurn(getTranscript, extra) {
  const item = current();
  const judge = judgeOf(item);
  const session = state.session;
  const thread = (item.thread ??= { turns: [], question: item.question });
  const turn = { question: thread.question, transcript: null, result: null, cutAt: extra.cutAt ?? null };
  const followUpsLeft = maxFollowUps(state.scene.difficulty) - thread.turns.length;
  const talk = {
    conversation: thread.turns.map((t) => ({ question: t.question, answer: t.transcript.text })),
    followUpsLeft,
  };

  state.busy = true;
  $('answer-voice').hidden = true;
  $('answer-type').hidden = true;
  $('interjection').hidden = true;
  problem(false);
  setSeats(item.judge, 'speaking');
  const ack = judgeSays(judge.ack, judge);
  ack.then(() => session === state.session && state.busy && setSeats(item.judge, 'thinking'));
  working(`${judge.name} is thinking about that…`);

  try {
    turn.transcript = await getTranscript();
    turn.result = await api.feedback(
      state.summary,
      questionForGrader(turn.question, turn.cutAt),
      judge,
      turn.transcript,
      state.scene,
      talk,
    );
  } catch (e) {
    await ack;
    if (session !== state.session) return;
    state.busy = false;
    working(false);
    setSeats(item.judge, 'listening');
    problem(e.message, [
      ['Send it again', () => submitTurn(getTranscript, extra), true],
      ['Answer again', () => (problem(false), showAnswer())],
    ]);
    return;
  }
  await ack;
  if (session !== state.session) return;
  thread.turns.push(turn);
  state.busy = false;
  working(false);
  saveSession();

  const { reply, followUp } = turn.result;
  if (followUp && followUpsLeft > 0) {
    // Not satisfied yet: react, ask the follow-up, and listen again.
    thread.question = followUp;
    thread.reply = reply ?? null;
    renderThread(item);
    showQuestion(item);
    showAnswer();
    setSeats(item.judge, 'speaking');
    await judgeSays([reply, followUp].filter(Boolean).join(' '), judge);
    if (current() === item && !state.busy && !recorder.recording) setSeats(item.judge, 'listening');
    return;
  }

  // Satisfied, or out of follow-ups: the whole exchange becomes one attempt.
  const verdict = reply || verdictFrom(turn.result.feedback);
  item.attempts.push({
    turns: thread.turns,
    transcript: combineTranscripts(thread.turns.map((t) => t.transcript)),
    result: turn.result,
    verdict,
    cutAt: thread.turns.find((t) => t.cutAt !== null)?.cutAt ?? null,
    pending: null,
  });
  item.thread = null;
  saveSession();
  showQuestion(item); // back to the question the conversation started from
  renderThread(item);
  renderFeedback(item);
  setSeats(item.judge, 'speaking');
  await judgeSays(verdict, judge);
  if (current() === item) setSeats(item.judge, 'done');
}

// Without a spoken reply from the server, the judge closes with the first sentence of
// their feedback.
function verdictFrom(feedback = '') {
  const first = feedback.split(/(?<=[.!?])\s+/)[0] ?? '';
  return `Alright, thank you. ${first}`.slice(0, 300);
}

// Several answers' delivery numbers as one.
function combineTranscripts(transcripts) {
  if (transcripts.length === 1) return transcripts[0];
  const spoken = transcripts.filter((t) => t.durationSeconds > 0);
  const seconds = spoken.reduce((sum, t) => sum + t.durationSeconds, 0);
  const add = (key) => spoken.reduce((sum, t) => sum + (t.fillers?.[key] || 0), 0);
  return {
    text: transcripts.map((t) => t.text).join(' … '),
    durationSeconds: Math.round(seconds * 10) / 10,
    wordsPerMinute: seconds ? Math.round(spoken.reduce((sum, t) => sum + t.wordsPerMinute * t.durationSeconds, 0) / seconds) : 0,
    fillers: { um: add('um'), uh: add('uh'), like: add('like') },
    longPauses: spoken.reduce((sum, t) => sum + (t.longPauses || 0), 0),
    words: [],
  };
}

// The back-and-forth so far, above the question being asked.
function renderThread(item) {
  const turns = item.thread?.turns ?? [];
  $('thread').hidden = !turns.length;
  $('thread').innerHTML = turns.map((t) => conversationTurn(judgeOf(item), t)).join('');
}

function conversationTurn(judge, turn) {
  return `
    <div class="bubble judge"><span>${esc(judge.name)}</span>${esc(turn.question)}</div>
    <div class="bubble you"><span>You</span>${transcriptHtml(turn.transcript) || '<em>Nothing was heard.</em>'}</div>`;
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

// The recorded 3-minute pitch, shown above the answers on the results.
function pitchSection() {
  const pitch = state.pitch;
  if (!pitch) return '';
  let body;
  if (pitch.error) {
    body = `<p class="report-note">Your pitch couldn't be transcribed: ${esc(pitch.error)}</p>`;
  } else if (!pitch.transcript?.text?.trim()) {
    body = '<p class="report-note">No words were heard in your pitch. Check your microphone.</p>';
  } else {
    const t = pitch.transcript;
    const seconds = t.durationSeconds || pitch.seconds;
    const [note, rating] =
      seconds > state.pitchSeconds ? [`Over your ${plural(state.pitchSeconds / 60, 'minute')}. You'd be cut off.`, 'bad']
      : seconds >= state.pitchSeconds * 0.75 ? [`A good use of your ${plural(state.pitchSeconds / 60, 'minute')}.`, 'good']
      : ['Room to spare. Fine, if you covered everything.', 'ok'];
    body = `
      <div class="report">
        ${fillerTile(t.fillers, seconds)}
        ${paceTile(t.wordsPerMinute)}
        ${pauseTile(t.longPauses)}
        ${tile('Length', fmtTime(seconds), note, rating)}
      </div>
      <details class="transcript">
        <summary>What you said</summary>
        <p>${transcriptHtml(t)}</p>
      </details>`;
  }
  return `<section class="pitch-result"><h2>Your pitch</h2>${body}</section>`;
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

// The same filler words the server counts (um, erm, hmm, uh, er, ah, like).
const FILLER = /\b(u+m+|e+r+m+|h+m+|u+h+|e+r+|a+h+|like)\b/gi;

function highlightFillers(text) {
  return esc(text).replace(FILLER, '<mark class="filler">$1</mark>');
}

// With word timings, pauses of 2 seconds or more show up where they happened.
function transcriptHtml(t) {
  const words = Array.isArray(t.words)
    ? t.words.filter((w) => typeof w?.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end))
    : [];
  if (!words.length) return highlightFillers(t.text);
  return words
    .map((w, i) => {
      const gap = i > 0 ? w.start - words[i - 1].end : 0;
      const pause = gap >= 2 ? `<span class="pause" title="A ${gap.toFixed(1)} second pause">${gap.toFixed(1)}s</span> ` : '';
      return pause + highlightFillers(w.text);
    })
    .join(' ');
}

// The scoring guide: each one passes or fails.
const CHECKS = [
  ['answered', 'Answered the question'],
  ['usedSlides', 'Used details from your project'],
  ['concise', 'Concise'],
  ['confident', 'Confident delivery'],
];

function shownChecks(checks, typed) {
  if (!checks || typeof checks !== 'object') return [];
  return CHECKS.filter(([key]) => typeof checks[key] === 'boolean' && !(typed && key === 'confident'));
}

function checksList(checks, typed) {
  const shown = shownChecks(checks, typed);
  if (!shown.length) return '';
  return `<ul class="checks">${shown
    .map(([key, label]) => {
      const pass = checks[key];
      return `<li class="${pass ? 'pass' : 'fail'}"><span aria-hidden="true">${pass ? '✓' : '✗'}</span>${label}<span class="sr-only">: ${pass ? 'pass' : 'fail'}</span></li>`;
    })
    .join('')}</ul>`;
}

function renderFeedback(item) {
  const { transcript, result, cutAt, turns, verdict } = item.attempts.at(-1);
  const score = clampScore(result.score);
  const previous = item.attempts.length > 1 ? clampScore(item.attempts.at(-2).result.score) : null;
  // After a back-and-forth the judge has already asked their follow-ups.
  const followUp = turns ? null : result.followUp;
  const isLast = state.index >= state.queue.length - 1 && !followUp;

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
        <p class="eyebrow">${esc(judgeOf(item).name)}</p>
        ${verdict ? `<p class="verdict">“${esc(verdict)}”</p>` : ''}
        <p class="fb-text">${esc(result.feedback)}</p>
        ${checksList(result.checks, !transcript.durationSeconds)}
        ${cutAt !== null ? `<span class="cut-chip">Cut off at ${fmtTime(cutAt)}</span>` : ''}
        ${delta}
      </div>
    </div>
    ${deliveryReport(transcript)}
    ${
      turns?.length > 1
        ? `<details class="transcript" open>
            <summary>The conversation</summary>
            <div class="thread">${turns.map((t) => conversationTurn(judgeOf(item), t)).join('')}</div>
          </details>`
        : `<details class="transcript"${transcript.durationSeconds ? ' open' : ''}>
            <summary>What you said</summary>
            <p>${transcriptHtml(transcript) || '<em>Nothing was heard.</em>'}</p>
          </details>`
    }
    ${followUp ? `<p class="follow-up"><span>Follow-up</span><q>${esc(followUp)}</q></p>` : ''}
    <div class="fb-actions">
      <button class="btn btn-ghost" data-act="retry">Try this one again</button>
      ${followUp ? '<button class="btn" data-act="follow-up">Answer the follow-up</button>' : ''}
      <button class="btn btn-primary" data-act="next">${isLast ? 'See results' : 'Next question'}</button>
    </div>`;
  box.hidden = false;
  setSeats(item.judge, 'done');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function onFeedbackAction(e) {
  const action = e.target.closest('[data-act]')?.dataset.act;
  const item = current();
  if (!action || !item) return;
  if (action === 'retry') {
    voice.stop();
    $('feedback').hidden = true;
    item.thread = null; // a back-and-forth starts again from the first question
    saveSession();
    showQuestion(item);
    renderThread(item);
    setSeats(item.judge, 'listening');
    showAnswer();
    $('question-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (action === 'follow-up') {
    const { followUp } = item.attempts.at(-1).result;
    state.queue.splice(state.index + 1, 0, { judge: item.judge, question: followUp, followUp: true, attempts: [] });
    next();
  } else if (action === 'next') {
    next();
  }
}

// ---- 4. Results ---------------------------------------------------------------------

async function finish() {
  const pending = [...state.queue.flatMap((i) => i.attempts.map((a) => a.pending)), state.pitch?.pending].filter(Boolean);
  endSession();
  const session = state.session;
  show('results');
  if (pending.length) {
    $('results').innerHTML = `<div class="working">${DOTS}<span>The judges are comparing notes…</span></div>`;
    await Promise.allSettled(pending);
    if (session !== state.session) return;
  }
  renderResults();
  saveSession();
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
      <p>Answer at least one question to get a verdict.</p></div></div>${pitchSection()}${actions}`;
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
  if (!state.recorded) {
    saveHistory(average, latest.length, spoken);
    state.recorded = true; // a refresh of this page mustn't count the round twice
  }
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
      const j = judgeOf(item);
      const tries = graded(item);
      const who = `${esc(j.name)}${item.followUp ? ' · follow-up' : ''}`;
      if (!tries.length) {
        return `<li class="result skipped"><img src="${j.img}" alt="" /><div>
          <div class="result-who">${who}</div><p class="result-q">${esc(item.question)}</p>
          <p class="result-fb">Not answered.</p></div><div></div></li>`;
      }
      const { transcript: t, result, cutAt } = tries.at(-1);
      const score = clampScore(result.score);
      const stats = t.durationSeconds
        ? `${plural((t.fillers?.um || 0) + (t.fillers?.uh || 0) + (t.fillers?.like || 0), 'filler')} · ${Math.round(t.wordsPerMinute)} wpm · ${plural(t.longPauses || 0, 'long pause')} · ${fmtTime(t.durationSeconds)}`
        : 'Typed answer';
      const cutNote = cutAt !== null ? ` · cut off at ${fmtTime(cutAt)}` : '';
      const first = tries.length > 1 ? `<small>first try ${clampScore(tries[0].result.score)}</small>` : '<small>/10</small>';
      return `<li class="result"><img src="${j.img}" alt="" /><div>
          <div class="result-who">${who}</div>
          <p class="result-q">${esc(item.question)}</p>
          <p class="result-fb">${esc(result.feedback)}</p>
          ${checksList(result.checks, !t.durationSeconds)}
          <div class="result-stats">${stats}${cutNote}</div></div>
          <div class="result-score ${scoreRating(score)}">${score}${first}</div></li>`;
    })
    .join('');

  $('results').innerHTML = `
    <div class="results-hero">
      ${scoreRing(average, avgText)}
      <div>
        <p class="eyebrow">Verdict · ${esc(occasionLabel(state.scene.setting, state.scene.settingDescription))} · ${DIFFICULTY[state.scene.difficulty].name}</p>
        <h1>${headline}</h1>
        <p>Average score over ${plural(answered.length, 'answer')} from ${plural(new Set(answered.map((i) => i.judge)).size, 'judge')}.</p>
      </div>
    </div>
    ${pitchSection()}
    ${state.pitch ? '<h2 class="results-sub">Your answers</h2>' : ''}
    ${totals}
    <ol class="result-list">${rows}</ol>
    ${actions}`;
}

// ---- Your progress: past sessions, kept in this browser ----

const HISTORY_KEY = 'toughcrowd.history';
const HISTORY_SIZE = 20;

function saveHistory(average, answers, spoken) {
  const seconds = spoken.reduce((sum, t) => sum + t.durationSeconds, 0);
  const fillers = spoken.reduce((sum, t) => sum + Object.values(t.fillers ?? {}).reduce((a, b) => a + b, 0), 0);
  const entry = {
    at: Date.now(),
    occasion: state.scene.setting,
    occasionLabel: occasionLabel(state.scene.setting, state.scene.settingDescription),
    difficulty: state.scene.difficulty,
    judges: state.judges.map((id) => judgeById(id)?.name).filter(Boolean),
    score: Math.round(average * 10) / 10,
    answers,
    fillersPerMinute: seconds ? Math.round((fillers / (seconds / 60)) * 10) / 10 : null,
    wpm: seconds ? Math.round(spoken.reduce((sum, t) => sum + t.wordsPerMinute * t.durationSeconds, 0) / seconds) : null,
  };
  store(HISTORY_KEY, [entry, ...load(HISTORY_KEY, [])].slice(0, HISTORY_SIZE));
}

function renderHistory() {
  const history = load(HISTORY_KEY, []);
  $('history').hidden = !history.length;
  if (!history.length) return;
  $('history-list').innerHTML = history
    .slice(0, 10)
    .map((h, i) => {
      const older = history[i + 1];
      const trend = !older ? '' : h.score > older.score ? ' ↑' : h.score < older.score ? ' ↓' : '';
      const when = new Date(h.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const stats = h.wpm
        ? `${h.fillersPerMinute} fillers/min · ${h.wpm} wpm`
        : 'Typed answers';
      return `<li>
        <span class="history-score ${scoreRating(h.score)}">${h.score}${trend}</span>
        <span class="history-what">${esc(h.occasionLabel ?? occasionLabel(h.occasion))} · ${DIFFICULTY[h.difficulty]?.name ?? ''}
          <small>${esc(when)} · ${plural(h.answers, 'answer')} · ${esc(h.judges.join(', '))}</small></span>
        <span class="history-stats">${stats}</span>
      </li>`;
    })
    .join('');
}

function onResultsAction(e) {
  const action = e.target.closest('[data-act]')?.dataset.act;
  if (action === 'again') startSession();
  else if (action === 'setup') leave();
}

// ---- Picking up after a refresh ------------------------------------------------------
// The setup and the session are kept in this browser, so closing or refreshing the tab
// doesn't throw the round away. Slide images and recordings are not kept: they're big,
// and the judges only ever needed the summary. Answers still being graded at the moment
// of the refresh are lost, and the person answers that question again.

const SETUP_KEY = 'toughcrowd.setup';
const SESSION_KEY = 'toughcrowd.session';
const SAVE_VERSION = 1;
const SAVE_LIMIT = 1_500_000; // characters; well under what browsers allow per site

function forget(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function saveSetup() {
  if (!state.setupRestored) return;
  store(SETUP_KEY, {
    v: SAVE_VERSION,
    source: state.source,
    pdfReady: state.pdfReady,
    slideCount: state.slideCount,
    slidesName: state.slidesName,
    summary: $('summary-text').value,
    explain: $('explain-text').value,
    paste: $('paste-text').value,
    form: Object.fromEntries(FORM_FIELDS.map(([id]) => [id, $(id).value])),
  });
}

function restoreSetup() {
  const saved = load(SETUP_KEY, null);
  state.setupRestored = true;
  if (saved?.v !== SAVE_VERSION) return;
  $('summary-text').value = typeof saved.summary === 'string' ? saved.summary : '';
  $('explain-text').value = typeof saved.explain === 'string' ? saved.explain : '';
  $('paste-text').value = typeof saved.paste === 'string' ? saved.paste : '';
  for (const [id] of FORM_FIELDS) $(id).value = typeof saved.form?.[id] === 'string' ? saved.form[id] : '';
  if ($('explain-text').value.trim()) {
    $('explain-result').hidden = false;
    resetExplainUI();
  }
  if (saved.pdfReady && $('summary-text').value.trim()) {
    state.pdfReady = true;
    state.slideCount = Number(saved.slideCount) || 0;
    state.slidesName = typeof saved.slidesName === 'string' ? saved.slidesName : '';
    $('slides-status').hidden = false;
    const what = state.slideCount ? `${state.slidesName || 'Your deck'}: ${plural(state.slideCount, 'slide')} read earlier.` : 'Your slides were read earlier.';
    setSlidesMsg(`${what} The judges still have the summary below. Drop the PDF in again to show the slides during a pitch.`, 'ok');
  }
  setSource(SOURCES.includes(saved.source) ? saved.source : 'pdf');
}

// Which screen is up: 'setup', 'pitch', 'table' or 'results'.
const currentScreen = () => ['setup', 'pitch', 'table', 'results'].find((s) => !$(`screen-${s}`).hidden);

// A graded answer, without the promise that fetched it.
function attemptData(a) {
  return { transcript: a.transcript, result: a.result, cutAt: a.cutAt ?? null, verdict: a.verdict ?? null, turns: a.turns ?? null };
}

function saveSession() {
  const screen = currentScreen();
  if (screen !== 'table' && screen !== 'results') return forget(SESSION_KEY);
  const data = {
    v: SAVE_VERSION,
    at: Date.now(),
    screen,
    summary: state.summary,
    judges: state.judges,
    scene: state.scene,
    pitchSeconds: state.pitchSeconds,
    qaSeconds: state.qaSeconds,
    qaEndsAt: state.qaEndsAt,
    rapid: state.rapid,
    conversation: state.conversation,
    answerMode: state.answerMode,
    index: state.index,
    timeUp: state.timeUp,
    recorded: state.recorded,
    pitch: state.pitch ? { seconds: state.pitch.seconds, transcript: state.pitch.transcript, error: state.pitch.error } : null,
    queue: state.queue.map((i) => ({
      judge: i.judge,
      question: i.question,
      followUp: i.followUp,
      thread: i.thread?.turns?.length ? { question: i.thread.question, reply: i.thread.reply ?? null, turns: i.thread.turns } : null,
      attempts: i.attempts.filter((a) => a.result && a.transcript).map(attemptData),
    })),
  };
  let text = JSON.stringify(data);
  if (text.length > SAVE_LIMIT) {
    // Too big: drop the word timings (only used to show pauses) and keep the rest.
    const strip = (t) => (t && Array.isArray(t.words) ? { ...t, words: [] } : t);
    for (const i of data.queue) {
      for (const a of i.attempts) {
        a.transcript = strip(a.transcript);
        if (a.turns) a.turns = a.turns.map((t) => ({ ...t, transcript: strip(t.transcript) }));
      }
      if (i.thread) i.thread.turns = i.thread.turns.map((t) => ({ ...t, transcript: strip(t.transcript) }));
    }
    if (data.pitch) data.pitch.transcript = strip(data.pitch.transcript);
    text = JSON.stringify(data);
  }
  try {
    localStorage.setItem(SESSION_KEY, text);
  } catch {}
}

// Back to the question or the results the person was looking at. True if there was
// a session to pick up.
function restoreSession() {
  const saved = load(SESSION_KEY, null);
  if (saved?.v !== SAVE_VERSION || !['table', 'results'].includes(saved.screen)) return false;
  const isTranscript = (t) => t && typeof t.text === 'string' && Number.isFinite(t.durationSeconds);
  const judges = Array.isArray(saved.judges) ? saved.judges.filter((id) => judgeById(id)) : [];
  const queue = (Array.isArray(saved.queue) ? saved.queue : [])
    .filter((i) => i && judgeById(i.judge) && typeof i.question === 'string')
    .map((i) => ({
      judge: i.judge,
      question: i.question,
      followUp: !!i.followUp,
      thread:
        i.thread?.turns?.length && typeof i.thread.question === 'string'
          ? { question: i.thread.question, reply: i.thread.reply ?? null, turns: i.thread.turns.filter((t) => isTranscript(t?.transcript) && t.result) }
          : null,
      attempts: (Array.isArray(i.attempts) ? i.attempts : [])
        .filter((a) => a?.result && isTranscript(a.transcript))
        .map((a) => ({ ...attemptData(a), pending: null })),
    }));
  if (!judges.length || !queue.length || typeof saved.summary !== 'string') {
    forget(SESSION_KEY);
    return false;
  }
  const scene = saved.scene && DIFFICULTY[saved.scene.difficulty] && OCCASIONS[saved.scene.setting] ? saved.scene : { difficulty: 3, setting: 'hackathon' };
  endSession();
  Object.assign(state, {
    summary: saved.summary,
    judges,
    scene,
    pitchSeconds: Number(saved.pitchSeconds) || 180,
    qaSeconds: Number(saved.qaSeconds) || 60,
    qaEndsAt: Number(saved.qaEndsAt) || 0,
    rapid: !!saved.rapid,
    conversation: !!saved.conversation,
    answerMode: saved.answerMode === 'type' ? 'type' : 'voice',
    queue,
    index: Math.min(queue.length - 1, Math.max(0, Math.round(Number(saved.index)) || 0)),
    timeUp: !!saved.timeUp,
    recorded: !!saved.recorded,
    busy: false,
    pitch: saved.pitch && isTranscript(saved.pitch.transcript) ? { seconds: Number(saved.pitch.seconds) || 0, transcript: saved.pitch.transcript, error: null, pending: null } : null,
  });

  if (saved.screen === 'results') {
    show('results');
    renderResults();
    return true;
  }

  show('table');
  renderPanel();
  clearTable();
  $('qa-timer').hidden = true;
  const item = current();
  if (state.rapid) {
    const left = (state.qaEndsAt - Date.now()) / 1000;
    if (state.timeUp || !(left > 0)) {
      state.timeUp = true;
      finish();
      return true;
    }
    startQaClock(left);
  }
  showQuestion(item);
  renderThread(item);
  const graded = !state.rapid && !item.thread && item.attempts.at(-1)?.result;
  if (graded) renderFeedback(item);
  else {
    showAnswer();
    setSeats(item.judge, 'listening');
  }
  toast('Picked up where you left off.');
  return true;
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
  $('pitch-done').onclick = finishPitch;
  // Upload audio instead of speaking. Clearing the value lets the same file be picked again.
  const onFile = (input, handle) => {
    $(input).onchange = (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      handle(file);
    };
  };
  $('upload-answer-btn').onclick = () => $('answer-file').click();
  onFile('answer-file', uploadAnswer);
  $('pitch-upload-btn').onclick = () => $('pitch-file').click();
  onFile('pitch-file', uploadPitch);

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

// The server asks for the team's passcode (401); ask the person, once, and remember it.
function initPasscode() {
  const dialog = $('passcode-dialog');
  onPasscodeNeeded(
    (wasWrong) =>
      new Promise((resolve) => {
        $('passcode-hint').textContent = wasWrong
          ? "That passcode didn't work. Try again."
          : "The judges only answer people with your team's passcode.";
        $('passcode-input').value = '';
        dialog.onclose = () => resolve(dialog.returnValue === 'ok' ? $('passcode-input').value.trim() : null);
        dialog.returnValue = '';
        dialog.showModal();
      }),
  );
}

initSetup();
initTable();
initPasscode();
restoreSession();
