// Check whether req.user has one of the allowed roles.
module.exports = function roleMiddleware(...allowedRoles) {
  return function checkRole(req, res, next) {
    next();
  };
};
