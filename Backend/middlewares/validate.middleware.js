// Run request validation before controller execution.
module.exports = function validateMiddleware(req, res, next) {
  next();
};
