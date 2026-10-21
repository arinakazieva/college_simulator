'use strict';

/* ================================================
   Formatting helpers
   ================================================ */

// Formats an effects map into a readable plain-text string for the activity log
function formatEffectsText(effects) {
  if (!effects) return '';
  return Object.entries(effects)
    .filter(([, delta]) => delta !== 0)
    .map(([key, delta]) => {
      const cfg = CONFIG.STATS_CONFIG[key];
      if (!cfg) return null;
      const sign = delta > 0 ? '+' : '';
      if (cfg.format === 'money')  return `${sign}${delta}\u20BD`;
      if (cfg.format === 'rating') return `${sign}${(+delta).toFixed(2)} GPA`;
      return `${sign}${delta} ${cfg.label}`;
    })
    .filter(Boolean)
    .join(' \u00B7 ');
}

function formatRelationshipsText(deltas) {
  if (!deltas) return '';
  return Object.entries(deltas)
    .filter(([, delta]) => delta !== 0)
    .map(([npc, delta]) => {
      const cfg  = CONFIG.NPCS[npc];
      const name = cfg ? cfg.label : npc;
      const sign = delta > 0 ? '+' : '';
      return `${sign}${delta} ${name}`;
    })
    .join(' \u00B7 ');
}

// Combine optional stat / relationship / item / penalty parts into one log line
function combineEffectParts(parts) {
  return parts.filter(Boolean).join(' \u00B7 ');
}

/* ================================================
   Action execution
   ================================================ */

function executeAction(actionId) {
  const state = getState();

  // Guards
  if (state.actionTaken || state.isGameOver || state.isWin) return;

  const slot   = getCurrentSlot();
  const action = (CONFIG.ACTIONS[slot] || []).find((a) => a.id === actionId);
  if (!action) return;

  // ── Diminishing returns ───────────────────────────
  const streak           = recordActionStreak(actionId, slot);
  const adjustedEffects  = applyStreakPenalty(action.effects, streak);

  // ── Apply effects + relationships ────────────────
  applyEffects(adjustedEffects);
  adjustRelationships(action.relationships);
  setState({ actionTaken: true });

  // ── Item gain roll ───────────────────────────────
  let gainedItem = null;
  if (action.itemRoll && Math.random() < action.itemRoll.chance) {
    if (addItem(action.itemRoll.item)) {
      gainedItem = action.itemRoll.item;
    }
  }

  // ── Build activity log entry ─────────────────────
  const logParts = [
    formatEffectsText(adjustedEffects),
    formatRelationshipsText(action.relationships),
  ];
  if (gainedItem) {
    const item = CONFIG.ITEMS[gainedItem];
    logParts.push(`Got ${item.label}`);
  }
  if (streak >= CONFIG.STREAK_THRESHOLD) {
    logParts.push('Fatigue penalty');
  }

  addLogEntry({
    day:     getState().day,
    slot,
    label:   action.label,
    text:    action.description,
    effects: combineEffectParts(logParts),
  });

  saveGame(getState());
  renderUI();

  // ── Lose check ──────────────────────────────────
  const loseCondition = checkLoseConditions();
  if (loseCondition) {
    setState({
      isGameOver: true,
      gameOverReason: { title: loseCondition.title, message: loseCondition.message },
    });
    saveGame(getState());
    showGameOverModal(loseCondition);
    return;
  }

  // ── Night/Sleep auto-advances ───────────────────
  if (slot === 'Night') {
    setTimeout(advanceSlot, 750);
  }
}

/* ================================================
   Use an item from inventory
   ================================================ */

function useItem(itemId) {
  const state = getState();
  if (state.isGameOver || state.isWin) return;
  if (!hasItem(itemId)) return;

  const item = CONFIG.ITEMS[itemId];
  if (!item || typeof item.use !== 'function') return;

  const result = item.use(state) || {};

  if (result.effects) applyEffects(result.effects);
  if (result.flag)    setState({ [result.flag]: true });
  if (result.consume !== false) removeItem(itemId);

  addLogEntry({
    day:     getState().day,
    slot:    getCurrentSlot(),
    label:   `Used ${item.label}`,
    text:    result.message || item.description,
    effects: result.effects ? formatEffectsText(result.effects) : '',
  });

  saveGame(getState());
  renderUI();

  const loseCondition = checkLoseConditions();
  if (loseCondition) {
    setState({
      isGameOver: true,
      gameOverReason: { title: loseCondition.title, message: loseCondition.message },
    });
    saveGame(getState());
    showGameOverModal(loseCondition);
  }
}
