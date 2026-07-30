/**
 * Normalizes appointment repository/API payloads to a plain array.
 */

function coerceAppointmentItems(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray(result.items)) {
    return result.items;
  }

  if (result && Array.isArray(result.list)) {
    return result.list;
  }

  if (result && Array.isArray(result.upcoming)) {
    return result.upcoming;
  }

  return [];
}

module.exports = {
  coerceAppointmentItems
};
