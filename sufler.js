const byId = id => document.getElementById(id);
const labKeys = Object.keys(scenarios);
const labNav = byId('labs');
const stepNav = byId('steps');
const cards = byId('cards');
const questions = byId('questions');
const clock = byId('clock');
const auto = byId('auto');
const previous = byId('previous');
const next = byId('next');

let currentLab = '';
let currentStep = 0;
let fontSize = window.matchMedia('(max-width: 540px)').matches ? 21 : 24;
let timerStarted = null;
let timerElapsed = 0;
let timerTicker = null;
let animation = null;
let lastFrame = 0;
let scrollDistance = 0;
let feedbackTimeout;

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function route(lab, step = 0) {
  return '#' + lab + (step ? '/' + step : '');
}

function hostCommand(lab, step) {
  const arg = lab === 'stem' ? lab : lab.slice(3);
  return 'cd "$HOME/Desktop/unik/Operation Systme" && ./demo.sh ' + arg +
    (step === undefined ? '' : ' ' + step);
}

function reportFeedback(message) {
  const feedback = byId('feedback');
  feedback.hidden = false;
  feedback.textContent = message;
  clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => { feedback.hidden = true; }, 2500);
}

async function copy(textNode) {
  try {
    await navigator.clipboard.writeText(textNode.textContent);
    reportFeedback('Команду скопійовано');
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    if (document.execCommand('copy')) {
      selection.removeAllRanges();
      reportFeedback('Команду скопійовано');
    } else {
      reportFeedback('Команду виділено. Скопіюй її вручну.');
    }
  }
}

function command(label, text, buttonLabel = 'Копіювати команду') {
  const block = element('div', 'command');
  const pre = element('pre');
  pre.append(element('code', '', text));
  const button = element('button', 'copy', buttonLabel);
  button.type = 'button';
  button.addEventListener('click', () => copy(pre));
  block.append(element('p', '', label), pre, button);
  return block;
}

function speech(card, text) {
  card.append(element('strong', 'say-label', 'Що казати'), element('p', 'speech', text));
}

function manualActions(card, actions) {
  const list = element('ol', 'manual-list');
  for (const action of actions) {
    const item = element('li');
    item.append(element('p', '', action.text));
    if (action.code) item.append(command(action.label, action.code));
    list.append(item);
  }
  card.append(list);
}

function makeCard(number, title, numbered = true) {
  const card = element('article', 'card');
  card.id = 'step-' + number;
  card.tabIndex = -1;
  const head = element('div', 'card-head');
  const heading = element('h2');
  const pick = element('button', '', title);
  pick.type = 'button';
  pick.addEventListener('click', () => {
    stopScroll();
    history.replaceState(null, '', route(currentLab, number));
    go(number, false);
  });
  heading.append(pick);
  if (number && numbered) head.append(element('span', 'step-no', String(number).padStart(2, '0')));
  head.append(heading);
  card.append(head);
  return card;
}

function renderLab(key) {
  const lab = scenarios[key];
  byId('title').textContent = lab.title;
  byId('topic').textContent = lab.label + ' · ' + lab.topic;
  document.title = lab.label + ' · ' + lab.title + ' · Суфлер';

  for (const link of labNav.children) {
    if (link.hash === route(key)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  stepNav.replaceChildren();
  const last = lab.steps.length + 1;
  for (let index = 0; index <= last; index++) {
    const isDemo = index > 0 && index < last;
    const step = isDemo ? lab.steps[index - 1] : null;
    const label = step ? step.nav || 'Крок ' + index : index ? 'Висновок' : 'Старт';
    const link = element('a', '', label);
    link.href = route(key, index);
    if (step) link.setAttribute('aria-label', label + ' · ' + step.title);
    stepNav.append(link);
  }

  const prep = makeCard(0, 'Перед захистом');
  if (lab.prep) {
    manualActions(prep, lab.prep);
  } else {
    prep.append(element('p', 'action', 'Відкрий суфлер для себе. На Mac запусти команду нижче. Відкриється локальний PDF. Після вступу повернися в Термінал і натискай Enter для кожного кроку.'));
    prep.append(command('Термінал на Mac', hostCommand(key), 'Копіювати запуск'));
    if (lab.vm) {
      const vm = element('details');
      vm.append(element('summary', '', 'Запустити ВМ перед захистом'));
      vm.append(command(lab.vm + ' · Термінал на Mac', hostCommand(key, 'vm'), 'Копіювати запуск ВМ'));
      prep.append(vm);
    }
  }
  speech(prep, lab.intro);

  const stepCards = lab.steps.map((step, index) => {
    const number = index + 1;
    const card = makeCard(number, step.title);
    card.append(element('p', 'location', step.where));
    if (step.actions) {
      manualActions(card, step.actions);
      speech(card, step.say);
      return card;
    }
    const action = element('p', 'action');
    action.append(element('strong', '', 'Enter ' + number + '. '), document.createTextNode(step.look));
    card.append(action);
    if (step.live) {
      const list = element('ol', 'live-list');
      for (const instruction of step.live) list.append(element('li', '', instruction));
      card.append(element('strong', 'say-label', 'Жива демонстрація'), list);
    }
    speech(card, step.say);
    if (step.explain) {
      const explanation = element('details', 'explanation');
      explanation.append(element('summary', '', 'Що ще пояснити'), element('p', '', step.explain));
      card.append(explanation);
    }
    const commands = element('details');
    commands.append(element('summary', '', 'Команди для цього кроку'));
    commands.append(command('Відкрити окремо · Термінал на Mac', hostCommand(key, number), 'Копіювати крок'));
    if (step.guest) commands.append(command(step.guest.where, step.guest.code));
    card.append(commands);
    return card;
  });
  const conclusion = makeCard(last, 'Висновок', false);
  speech(conclusion, lab.conclusion + ' Дякую за увагу.');
  cards.replaceChildren(prep, ...stepCards, conclusion);

  const panel = element('details');
  panel.append(element('summary', '', 'Питання та відповіді'));
  const list = element('dl');
  for (const [question, answer] of lab.qa) list.append(element('dt', '', question), element('dd', '', answer));
  panel.append(list);
  questions.replaceChildren(panel);
}

function go(step, scroll) {
  const count = scenarios[currentLab].steps.length;
  const last = count + 1;
  currentStep = Math.min(last, Math.max(0, step));
  const card = byId('step-' + currentStep);
  for (const node of cards.children) node.classList.toggle('current', node === card);
  for (const [index, link] of [...stepNav.children].entries()) {
    if (index === currentStep) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
  previous.disabled = currentStep === 0;
  next.disabled = currentStep === last;
  next.textContent = currentStep === count ? 'Висновок →' : 'Далі →';
  byId('position').textContent = currentStep === last ? 'Висновок' :
    currentStep ? 'Крок ' + currentStep + ' / ' + count : 'Підготовка';
  if (scroll) card.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function showHash() {
  const parts = window.location.hash.slice(1).split('/');
  const legacyLab = parts[0].split('-')[0];
  const lab = Object.hasOwn(scenarios, legacyLab) ? legacyLab : currentLab || 'lab1';
  const step = /^\d+$/.test(parts[1] || '') ? Number(parts[1]) : 0;
  stopScroll();
  const changed = lab !== currentLab;
  if (changed) {
    currentLab = lab;
    resetTimer();
    renderLab(lab);
  }
  if (changed && !step) window.scrollTo({ top: 0, behavior: 'instant' });
  go(step, !changed || step > 0);
}

function move(delta) {
  const step = currentStep + delta;
  if (step < 0 || step > scenarios[currentLab].steps.length + 1) return;
  window.location.hash = route(currentLab, step);
}

function startTimer() {
  if (timerStarted !== null) return;
  timerStarted = performance.now();
  timerTicker = setInterval(renderTimer, 200);
  clock.setAttribute('aria-pressed', 'true');
}

function pauseTimer() {
  if (timerStarted !== null) timerElapsed += performance.now() - timerStarted;
  timerStarted = null;
  clearInterval(timerTicker);
  clock.setAttribute('aria-pressed', 'false');
  renderTimer();
}

function renderTimer() {
  const elapsed = timerElapsed + (timerStarted === null ? 0 : performance.now() - timerStarted);
  const seconds = Math.floor(elapsed / 1000);
  const two = number => String(number).padStart(2, '0');
  clock.textContent = two(Math.floor(seconds / 60)) + ':' + two(seconds % 60) +
    ' / ' + two(scenarios[currentLab].minutes) + ':00';
}

function resetTimer() {
  pauseTimer();
  timerElapsed = 0;
  renderTimer();
}

function scrollFrame(time) {
  if (lastFrame) {
    scrollDistance += Number(byId('speed').value) * 15 * Math.min(time - lastFrame, 50) / 1000;
    const pixels = Math.floor(scrollDistance);
    if (pixels) {
      window.scrollBy({ top: pixels, behavior: 'instant' });
      scrollDistance -= pixels;
    }
  }
  lastFrame = time;
  if (Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight) {
    stopScroll();
    return;
  }
  animation = requestAnimationFrame(scrollFrame);
}

function stopScroll() {
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  lastFrame = 0;
  scrollDistance = 0;
  auto.setAttribute('aria-pressed', 'false');
  auto.textContent = '▶ Автоскрол';
}

function toggleScroll() {
  if (animation !== null) return stopScroll();
  startTimer();
  auto.setAttribute('aria-pressed', 'true');
  auto.textContent = '⏸ Пауза';
  animation = requestAnimationFrame(scrollFrame);
}

function resizeText(delta) {
  fontSize = Math.min(42, Math.max(16, fontSize + delta));
  document.documentElement.style.setProperty('--reading', fontSize + 'px');
}

for (const key of labKeys) {
  const link = element('a', '', scenarios[key].label);
  link.href = route(key);
  labNav.append(link);
}

for (const nav of [labNav, stepNav]) {
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link?.hash === window.location.hash && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      showHash();
    }
  });
}

previous.addEventListener('click', () => move(-1));
next.addEventListener('click', () => move(1));
byId('larger').addEventListener('click', () => resizeText(2));
byId('smaller').addEventListener('click', () => resizeText(-2));
auto.addEventListener('click', toggleScroll);
clock.addEventListener('click', () => timerStarted === null ? startTimer() : pauseTimer());
byId('reset').addEventListener('click', () => {
  stopScroll();
  resetTimer();
  history.replaceState(null, '', route(currentLab));
  go(0, false);
  window.scrollTo({ top: 0, behavior: 'instant' });
});
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  byId('script').focus({ preventScroll: true });
  go(currentStep, true);
});
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('button, input, a, summary, textarea, [contenteditable]')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    toggleScroll();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
window.addEventListener('hashchange', showHash);
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--header-height', entry.target.offsetHeight + 'px');
}).observe(document.querySelector('.topbar'));

resizeText(0);
showHash();
