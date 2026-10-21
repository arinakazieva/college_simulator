'use strict';

// Single mutable state object. All mutations go through setState / applyEffects.
let _state = null;

function clamp(value, min, max) {
  if (max === Infinity) return Math.max(value, min);
  return Math.min(Math.max(value, min), max);
}

// Enforce min/max on every numeric stat after each mutation
function clampAllStats(state) {
  const sc = CONFIG.STATS_CONFIG;
  for (const key of Object.keys(sc)) {
    if (key in state && typeof state[key] === 'number') {
      state[key] = clamp(state[key], sc[key].min, sc[key].max);
    }
  }
  // Keep money integer, rating to 2 decimal places
  state.money  = Math.round(state.money);
  state.rating = Math.round(state.rating * 100) / 100;

  // Clamp relationships into [0, 100] and round
  if (state.relationships && typeof state.relationships === 'object') {
    const rr = CONFIG.RELATIONSHIP_RANGE;
    for (const npc of Object.keys(state.relationships)) {
      const v = state.relationships[npc];
      if (typeof v === 'number') {
        state.relationships[npc] = Math.round(clamp(v, rr.min, rr.max));
      }
    }
  }
  return state;
}

function getState() {
  return _state;
}

function setState(updates) {
  Object.assign(_state, updates);
  clampAllStats(_state);
}

// Bootstrap: merge saved data over a fresh initial state to handle version drift
function initState(savedData) {
  _state = JSON.parse(JSON.stringify(CONFIG.INITIAL_STATE));
  if (savedData && typeof savedData === 'object') {
    for (const key of Object.keys(CONFIG.INITIAL_STATE)) {
      if (key in savedData) {
        _state[key] = savedData[key];
      }
    }
  }
  sanitizeState(_state);
  clampAllStats(_state);
}

// Defensive validator: replace any NaN, undefined, or wrong-typed values with safe defaults.
// Protects against corrupted localStorage and forward-incompatible saves.
function sanitizeState(state) {
  const init = CONFIG.INITIAL_STATE;

  // Numeric stats
  for (const key of Object.keys(CONFIG.STATS_CONFIG)) {
    const v = state[key];
    if (typeof v !== 'number' || !isFinite(v)) state[key] = init[key];
  }

  // Day + slot index
  if (typeof state.day !== 'number' || !isFinite(state.day) ||
      state.day < 1 || state.day > CONFIG.MAX_DAY) {
    state.day = init.day;
  }
  if (typeof state.slotIndex !== 'number' || !isFinite(state.slotIndex) ||
      state.slotIndex < 0 || state.slotIndex >= CONFIG.SLOTS.length) {
    state.slotIndex = init.slotIndex;
  }

  // Booleans
  state.actionTaken   = !!state.actionTaken;
  state.isGameOver    = !!state.isGameOver;
  state.isWin         = !!state.isWin;
  state.notesPrepared = !!state.notesPrepared;

  // Activity log
  if (!Array.isArray(state.activityLog)) state.activityLog = [];

  // Game-over reason
  if (state.gameOverReason && typeof state.gameOverReason !== 'object') {
    state.gameOverReason = null;
  }

  // Relationships
  if (!state.relationships || typeof state.relationships !== 'object') {
    state.relationships = { ...init.relationships };
  } else {
    for (const npc of Object.keys(init.relationships)) {
      const v = state.relationships[npc];
      if (typeof v !== 'number' || !isFinite(v)) {
        state.relationships[npc] = init.relationships[npc];
      }
    }
  }

  // Inventory — drop unknown ids defensively
  if (!Array.isArray(state.inventory)) {
    state.inventory = [];
  } else {
    state.inventory = state.inventory.filter((id) => !!CONFIG.ITEMS[id]);
  }

  // Maps
  if (!state.actionStreaks || typeof state.actionStreaks !== 'object') state.actionStreaks = {};
  if (!state.examsDone     || typeof state.examsDone     !== 'object') state.examsDone     = {};
  if (!state.semestersSeen || typeof state.semestersSeen !== 'object') state.semestersSeen = {};

  // Pending semester: either null or a valid SEMESTER_DAYS entry
  if (state.pendingSemester != null &&
      (typeof state.pendingSemester !== 'number' ||
       !CONFIG.SEMESTER_DAYS.includes(state.pendingSemester))) {
    state.pendingSemester = null;
  }

  // Semester snapshot
  if (!state.semesterStart || typeof state.semesterStart !== 'object') {
    state.semesterStart = { ...init.semesterStart };
  } else {
    ['rating', 'money', 'knowledge', 'day'].forEach((k) => {
      if (typeof state.semesterStart[k] !== 'number' || !isFinite(state.semesterStart[k])) {
        state.semesterStart[k] = init.semesterStart[k];
      }
    });
  }
}

function resetState() {
  _state = JSON.parse(JSON.stringify(CONFIG.INITIAL_STATE));
}

// Apply a map of { statKey: delta } values to current state
function applyEffects(effects) {
  if (!effects || typeof effects !== 'object') return;
  const updates = {};
  for (const [key, delta] of Object.entries(effects)) {
    if (key in _state && typeof _state[key] === 'number') {
      updates[key] = _state[key] + delta;
    }
  }
  setState(updates);
}

// Prepend a log entry; cap at LOG_MAX_ENTRIES
function addLogEntry(entry) {
  const updated = [entry, ..._state.activityLog];
  if (updated.length > CONFIG.LOG_MAX_ENTRIES) {
    updated.length = CONFIG.LOG_MAX_ENTRIES;
  }
  _state.activityLog = updated;
}

function getCurrentSlot() {
  return CONFIG.SLOTS[_state.slotIndex];
}

function isLastSlot() {
  return _state.slotIndex === CONFIG.SLOTS.length - 1;
}

/* ================================================
   Relationships
   ================================================ */

function avgRelationship(state) {
  const r = state.relationships || {};
  const vals = Object.values(r).filter((v) => typeof v === 'number');
  if (vals.length === 0) return 0;
  return vals.reduce((acc, v) => acc + v, 0) / vals.length;
}

function bestRelationship(state) {
  const r = state.relationships || {};
  let best = null;
  for (const [npc, v] of Object.entries(r)) {
    if (typeof v !== 'number') continue;
    if (!best || v > best.value) best = { npc, value: v };
  }
  return best;
}

function adjustRelationships(deltas) {
  if (!deltas || typeof deltas !== 'object') return;
  if (!_state.relationships) _state.relationships = {};
  for (const [npc, delta] of Object.entries(deltas)) {
    if (typeof delta !== 'number') continue;
    const current = _state.relationships[npc] || 0;
    _state.relationships[npc] = current + delta;
  }
  clampAllStats(_state);
}

/* ================================================
   Inventory
   ================================================ */

function addItem(itemId) {
  if (!CONFIG.ITEMS[itemId]) return false;
  if (!Array.isArray(_state.inventory)) _state.inventory = [];
  _state.inventory.push(itemId);
  return true;
}

function removeItem(itemId) {
  if (!Array.isArray(_state.inventory)) return false;
  const idx = _state.inventory.indexOf(itemId);
  if (idx < 0) return false;
  _state.inventory.splice(idx, 1);
  return true;
}

function hasItem(itemId) {
  return Array.isArray(_state.inventory) && _state.inventory.includes(itemId);
}

/* ================================================
   Action streak tracking + diminishing returns
   ================================================ */

// Returns the new streak count for actionId, decaying counters for siblings
function recordActionStreak(actionId, slotName) {
  const slotActions = CONFIG.ACTIONS[slotName] || [];
  // Only track streaks when the slot offers a real choice
  if (slotActions.length < 2) return 1;

  if (!_state.actionStreaks || typeof _state.actionStreaks !== 'object') {
    _state.actionStreaks = {};
  }
  const streaks = _state.actionStreaks;

  // Decay counters for other actions, prune zeros
  for (const id of Object.keys(streaks)) {
    if (id !== actionId) {
      streaks[id] = Math.max(0, (streaks[id] || 0) - 1);
      if (streaks[id] === 0) delete streaks[id];
    }
  }

  streaks[actionId] = (streaks[actionId] || 0) + 1;
  return streaks[actionId];
}

// Returns a new effects object with negative numbers scaled up when streak is high
function applyStreakPenalty(effects, streak) {
  if (!effects || streak < CONFIG.STREAK_THRESHOLD) return { ...effects };
  const stepsOver = streak - (CONFIG.STREAK_THRESHOLD - 1);
  const multiplier = Math.min(
    1 + CONFIG.STREAK_STEP * stepsOver,
    CONFIG.STREAK_MAX_MULTIPLIER
  );
  const adjusted = {};
  for (const [k, v] of Object.entries(effects)) {
    if (typeof v === 'number' && v < 0) {
      adjusted[k] = Math.round(v * multiplier * 100) / 100;
    } else {
      adjusted[k] = v;
    }
  }
  return adjusted;
}
