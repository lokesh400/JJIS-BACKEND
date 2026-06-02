// Session-based auth middleware (Passport.js)

/**
 * auth — requires an active authenticated session.
 * Returns 401 if the user is not logged in.
 */
const auth = (req, res, next) => {
  if (req.isAuthenticated()) {
    if (req.user.isActive === false) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
    }
    return next();
  }
  res.status(401).json({ message: 'Not authenticated. Please log in.' });
};

/**
 * adminOnly — requires auth AND admin role.
 * Always checks isAuthenticated() first so req.user is guaranteed to exist.
 */
const adminOnly = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Not authenticated. Please log in.' });
  }
  if (req.user.isActive === false) {
    return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

/**
 * adminOrCoordinator — requires auth AND (admin or coordinator) role.
 */
const adminOrCoordinator = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Not authenticated. Please log in.' });
  }
  if (req.user.isActive === false) {
    return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
    return res.status(403).json({ message: 'Access denied. Admin or Coordinator only.' });
  }
  next();
};

module.exports = { auth, adminOnly, adminOrCoordinator };
