/**
 * Sprint 14.2 — Business Event repository port (domain layer).
 */

/**
 * @typedef {import('../BusinessEvent')} BusinessEvent
 */

/**
 * @interface BusinessEventRepositoryPort
 * @method append(event: BusinessEvent): Promise<BusinessEvent>
 * @method findById(id: string): Promise<BusinessEvent|null>
 * @method findByProspect(prospectId: string, filters?: Object): Promise<{ items: BusinessEvent[], total: number }>
 * @method findByType(eventType: string, filters?: Object): Promise<{ items: BusinessEvent[], total: number }>
 * @method findByCorrelationId(correlationId: string, filters?: Object): Promise<{ items: BusinessEvent[], total: number }>
 * @method findBetweenDates(from: string, to: string, filters?: Object): Promise<{ items: BusinessEvent[], total: number }>
 * @method search(filters?: Object): Promise<{ items: BusinessEvent[], total: number }>
 */

module.exports = {};
