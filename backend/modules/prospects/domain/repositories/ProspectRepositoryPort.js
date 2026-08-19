/**
 * Sprint 14.1 — Repository port (domain layer).
 * Infrastructure implements this contract; domain never queries persistence directly.
 */

/**
 * @typedef {import('../Prospect')} Prospect
 */

/**
 * @interface ProspectRepositoryPort
 * @method create(prospect: Prospect, organizationId: string): Promise<Prospect>
 * @method save(prospect: Prospect, organizationId: string): Promise<Prospect>
 * @method findById(id: string, organizationId: string, options?: { includeDeleted?: boolean }): Promise<Prospect|null>
 * @method findByEmail(email: string): Promise<Prospect|null>
 * @method findByPhone(phone: string): Promise<Prospect|null>
 * @method search(filters: Object & { organizationId: string }): Promise<{ items: Prospect[], total: number }>
 * @method archive(id: string, organizationId: string): Promise<Prospect|null>
 * @method restore(id: string, organizationId: string): Promise<Prospect|null>
 * @method assign(id: string, organizationId: string, assignment: Object): Promise<Prospect|null>
 * @method merge(survivorId: string, mergedId: string, organizationId: string): Promise<Prospect|null>
 */

module.exports = {};
