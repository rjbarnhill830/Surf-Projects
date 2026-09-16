// Drop-in replacement for the Claude-artifact-only `window.storage` API,
// backed by browser localStorage so this app runs as a plain static page.
const STORAGE_PREFIX = 'surf-predictor:';

const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw === null ? null : { value: raw };
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
      console.error('could not write to localStorage', e);
    }
  },

  async delete(key) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch (e) {
      console.error('could not remove from localStorage', e);
    }
  },

  async list(prefix) {
    const keys = [];
    try {
      const fullPrefix = STORAGE_PREFIX + prefix;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          keys.push(k.slice(STORAGE_PREFIX.length));
        }
      }
    } catch (e) {
      /* localStorage unavailable */
    }
    return { keys };
  }
};
