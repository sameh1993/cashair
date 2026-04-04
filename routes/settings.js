const express = require('express');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT `key`, `value` FROM settings');
    const settings = {};
    rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب الإعدادات' });
  }
});

// PUT /api/settings
router.put('/', requireAdmin, async (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) {
    return res.status(400).json({ success: false, message: 'لا توجد إعدادات للحفظ' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of entries) {
      await conn.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, String(value ?? '')]
      );
    }
    await conn.commit();
    res.json({ success: true, message: 'تم حفظ الإعدادات' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في حفظ الإعدادات' });
  } finally {
    conn.release();
  }
});

// GET /api/settings/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, full_name, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب المستخدمين' });
  }
});

// POST /api/settings/users
router.post('/users', requireAdmin, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const fullName = String(req.body?.full_name || '').trim();
  const requestedRole = String(req.body?.role || 'cashier').trim().toLowerCase();
  const role = requestedRole === 'admin' ? 'admin' : 'cashier';

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  if (password.length < 4) {
    return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, fullName, role]
    );
    res.json({ success: true, message: 'تمت إضافة المستخدم' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'اسم المستخدم موجود بالفعل' });
    }

    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في إضافة المستخدم' });
  }
});

// DELETE /api/settings/users/:id
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: 'معرف المستخدم غير صالح' });
  }

  if (userId === req.session.user.id) {
    return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الحالي' });
  }

  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    res.json({ success: true, message: 'تم حذف المستخدم' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في حذف المستخدم' });
  }
});

module.exports = router;
