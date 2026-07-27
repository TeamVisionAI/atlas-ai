/**
 * Shared Supabase/PostgREST table probe error detection.
 */

function isMissingTableError(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message || "").toLowerCase();

  return (
    error.code === "PGRST116" ||
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

module.exports = {
  isMissingTableError
};
