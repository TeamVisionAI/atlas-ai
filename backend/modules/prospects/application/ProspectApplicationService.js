/**
 * Sprint 14.1 — Application service (use-case orchestration).
 * Coordinates domain aggregate, repository port, and external interfaces.
 */

const { Prospect } = require("../domain/Prospect");
const { ProspectDomainError } = require("../domain/errors/ProspectDomainError");
const { DEFAULT_ORGANIZATION_ID } = require("../domain/constants");
const { ProspectRepository } = require("../infrastructure/persistence/SupabaseProspectRepository");
const { validateCreateProspectInput } = require("./validators/createProspect");
const { validateUpdateProspectInput } = require("./validators/updateProspect");
const { LEAD_EVENTS } = require("../../business-events/domain/EventTypes");

function actorFromRequest(user) {
  if (!user) {
    return "SYSTEM";
  }

  if (user.id) {
    return `AGENT:${user.id}`;
  }

  return "SYSTEM";
}

function toApplicationError(error) {
  if (error instanceof ProspectDomainError || error.statusCode) {
    return error;
  }

  const wrapped = new Error(error.message || "Unexpected prospect error.");
  wrapped.statusCode = 500;
  wrapped.publicCode = "PROSPECT_ERROR";
  return wrapped;
}

class ProspectApplicationService {
  /**
   * @param {Object} [deps]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new ProspectRepository();

    if (!deps.businessEventEngine) {
      const { BusinessEventEnginePlaceholder } = require("../interfaces/businessEventEngine");
      this.businessEventEngine = new BusinessEventEnginePlaceholder();
    } else {
      this.businessEventEngine = deps.businessEventEngine;
    }
  }

  _present(prospect) {
    return prospect.toJSON();
  }

  async emitBusinessEvent(eventType, prospect, actor, payload = {}) {
    const json = prospect.toJSON();

    return this.businessEventEngine.emit({
      eventType,
      prospectId: json.prospectId,
      actor,
      channel: "api",
      payload,
      version: "1.0",
      organizationId: json.organizationId || DEFAULT_ORGANIZATION_ID,
      lifecycleStateAtEvent: json.status?.lifecycleState,
      summary: payload.summary || eventType
    });
  }

  async createProspect(input, actor = "SYSTEM") {
    try {
      const validated = validateCreateProspectInput(input);

      if (validated.email) {
        const existing = await this.repository.findByEmail(validated.email);

        if (existing) {
          throw new ProspectDomainError("A prospect with this email already exists.", {
            statusCode: 409,
            publicCode: "DUPLICATE_EMAIL"
          });
        }
      }

      if (validated.primaryPhone) {
        const existing = await this.repository.findByPhone(validated.primaryPhone);

        if (existing) {
          throw new ProspectDomainError("A prospect with this phone already exists.", {
            statusCode: 409,
            publicCode: "DUPLICATE_PHONE"
          });
        }
      }

      const aggregate = Prospect.create(validated);
      const saved = await this.repository.create(aggregate);

      await this.emitBusinessEvent(LEAD_EVENTS.PROSPECT_CREATED, saved, actor, {
        leadSource: saved.toJSON().leadSource,
        createdBy: actor
      });

      return this._present(saved);
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async getProspect(prospectId) {
    const prospect = await this.repository.findById(prospectId);

    if (!prospect) {
      throw new ProspectDomainError("Prospect not found.", {
        statusCode: 404,
        publicCode: "PROSPECT_NOT_FOUND"
      });
    }

    return this._present(prospect);
  }

  async listProspects(query = {}) {
    const result = await this.repository.search({
      q: query.q,
      lifecycleState: query.lifecycleState,
      limit: query.limit,
      offset: query.offset,
      organizationId: query.organizationId
    });

    return {
      items: result.items.map((prospect) => this._present(prospect)),
      total: result.total
    };
  }

  async updateProspect(prospectId, input, actor = "SYSTEM") {
    try {
      const existing = await this.repository.findById(prospectId);

      if (!existing) {
        throw new ProspectDomainError("Prospect not found.", {
          statusCode: 404,
          publicCode: "PROSPECT_NOT_FOUND"
        });
      }

      const patch = validateUpdateProspectInput(input);
      const existingJson = existing.toJSON();

      if (patch.email && patch.email !== existingJson.contact?.email) {
        const duplicate = await this.repository.findByEmail(patch.email);

        if (duplicate && duplicate.prospectId !== prospectId) {
          throw new ProspectDomainError("A prospect with this email already exists.", {
            statusCode: 409,
            publicCode: "DUPLICATE_EMAIL"
          });
        }
      }

      if (patch.primaryPhone && patch.primaryPhone !== existingJson.contact?.primaryPhone) {
        const duplicate = await this.repository.findByPhone(patch.primaryPhone);

        if (duplicate && duplicate.prospectId !== prospectId) {
          throw new ProspectDomainError("A prospect with this phone already exists.", {
            statusCode: 409,
            publicCode: "DUPLICATE_PHONE"
          });
        }
      }

      const changedFields = existing.applyUpdate(patch);
      const saved = await this.repository.save(existing);

      if (!saved) {
        throw new ProspectDomainError("Prospect not found.", {
          statusCode: 404,
          publicCode: "PROSPECT_NOT_FOUND"
        });
      }

      await this.emitBusinessEvent(LEAD_EVENTS.PROSPECT_UPDATED, saved, actor, { changedFields });

      return this._present(saved);
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async archiveProspect(prospectId, actor = "SYSTEM") {
    try {
      const existing = await this.repository.findById(prospectId);

      if (!existing) {
        throw new ProspectDomainError("Prospect not found.", {
          statusCode: 404,
          publicCode: "PROSPECT_NOT_FOUND"
        });
      }

      if (!existing.archive()) {
        return this._present(existing);
      }

      const saved = await this.repository.save(existing);
      await this.emitBusinessEvent(LEAD_EVENTS.PROSPECT_ARCHIVED, saved, actor, {
        archivedBy: actor
      });

      return this._present(saved);
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async restoreProspect(prospectId, actor = "SYSTEM") {
    try {
      const existing = await this.repository.findById(prospectId);

      if (!existing) {
        throw new ProspectDomainError("Prospect not found.", {
          statusCode: 404,
          publicCode: "PROSPECT_NOT_FOUND"
        });
      }

      existing.restore();
      const saved = await this.repository.save(existing);

      await this.emitBusinessEvent(LEAD_EVENTS.PROSPECT_RESTORED, saved, actor, {
        restoredBy: actor
      });

      return this._present(saved);
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async assignProspect(prospectId, assignment, actor = "SYSTEM") {
    try {
      const existing = await this.repository.findById(prospectId);

      if (!existing) {
        throw new ProspectDomainError("Prospect not found.", {
          statusCode: 404,
          publicCode: "PROSPECT_NOT_FOUND"
        });
      }

      existing.assign(assignment, actor);
      const saved = await this.repository.save(existing);

      await this.emitBusinessEvent(LEAD_EVENTS.PROSPECT_ASSIGNED, saved, actor, {
        assignedAgentId: assignment.assignedAgentId,
        assignmentReason: assignment.assignmentReason || null
      });

      return this._present(saved);
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async mergeProspects({ survivorId, mergedId }, actor = "SYSTEM") {
    try {
      if (!survivorId || !mergedId) {
        throw new ProspectDomainError("survivorId and mergedId are required.", {
          publicCode: "VALIDATION_ERROR"
        });
      }

      if (survivorId === mergedId) {
        throw new ProspectDomainError("survivorId and mergedId must differ.", {
          publicCode: "VALIDATION_ERROR"
        });
      }

      const survivor = await this.repository.findById(survivorId);
      const merged = await this.repository.findById(mergedId);

      if (!survivor || !merged) {
        throw new ProspectDomainError("Prospect not found.", {
          statusCode: 404,
          publicCode: "PROSPECT_NOT_FOUND"
        });
      }

      merged.markMergedInto(survivorId);
      const mergedRecord = await this.repository.save(merged);

      await this.emitBusinessEvent(LEAD_EVENTS.PROSPECT_MERGED, survivor, actor, {
        survivorId,
        mergedId
      });

      return {
        survivor: this._present(survivor),
        merged: this._present(mergedRecord)
      };
    } catch (error) {
      throw toApplicationError(error);
    }
  }
}

/** @alias ProspectApplicationService — backward-compatible export name */
const ProspectService = ProspectApplicationService;

module.exports = {
  ProspectApplicationService,
  ProspectService,
  actorFromRequest
};
