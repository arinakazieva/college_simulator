'use strict';

function saveGame(state) {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[storage] save failed:', err);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[storage] load failed:', err);
    return null;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
  } catch (err) {
    console.warn('[storage] clear failed:', err);
  }
}
