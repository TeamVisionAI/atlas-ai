/**
 * Sprint 15.0 — Mission Control repository (Supabase + in-memory fallback).
 */

const { supabase } = require("../../../services/supabaseService");
const { MissionControlReadModel } = require("../domain/MissionControlReadModel");
const { InMemoryMissionControlStore } = require("./InMemoryMissionControlStore");
const {
  STATE_TABLE,
  PROCESSED_TABLE,
  toStateRow,
  fromStateRow,
  toProcessedRow
} = require("./MissionControlMapper");
const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");

function isMissingTable(error, tableName) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes(tableName) ||
    String(error.message || "").includes("does not exist")
  );
}

class MissionControlRepository {
  constructor() {
    this.memory = new InMemoryMissionControlStore();
    this.useMemory = false;
  }

  async loadReadModel(organizationId = DEFAULT_ORGANIZATION_ID) {
    if (this.useMemory) {
      return this.memory.loadReadModel(organizationId);
    }

    const { data, error } = await supabase
      .from(STATE_TABLE)
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error, STATE_TABLE)) {
        this.useMemory = true;
        return this.loadReadModel(organizationId);
      }

      throw error;
    }

    if (!data) {
      return MissionControlReadModel.empty(organizationId);
    }

    return MissionControlReadModel.fromSnapshot(fromStateRow(data));
  }

  async saveReadModel(readModel) {
    if (this.useMemory) {
      return this.memory.saveReadModel(readModel);
    }

    const row = toStateRow(readModel);
    const { error } = await supabase.from(STATE_TABLE).upsert(row, {
      onConflict: "organization_id"
    });

    if (error) {
      if (isMissingTable(error, STATE_TABLE)) {
        this.useMemory = true;
        return this.saveReadModel(readModel);
      }

      throw error;
    }

    return readModel;
  }

  async isEventProcessed(eventId) {
    if (this.useMemory) {
      return this.memory.isEventProcessed(eventId);
    }

    const { data, error } = await supabase
      .from(PROCESSED_TABLE)
      .select("business_event_id")
      .eq("business_event_id", eventId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error, PROCESSED_TABLE)) {
        this.useMemory = true;
        return this.isEventProcessed(eventId);
      }

      throw error;
    }

    return Boolean(data);
  }

  async markEventProcessed(eventId, organizationId = DEFAULT_ORGANIZATION_ID) {
    if (this.useMemory) {
      this.memory.markEventProcessed(eventId);
      return;
    }

    const row = toProcessedRow(eventId, organizationId);
    const { error } = await supabase.from(PROCESSED_TABLE).upsert(row, {
      onConflict: "business_event_id"
    });

    if (error) {
      if (error.code === "23505") {
        return;
      }

      if (isMissingTable(error, PROCESSED_TABLE)) {
        this.useMemory = true;
        return this.markEventProcessed(eventId, organizationId);
      }

      throw error;
    }
  }

  /**
   * @param {Object} businessEvent — BusinessEvent.toJSON()
   * @param {string} organizationId
   */
  async applyEvent(businessEvent, organizationId = DEFAULT_ORGANIZATION_ID) {
    const readModel = await this.loadReadModel(organizationId);
    readModel.applyEvent(businessEvent);
    await this.saveReadModel(readModel);
    return readModel;
  }

  async clear() {
    if (this.useMemory) {
      this.memory.clear();
      return;
    }

    const tables = [PROCESSED_TABLE, STATE_TABLE];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq("organization_id", "00000000-0000-0000-0000-000000000000");

      if (error && !isMissingTable(error, table)) {
        throw error;
      }
    }
  }
}

module.exports = {
  MissionControlRepository,
  InMemoryMissionControlStore
};
