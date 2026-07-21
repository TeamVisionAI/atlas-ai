/**
 * Sprint 12.3 — Prospect persistence (repository layer).
 * MVP: JSON file store with in-memory index.
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../data/prospects.json");

function readStoreFile() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return createEmptyStore();
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return createEmptyStore();
  }
}

function writeStoreFile(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function createEmptyStore() {
  return {
    sequence: 0,
    prospects: {}
  };
}

class ProspectRepository {
  constructor() {
    /** @type {Map<string, Object>} */
    this._prospects = new Map();
    /** @type {Map<string, string>} */
    this._channelIndex = new Map();
    this._sequence = 0;
    this._loadFromDisk();
  }

  _channelKey(channel, channelUserId) {
    return `${channel}:${channelUserId}`;
  }

  _loadFromDisk() {
    const store = readStoreFile();
    this._sequence = Number(store.sequence) || 0;

    for (const [atlasId, prospect] of Object.entries(store.prospects || {})) {
      this._prospects.set(atlasId, prospect);

      for (const identity of prospect.channelIdentities || []) {
        this._channelIndex.set(
          this._channelKey(identity.channel, identity.channelUserId),
          atlasId
        );
      }
    }
  }

  _persist() {
    const prospects = {};

    for (const [atlasId, prospect] of this._prospects.entries()) {
      prospects[atlasId] = prospect;
    }

    writeStoreFile({
      sequence: this._sequence,
      prospects
    });
  }

  /**
   * @returns {Promise<number>}
   */
  async nextSequence() {
    this._sequence += 1;
    this._persist();
    return this._sequence;
  }

  /**
   * @param {string} channel
   * @param {string} channelUserId
   * @returns {Promise<Object|null>}
   */
  async findByChannelIdentity(channel, channelUserId) {
    const atlasId = this._channelIndex.get(this._channelKey(channel, channelUserId));
    return atlasId ? this._prospects.get(atlasId) || null : null;
  }

  /**
   * @param {string} atlasId
   * @returns {Promise<Object|null>}
   */
  async findByAtlasId(atlasId) {
    return this._prospects.get(atlasId) || null;
  }

  /**
   * @param {Object} prospect
   */
  async save(prospect) {
    this._prospects.set(prospect.atlasId, prospect);

    for (const identity of prospect.channelIdentities || []) {
      this._channelIndex.set(
        this._channelKey(identity.channel, identity.channelUserId),
        prospect.atlasId
      );
    }

    this._persist();
    return prospect;
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async listAll() {
    return Array.from(this._prospects.values());
  }

  reset() {
    this._prospects.clear();
    this._channelIndex.clear();
    this._sequence = 0;
    writeStoreFile(createEmptyStore());
  }
}

module.exports = {
  ProspectRepository,
  STORE_FILE
};
