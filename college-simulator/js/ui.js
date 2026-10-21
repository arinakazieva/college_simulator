'use strict';

// Cached DOM references — populated once on init
const DOM = {};

// Module-level flag: true while a modal must not close on backdrop click (e.g. exam)
let _modalLocked = false;

function cacheDom() {
  DOM.app                = document.getElementById('app');
  DOM.splashScreen       = document.getElementById('splash-screen');
  DOM.btnSplashNew       = document.getElementById('btn-splash-new');
  DOM.btnSplashContinue  = document.getElementById('btn-splash-continue');

  DOM.dayDisplay         = document.getElementById('day-display');
  DOM.slotBadge          = document.getElementById('slot-badge');
  DOM.dayProgressBar     = document.getElementById('day-progress-bar');
  DOM.slotProgress       = document.getElementById('slot-progress');
  DOM.statsContainer     = document.getElementById('stats-container');
  DOM.npcContainer       = document.getElementById('npc-container');
  DOM.inventoryContainer = document.getElementById('inventory-container');
  DOM.currentSlotLabel   = document.getElementById('current-slot-label');
  DOM.slotHint           = document.getElementById('slot-hint');
  DOM.actionsContainer   = document.getElementById('actions-container');
  DOM.btnContinue        = document.getElementById('btn-continue');
  DOM.logList            = document.getElementById('log-list');
  DOM.modalOverlay       = document.getElementById('modal-overlay');
  DOM.modal              = DOM.modalOverlay.querySelector('.modal');
  DOM.modalTitle         = document.getElementById('modal-title');
  DOM.modalBody          = document.getElementById('modal-body');
  DOM.modalActions       = document.getElementById('modal-actions');
  DOM.btnNewGame         = document.getElementById('btn-new-game');
}

/* ================================================
   Header
   ================================================ */

function renderHeader() {
  const state     = getState();
  const slotName  = getCurrentSlot();
  const slotIndex = state.slotIndex;

  DOM.dayDisplay.textContent = `Day ${state.day} / ${CONFIG.MAX_DAY}`;
  DOM.slotBadge.textContent  = slotName;

  const dayPct = ((state.day - 1) / (CONFIG.MAX_DAY - 1)) * 100;
  DOM.dayProgressBar.style.width = `${dayPct.toFixed(2)}%`;

  DOM.slotProgress.innerHTML = CONFIG.SLOTS
    .map((s, i) => {
      const cls = i < slotIndex ? 'done' : i === slotIndex ? 'active' : '';
      return `<span class="slot-dot ${cls}">${s}</span>`;
    })
    .join('');
}

/* ================================================
   Stats
   ================================================ */

function renderStats() {
  const state = getState();
  DOM.statsContainer.innerHTML = Object.entries(CONFIG.STATS_CONFIG)
    .map(([key, cfg]) => buildStatCardHtml(key, cfg, state[key]))
    .join('');
}

function buildStatCardHtml(key, cfg, value) {
  let displayValue, barPct, barClass, warningClass = '';

  if (cfg.format === 'money') {
    const abs  = Math.abs(value);
    const sign = value < 0 ? '\u2212' : '';
    displayValue = `${sign}${abs.toLocaleString()} \u20BD`;
    barClass     = value >= 0 ? 'money-bar' : 'money-debt-bar';
    barPct       = value >= 0
      ? Math.min(100, (value / 10000) * 100)
      : Math.min(100, (abs / 20000) * 100);

  } else if (cfg.format === 'rating') {
    displayValue = `${value.toFixed(2)}<span class="stat-sub"> / 5.0</span>`;
    barClass     = 'rating-bar';
    barPct       = (value / 5) * 100;
    if (value < 2.0) warningClass = 'danger';
    else if (value < 3.0) warningClass = 'warning';

  } else {
    // percent
    displayValue = `${Math.round(value)}<span class="stat-sub">/${cfg.max}</span>`;
    barPct       = ((value - cfg.min) / (cfg.max - cfg.min)) * 100;
    barClass     = `${key}-bar`;
    if (cfg.inverted) {
      warningClass = value > 75 ? 'danger' : value > 50 ? 'warning' : '';
    } else {
      warningClass = value < 20 ? 'danger' : value < 35 ? 'warning' : '';
    }
  }

  return `
    <div class="stat-card" data-stat="${key}">
      <div class="stat-header">
        <span class="stat-label">${cfg.label}</span>
        <span class="stat-value">${displayValue}</span>
      </div>
      <div class="stat-bar-track">
        <div class="stat-bar-fill ${barClass} ${warningClass}"
             style="width: ${barPct.toFixed(1)}%"></div>
      </div>
    </div>`;
}

/* ================================================
   Actions
   ================================================ */

// Pick a contextual hint based on player state.
// Priorities: explicit "action taken" > stat warnings > exam proximity > slot atmosphere.
function getDynamicSlotHint(state, slot, isDisabled) {
  if (isDisabled) return 'Action taken \u2014 continue when ready.';

  if (state.mood    < 25) return 'You feel mentally drained. Take it easy today.';
  if (state.energy  < 20) return 'Your eyelids are heavy. You need rest soon.';
  if (state.hunger  > 80) return 'Your stomach is growling. Find food.';
  if (state.money   < -10000) return 'Your debt is mounting. Time to earn some money.';

  const nextExam = CONFIG.EXAM_DAYS.find((d) => d >= state.day);
  if (nextExam) {
    const days = nextExam - state.day;
    if (days === 0 && slot === 'Classes')      return 'Exam day. Time to deliver.';
    if (days > 0  && days <= 2)                return `Exam tension is building \u2014 ${days} day${days === 1 ? '' : 's'} to the next midterm.`;
  }

  const flavor = {
    Morning: 'Another college day begins. How will you start it?',
    Classes: 'The lecture hall is filling up.',
    Lunch:   'The cafeteria buzzes with mid-day conversation.',
    Evening: 'Sunset bleeds through the dorm windows.',
    Night:   'The campus settles into quiet.',
  };
  return flavor[slot] || 'Choose how to spend this time:';
}

function renderActions() {
  const state      = getState();
  const slot       = getCurrentSlot();
  const slotActions = CONFIG.ACTIONS[slot] || [];
  const isDisabled = state.actionTaken || state.isGameOver || state.isWin;

  DOM.currentSlotLabel.textContent = slot;
  DOM.slotHint.textContent = getDynamicSlotHint(state, slot, isDisabled);

  DOM.actionsContainer.innerHTML = slotActions
    .map((action) => buildActionBtnHtml(action, isDisabled))
    .join('');

  // Attach listeners only to enabled buttons
  DOM.actionsContainer.querySelectorAll('.action-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => executeAction(btn.dataset.action));
  });

  // Continue button is hidden for Night (auto-advances) and when no action yet
  const showContinue = state.actionTaken && slot !== 'Night' && !state.isGameOver && !state.isWin;
  DOM.btnContinue.classList.toggle('hidden', !showContinue);
}

function buildActionBtnHtml(action, isDisabled) {
  const effectsHtml    = buildEffectsHtml(action.effects);
  const disabledAttr   = isDisabled ? 'disabled' : '';
  const disabledClass  = isDisabled ? 'disabled'  : '';

  return `
    <button class="action-btn ${disabledClass}"
            data-action="${action.id}"
            ${disabledAttr}>
      <span class="action-label">${action.label}</span>
      <span class="action-desc">${action.description}</span>
      <span class="action-effects">${effectsHtml}</span>
    </button>`;
}

// Build coloured effect tag spans for action buttons
function buildEffectsHtml(effects) {
  return Object.entries(effects)
    .filter(([, delta]) => delta !== 0)
    .map(([key, delta]) => {
      const cfg = CONFIG.STATS_CONFIG[key];
      if (!cfg) return '';
      const sign = delta > 0 ? '+' : '';
      const cls  = delta > 0 ? 'effect-pos' : 'effect-neg';
      let text;
      if (cfg.format === 'money')       text = `${sign}${delta}\u20BD`;
      else if (cfg.format === 'rating') text = `${sign}${delta.toFixed(2)} GPA`;
      else                              text = `${sign}${delta} ${cfg.label}`;
      return `<span class="effect-tag ${cls}">${text}</span>`;
    })
    .join('');
}

/* ================================================
   Activity Log
   ================================================ */

function renderLog() {
  const { activityLog } = getState();

  if (activityLog.length === 0) {
    DOM.logList.innerHTML = '<li class="log-empty">No activity yet — start playing.</li>';
    return;
  }

  DOM.logList.innerHTML = activityLog
    .map((entry) => `
      <li class="log-entry">
        <span class="log-meta">Day ${entry.day} &middot; ${entry.slot}</span>
        <span class="log-action">${entry.label}</span>
        <span class="log-desc">${entry.text}</span>
        ${entry.effects ? `<span class="log-effects">${entry.effects}</span>` : ''}
      </li>`)
    .join('');
}

/* ================================================
   Full render pass
   ================================================ */

function renderUI() {
  renderHeader();
  renderStats();
  renderRelationships();
  renderInventory();
  renderActions();
  renderLog();
}

/* ================================================
   NPC Relationships
   ================================================ */

function renderRelationships() {
  if (!DOM.npcContainer) return;
  const state = getState();
  const rels  = state.relationships || {};

  DOM.npcContainer.innerHTML = Object.entries(CONFIG.NPCS)
    .map(([id, cfg]) => {
      const value = typeof rels[id] === 'number' ? rels[id] : 0;
      const pct   = Math.min(100, Math.max(0, value));
      const tone  = value >= 70 ? 'good' : value >= 40 ? '' : value >= 20 ? 'warning' : 'danger';
      return `
        <div class="npc-card" title="${cfg.description}">
          <div class="npc-header">
            <span class="npc-name">${cfg.label}</span>
            <span class="npc-value">${value}</span>
          </div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill npc-bar ${tone}" style="width: ${pct}%"></div>
          </div>
        </div>`;
    })
    .join('');
}

/* ================================================
   Inventory
   ================================================ */

function renderInventory() {
  if (!DOM.inventoryContainer) return;
  const state = getState();
  const inv   = Array.isArray(state.inventory) ? state.inventory : [];

  const notesFlagHtml = state.notesPrepared
    ? '<div class="inventory-flag">Notes prepared for next exam</div>'
    : '';

  if (inv.length === 0) {
    DOM.inventoryContainer.innerHTML = notesFlagHtml +
      '<div class="inventory-empty">No items yet. Study or work to find some.</div>';
    return;
  }

  // Group duplicates into counts
  const counts = inv.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
  const disabled = state.isGameOver || state.isWin;

  const itemsHtml = Object.entries(counts).map(([id, count]) => {
    const item = CONFIG.ITEMS[id];
    if (!item) return '';
    return `
      <div class="inventory-item">
        <div class="inv-info">
          <span class="inv-name">${item.label}${count > 1 ? ` <span class="inv-count">x${count}</span>` : ''}</span>
          <span class="inv-desc">${item.description}</span>
        </div>
        <button class="inv-use-btn" data-item="${id}" ${disabled ? 'disabled' : ''}>Use</button>
      </div>`;
  }).join('');

  DOM.inventoryContainer.innerHTML = notesFlagHtml + itemsHtml;

  DOM.inventoryContainer.querySelectorAll('.inv-use-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => useItem(btn.dataset.item));
  });
}

/* ================================================
   Modal system
   ================================================ */

function showModal({ title, body, buttons, locked, wide }) {
  DOM.modalTitle.textContent = title;
  DOM.modalBody.innerHTML    = body;
  DOM.modalActions.innerHTML = '';

  (buttons || []).forEach(({ label, className, onClick, disabled }) => {
    const btn       = document.createElement('button');
    btn.className   = `modal-btn ${className || ''}`.trim();
    btn.textContent = label;
    if (disabled) btn.disabled = true;
    btn.addEventListener('click', onClick);
    DOM.modalActions.appendChild(btn);
  });

  _modalLocked = !!locked;
  DOM.modal.classList.toggle('modal-wide', !!wide);
  DOM.modalOverlay.classList.add('visible');
  DOM.modalOverlay.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  _modalLocked = false;
  DOM.modal.classList.remove('modal-wide');
  DOM.modalOverlay.classList.remove('visible');
  DOM.modalOverlay.setAttribute('aria-hidden', 'true');
}

function closeAllModals() {
  closeModal();
}

function showGameOverModal(condition) {
  const state = getState();
  showModal({
    title: `Game Over \u2014 ${condition.title}`,
    body: `
      <p class="modal-message">${condition.message}</p>
      <div class="modal-summary">
        <div><span>Day reached</span><strong>${state.day}</strong></div>
        <div><span>Final GPA</span><strong>${state.rating.toFixed(2)}</strong></div>
        <div><span>Knowledge</span><strong>${Math.round(state.knowledge)}</strong></div>
        <div><span>Money left</span><strong>${state.money.toLocaleString()} \u20BD</strong></div>
      </div>`,
    buttons: [
      { label: 'New Game', className: 'btn-primary', onClick: startNewGame },
    ],
  });
}

function showEndingModal() {
  const state   = getState();
  const ending  = determineEnding(state);
  const avgRel  = Math.round(avgRelationship(state));
  const best    = bestRelationship(state);
  const bestStr = best && CONFIG.NPCS[best.npc]
    ? `${CONFIG.NPCS[best.npc].label} (${Math.round(best.value)})`
    : '—';

  showModal({
    title: ending.title,
    wide: true,
    locked: true,
    body: `
      <div class="ending-screen">
        <div class="ending-meta">
          <span class="ending-label">Graduation \u2014 Day ${state.day}</span>
        </div>
        <p class="modal-message ending-narrative">${ending.narrative}</p>
        <div class="modal-summary ending-summary">
          <div><span>Final GPA</span><strong>${state.rating.toFixed(2)} <em>/ 5.0</em></strong></div>
          <div><span>Money</span><strong>${state.money.toLocaleString()} \u20BD</strong></div>
          <div><span>Knowledge</span><strong>${Math.round(state.knowledge)} <em>/ 100</em></strong></div>
          <div><span>Mood</span><strong>${Math.round(state.mood)} <em>/ 100</em></strong></div>
          <div><span>Relationships</span><strong>${avgRel} <em>avg</em></strong></div>
          <div><span>Closest bond</span><strong>${bestStr}</strong></div>
        </div>
      </div>`,
    buttons: [
      { label: 'New Game', className: 'btn-primary', onClick: startNewGame },
    ],
  });
}

// Compatibility shim: anything that still calls showWinModal routes here.
function showWinModal() { showEndingModal(); }

/* ================================================
   Semester summary modal
   ================================================ */

function showSemesterModal(completedDay) {
  const state    = getState();
  const semester = Math.round(completedDay / 30);             // 1, 2, or 3
  const start    = state.semesterStart || { rating: 3.0, money: 12000, knowledge: 10 };

  // Capture deltas BEFORE we mutate snapshots
  const ratingDelta    = +(state.rating - start.rating).toFixed(2);
  const moneyDelta     = state.money - start.money;
  const knowledgeDelta = Math.round(state.knowledge - start.knowledge);

  const best      = bestRelationship(state);
  const bestLabel = best && CONFIG.NPCS[best.npc]
    ? `${CONFIG.NPCS[best.npc].label} <em>(${Math.round(best.value)})</em>`
    : '\u2014';

  const expelled  = state.rating < CONFIG.EXPULSION_THRESHOLD;
  const probation = !expelled && state.rating < CONFIG.PROBATION_THRESHOLD;

  // Mark this summary as PENDING so a reload restores it.
  // Finalization (semestersSeen + new semesterStart snapshot) happens on Continue.
  setState({ pendingSemester: completedDay });
  saveGame(getState());

  // Expulsion bypasses the summary and goes straight to game over
  if (expelled) {
    const reason = {
      title: 'Expelled',
      message: `Your GPA fell below ${CONFIG.EXPULSION_THRESHOLD.toFixed(1)} at the end of semester ${semester}. ` +
               'The dean\u2019s office handed down the verdict. You\u2019re out.',
    };
    setState({ isGameOver: true, gameOverReason: reason, pendingSemester: null });
    saveGame(getState());
    showGameOverModal(reason);
    return;
  }

  const headerNote = probation
    ? `<div class="semester-warning">Academic probation \u2014 GPA below ${CONFIG.PROBATION_THRESHOLD.toFixed(1)}. Pull it up next semester.</div>`
    : (state.rating >= 4.0
        ? '<div class="semester-praise">Strong performance. Keep it up.</div>'
        : '');

  const fmtDelta = (n, suffix = '') => {
    if (n === 0) return `&plusmn;0${suffix}`;
    const sign = n > 0 ? '+' : '';
    return `${sign}${n}${suffix}`;
  };

  showModal({
    title:  `Semester ${semester} of ${CONFIG.SEMESTER_TOTAL} \u2014 Complete`,
    locked: true,
    body: `
      <p class="modal-message">
        ${completedDay} days down, ${CONFIG.MAX_DAY - completedDay} to go. Here\u2019s how the term shook out.
      </p>
      ${headerNote}
      <div class="modal-summary semester-summary">
        <div><span>Current GPA</span><strong>${state.rating.toFixed(2)} <em>(${fmtDelta(ratingDelta)})</em></strong></div>
        <div><span>Money</span><strong>${state.money.toLocaleString()} \u20BD <em>(${fmtDelta(moneyDelta)})</em></strong></div>
        <div><span>Knowledge</span><strong>${Math.round(state.knowledge)} <em>(${fmtDelta(knowledgeDelta)})</em></strong></div>
        <div><span>Best relationship</span><strong>${bestLabel}</strong></div>
      </div>`,
    buttons: [
      { label: 'Begin Next Semester', className: 'btn-primary',
        onClick: () => acknowledgeSemester(completedDay) },
    ],
  });
}

// Finalize a semester summary: snapshot for next semester, mark seen, clear pending
function acknowledgeSemester(completedDay) {
  const cur = getState();
  const seen = { ...(cur.semestersSeen || {}), [completedDay]: true };
  setState({
    semestersSeen:   seen,
    pendingSemester: null,
    semesterStart: {
      rating:    cur.rating,
      money:     cur.money,
      knowledge: cur.knowledge,
      day:       cur.day,
    },
  });
  saveGame(getState());
  closeModal();
  renderUI();

  // After acknowledging, still trigger any exam due on the new day's Classes slot
  if (tryTriggerExam()) return;
  const ev = maybeFireEvent(getState());
  if (ev) showEventModal(ev);
}

function showEventModal(event) {
  // Build a body with description + per-choice preview text
  const choicesPreview = event.choices.map((c) =>
    `<li><strong>${c.label}</strong>${c.description ? ` \u2014 <span class="modal-soft">${c.description}</span>` : ''}</li>`
  ).join('');

  const body = `
    <p class="modal-message">${event.description}</p>
    <ul class="modal-choice-list">${choicesPreview}</ul>`;

  showModal({
    title: event.title,
    body,
    buttons: event.choices.map((choice) => ({
      label:     choice.label,
      className: 'btn-secondary',
      onClick:   () => applyEventChoice(event, choice),
    })),
  });
}

function applyEventChoice(event, choice) {
  const logParts = [];

  if (choice.effects && Object.keys(choice.effects).length) {
    applyEffects(choice.effects);
    logParts.push(formatEffectsText(choice.effects));
  }
  if (choice.relationships) {
    adjustRelationships(choice.relationships);
    logParts.push(formatRelationshipsText(choice.relationships));
  }
  if (choice.grantItem) {
    if (addItem(choice.grantItem)) {
      const it = CONFIG.ITEMS[choice.grantItem];
      logParts.push(`Got ${it.label}`);
    }
  }
  if (choice.removeItem) {
    if (removeItem(choice.removeItem)) {
      const it = CONFIG.ITEMS[choice.removeItem];
      logParts.push(`Lost ${it.label}`);
    }
  }

  addLogEntry({
    day:     getState().day,
    slot:    getCurrentSlot(),
    label:   `Event: ${event.title}`,
    text:    `You chose: ${choice.label}`,
    effects: combineEffectParts(logParts),
  });

  saveGame(getState());
  closeModal();
  renderUI();

  const lose = checkLoseConditions();
  if (lose) {
    setState({ isGameOver: true, gameOverReason: { title: lose.title, message: lose.message } });
    saveGame(getState());
    showGameOverModal(lose);
  }
}

/* ================================================
   Exam modal
   ================================================ */

// Pick N random questions from the pool without repeats
function pickExamQuestions(n) {
  const pool = CONFIG.EXAM_QUESTIONS.slice();
  const out = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

let _examTimerHandle = null;

function showExamModal(examDay) {
  const questions = pickExamQuestions(CONFIG.EXAM_QUESTIONS_PER_RUN);
  const answers   = new Array(questions.length).fill(null);

  const state           = getState();
  const usedNotes       = !!state.notesPrepared;
  const knowledgeBonus  = state.knowledge >= 80 ? 2 : state.knowledge >= 50 ? 1 : 0;

  let timeLeft = CONFIG.EXAM_DURATION;
  let finished = false;

  renderExamUI();
  _examTimerHandle = setInterval(() => {
    timeLeft -= 1;
    updateTimerDisplay();
    if (timeLeft <= 0) finishExam();
  }, 1000);

  function buildBodyHtml() {
    const intro = `
      <div class="exam-intro">
        <span class="exam-day-label">Midterm \u2014 Day ${examDay}</span>
        <span class="exam-timer" id="exam-timer">${formatTime(timeLeft)}</span>
      </div>
      <p class="modal-message exam-blurb">
        ${questions.length} questions. Answer carefully \u2014 timer is running.
        ${usedNotes        ? '<br><em>Your prepared notes will give a bonus.</em>' : ''}
        ${knowledgeBonus   ? `<br><em>Your studies give you +${knowledgeBonus} bonus question${knowledgeBonus > 1 ? 's' : ''}.</em>` : ''}
      </p>`;

    const qHtml = questions.map((q, qi) => `
      <div class="exam-question" data-q="${qi}">
        <div class="exam-q-text"><span class="exam-q-num">${qi + 1}.</span> ${q.q}</div>
        <div class="exam-choices">
          ${q.choices.map((c, ci) => `
            <label class="exam-choice">
              <input type="radio" name="eq-${qi}" value="${ci}" data-q="${qi}" />
              <span>${c}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    return intro + `<div class="exam-questions">${qHtml}</div>`;
  }

  function renderExamUI() {
    showModal({
      title: 'Exam',
      body:  buildBodyHtml(),
      wide:  true,
      locked: true,
      buttons: [
        { label: 'Submit', className: 'btn-primary', onClick: () => finishExam() },
      ],
    });

    // Wire up radios to track answers
    DOM.modalBody.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const qi = parseInt(e.target.dataset.q, 10);
        answers[qi] = parseInt(e.target.value, 10);
      });
    });
  }

  function updateTimerDisplay() {
    const el = document.getElementById('exam-timer');
    if (!el) return;
    el.textContent = formatTime(timeLeft);
    if (timeLeft <= 15) el.classList.add('exam-timer-warn');
    if (timeLeft <= 5)  el.classList.add('exam-timer-danger');
  }

  function formatTime(s) {
    const m  = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  function finishExam() {
    if (finished) return;
    finished = true;
    clearInterval(_examTimerHandle);
    _examTimerHandle = null;

    let correct = 0;
    questions.forEach((q, qi) => { if (answers[qi] === q.correct) correct++; });

    let finalScore = correct + knowledgeBonus + (usedNotes ? 1 : 0);
    if (finalScore > questions.length) finalScore = questions.length;

    const ratio       = finalScore / questions.length;
    const ratingDelta = Math.round(((ratio - 0.5) * 0.8) * 100) / 100;
    const moodDelta   = Math.round((ratio - 0.5) * 40);

    // Apply outcomes
    applyEffects({ rating: ratingDelta, mood: moodDelta });
    if (usedNotes) setState({ notesPrepared: false });

    // Mark exam done + consume the classes slot
    const examsDone = Object.assign({}, getState().examsDone || {});
    examsDone[examDay] = true;
    setState({ examsDone, actionTaken: true });

    // Relationship reactions
    if (ratio >= 0.8)      adjustRelationships({ teacher: 4, headman: 2 });
    else if (ratio <= 0.4) adjustRelationships({ teacher: -3, headman: -1 });

    addLogEntry({
      day:     getState().day,
      slot:    getCurrentSlot(),
      label:   `Midterm Exam (Day ${examDay})`,
      text:    `Scored ${finalScore} / ${questions.length}` +
               (usedNotes ? ' (notes used)' : '') +
               (knowledgeBonus ? ` (+${knowledgeBonus} from studying)` : ''),
      effects: combineEffectParts([
        formatEffectsText({ rating: ratingDelta, mood: moodDelta }),
      ]),
    });

    saveGame(getState());

    // Show result modal
    const grade = ratio >= 0.9 ? 'Excellent'
                : ratio >= 0.75 ? 'Good'
                : ratio >= 0.5 ? 'Pass'
                : ratio >= 0.3 ? 'Weak Pass'
                : 'Failed';

    closeModal();
    showModal({
      title: `Exam Result \u2014 ${grade}`,
      body: `
        <div class="exam-result">
          <div class="exam-score">${finalScore} <span>/ ${questions.length}</span></div>
          <p class="modal-message">
            ${ratio >= 0.7
              ? 'You walked out feeling confident. That preparation paid off.'
              : ratio >= 0.4
                ? 'A passing effort, but you know you could do better.'
                : 'That hurt. Time to regroup before the next one.'}
          </p>
          <div class="modal-summary">
            <div><span>GPA change</span><strong>${ratingDelta >= 0 ? '+' : ''}${ratingDelta.toFixed(2)}</strong></div>
            <div><span>Mood change</span><strong>${moodDelta >= 0 ? '+' : ''}${moodDelta}</strong></div>
          </div>
        </div>`,
      buttons: [
        { label: 'Continue', className: 'btn-primary', onClick: () => {
            closeModal();
            renderUI();
            const lose = checkLoseConditions();
            if (lose) {
              setState({ isGameOver: true, gameOverReason: { title: lose.title, message: lose.message } });
              saveGame(getState());
              showGameOverModal(lose);
            }
          }
        },
      ],
    });
  }
}

/* ================================================
   Init
   ================================================ */

function initUI() {
  cacheDom();
  bindGlobalListeners();
  showSplash();
}

function bindGlobalListeners() {
  DOM.btnContinue.addEventListener('click', advanceSlot);

  DOM.btnNewGame.addEventListener('click', () => {
    showModal({
      title: 'New Game',
      body:  '<p class="modal-message">Start over? Your current run will be lost.</p>',
      buttons: [
        { label: 'Start Over', className: 'btn-danger',     onClick: startNewGame },
        { label: 'Cancel',     className: 'btn-secondary',  onClick: closeModal   },
      ],
    });
  });

  // Close modal on backdrop click (not during locked / terminal states)
  DOM.modalOverlay.addEventListener('click', (e) => {
    if (e.target !== DOM.modalOverlay) return;
    if (_modalLocked) return;
    const state = getState();
    if (!state.isGameOver && !state.isWin) closeModal();
  });

  DOM.btnSplashNew.addEventListener('click', () => {
    startNewGame();
    hideSplash();
  });
  DOM.btnSplashContinue.addEventListener('click', () => {
    hideSplash();
    restorePendingModals();
  });
}

/* ================================================
   Splash / Start screen
   ================================================ */

function showSplash() {
  const hasSave = loadGame() !== null;
  DOM.btnSplashContinue.disabled = !hasSave;
  DOM.btnSplashContinue.classList.toggle('splash-btn-disabled', !hasSave);
  DOM.splashScreen.classList.remove('splash-hidden');
  DOM.app.classList.add('app-hidden');
}

function hideSplash() {
  DOM.splashScreen.classList.add('splash-hidden');
  DOM.app.classList.remove('app-hidden');
  renderUI();
}

// Re-show terminal/pending modals if we resumed mid-game (post-reload)
function restorePendingModals() {
  const state = getState();
  if (state.isWin) {
    showEndingModal();
    return;
  }
  if (state.isGameOver && state.gameOverReason) {
    showGameOverModal(state.gameOverReason);
    return;
  }
  if (state.pendingSemester) {
    showSemesterModal(state.pendingSemester);
    return;
  }
  if (
    !state.actionTaken &&
    getCurrentSlot() === 'Classes' &&
    CONFIG.EXAM_DAYS.includes(state.day) &&
    !(state.examsDone && state.examsDone[state.day])
  ) {
    showExamModal(state.day);
  }
}
