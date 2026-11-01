// Session shape: req.session.user = { id, role: 'patient' | 'staff' | 'admin', name }

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Blocks everything except password change/logout while a reset is pending.
function blockIfMustChangePassword(req, res, next) {
  const user = req.session.user;
  if (user && user.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required', mustChangePassword: true });
  }
  next();
}

module.exports = { requireLogin, requireRole, blockIfMustChangePassword };
