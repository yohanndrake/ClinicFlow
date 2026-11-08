//auth.js - checks login, role, and password change status

//checks if logged in
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

//checks if the user has one of the required roles
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in" });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

//after the admin resets a user's password, the user must change it
function blockIfMustChangePassword(req, res, next) {
  const user = req.session.user;
  if (user && user.mustChangePassword) {
    return res
      .status(403)
      .json({ error: "Password change required", mustChangePassword: true });
  }
  next();
}

//shares the three guards with the route files.
module.exports = { requireLogin, requireRole, blockIfMustChangePassword };
