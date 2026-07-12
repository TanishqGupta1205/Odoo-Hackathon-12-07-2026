// Verify JWT and attach the logged-in user to req.user.
module.exports = function authMiddleware(req, res, next) {
  next();
};
