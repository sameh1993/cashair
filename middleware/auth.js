// حماية الـ API routes
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ success: false, message: 'غير مصرح - يرجى تسجيل الدخول' });
}

// حماية admin فقط
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'غير مصرح - صلاحيات المدير مطلوبة' });
}

module.exports = { requireAuth, requireAdmin };
