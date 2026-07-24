/**
 * Sprint 14.3 — Timeline repository port (domain layer).
 */

/**
 * @typedef {import('../TimelineEntry')} TimelineEntry
 */

/**
 * @interface TimelineRepositoryPort
 * @method append(entry: TimelineEntry): Promise<TimelineEntry>
 * @method findById(id: string): Promise<TimelineEntry|null>
 * @method findByProspect(prospectId: string, filters?: Object): Promise<{ items: TimelineEntry[], total: number }>
 * @method findLatest(prospectId: string): Promise<TimelineEntry|null>
 * @method search(filters?: Object): Promise<{ items: TimelineEntry[], total: number }>
 * @method paginate(filters?: Object): Promise<{ items: TimelineEntry[], total: number, limit: number, offset: number }>
 */

module.exports = {};
