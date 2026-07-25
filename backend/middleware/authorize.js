/**
 * Sprint 16.9 — Authorization middleware wrapper.
 * Ensures auth context exists before permission/role checks.
 */

function authorize(...checks) {
  const middlewares = checks.flat().filter(Boolean);

  return async function authorizeMiddleware(req, res, next) {
    if (!req.authContext) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }

    let index = 0;

    const runNext = () => {
      if (index >= middlewares.length) {
        return next();
      }

      const middleware = middlewares[index];
      index += 1;
      return middleware(req, res, runNext);
    };

    return runNext();
  };
}

module.exports = {
  authorize
};
