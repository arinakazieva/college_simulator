'use strict';

// Returns the first failing condition object, or null if all is fine
function checkLoseConditions() {
  const state = getState();
  for (const cond of CONFIG.GAME_OVER_CONDITIONS) {
    if (cond.check(state[cond.stat])) return cond;
  }
  return null;
}

// Advance to the next slot; if Night was last, move to the next day
function advanceSlot() {
  const state = getState();
  if (state.isGameOver || state.isWin) return;

  // Require an action before advancing (guards against double-advance bugs)
  if (!state.actionTaken) return;

  if (isLastSlot()) {
    const completedDay = state.day;
    const nextDay     = completedDay + 1;

    if (nextDay > CONFIG.MAX_DAY) {
      setState({ isWin: true });
      saveGame(getState());
      renderUI();
      showEndingModal();
      return;
    }

    setState({ day: nextDay, slotIndex: 0, actionTaken: false });
    saveGame(getState());
    renderUI();

    // End-of-semester check (after the day flipped, before any random event)
    if (CONFIG.SEMESTER_DAYS.includes(completedDay) &&
        !(getState().semestersSeen && getState().semestersSeen[completedDay])) {
      showSemesterModal(completedDay);
      return;
    }
  } else {
    setState({ slotIndex: state.slotIndex + 1, actionTaken: false });
    saveGame(getState());
    renderUI();
  }

  // Exams take priority over random events
  if (tryTriggerExam()) return;

  // Try to fire a random event for this new slot
  const event = maybeFireEvent(getState());
  if (event) showEventModal(event);
}

// Pick the highest-priority matching ending for the current state
function determineEnding(state) {
  const helpers = { avgRel: avgRelationship(state) };
  for (const ending of CONFIG.ENDINGS) {
    try {
      if (ending.condition(state, helpers)) return ending;
    } catch (_) { /* skip malformed conditions defensively */ }
  }
  return CONFIG.ENDINGS[CONFIG.ENDINGS.length - 1];
}

// Returns true if an exam was triggered for the current slot
function tryTriggerExam() {
  const state = getState();
  if (state.isGameOver || state.isWin) return false;
  if (getCurrentSlot() !== 'Classes') return false;
  if (!CONFIG.EXAM_DAYS.includes(state.day)) return false;
  if (state.examsDone && state.examsDone[state.day]) return false;
  showExamModal(state.day);
  return true;
}

// Full reset — clear save, rebuild state from scratch, re-render
function startNewGame() {
  clearSave();
  resetState();
  saveGame(getState());
  closeAllModals();
  if (typeof hideSplash === 'function' &&
      document.getElementById('splash-screen') &&
      !document.getElementById('splash-screen').classList.contains('splash-hidden')) {
    hideSplash();
  } else {
    renderUI();
  }
}
