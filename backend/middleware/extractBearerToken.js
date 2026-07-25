/**
 * Extract Bearer token from Authorization header.
 */

function extractBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

module.exports = {
  extractBearerToken
};
