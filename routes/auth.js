const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../config/db');
const router  = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length)
      return res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      user_code: user.id
    };
    res.json({ success: true, user: req.session.user });
  } catch (e) {
    console.error(e);
    res.json({ success: false, message: 'خطأ في الخادم' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session && req.session.user)
    return res.json({ success: true, user: req.session.user });
  res.json({ success: false });
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ success: false });
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password)
    return res.json({ success: false, message: 'يرجى ملء جميع الحقول' });
  if (new_password.length < 4)
    return res.json({ success: false, message: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    const valid = await bcrypt.compare(old_password, rows[0].password);
    if (!valid) return res.json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.session.user.id]);
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (e) {
    res.json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
