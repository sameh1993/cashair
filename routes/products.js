const express = require('express');
const db = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function normalizeProductPayload(body = {}) {
  const name = String(body.name || '').trim();
  const barcode = String(body.barcode || '').trim();
  const category = String(body.category || '').trim() || 'عام';
  const unit = String(body.unit || '').trim() || 'قطعة';
  const price = Number(body.price);
  const stock = Number(body.stock ?? 0);
  const active = body.active === undefined ? 1 : Number(body.active) ? 1 : 0;

  if (!name) {
    return { error: 'اسم المنتج مطلوب' };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { error: 'السعر غير صالح' };
  }

  if (!Number.isFinite(stock) || stock < 0) {
    return { error: 'المخزون غير صالح' };
  }

  return {
    data: {
      name,
      barcode: barcode || null,
      category,
      price,
      stock: Math.floor(stock),
      unit,
      active
    }
  };
}

function productsSelectSql() {
  return `
    SELECT
      p.id,
      p.name,
      p.barcode,
      p.category,
      p.price,
      p.stock,
      p.unit,
      p.active,
      COALESCE(s.total_sold, 0) AS total_sold
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS total_sold
      FROM invoice_items
      WHERE product_id IS NOT NULL
      GROUP BY product_id
    ) s ON s.product_id = p.id
  `;
}

// GET /api/products/categories
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC"
    );
    res.json({ success: true, data: rows.map((row) => row.category) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب التصنيفات' });
  }
});

// GET /api/products/low-stock
router.get('/low-stock', requireAuth, async (req, res) => {
  try {
    const [[settingsRow]] = await db.query(
      "SELECT `value` FROM settings WHERE `key` = 'low_stock_alert' LIMIT 1"
    );
    const alertLimit = Math.max(0, parseInt(settingsRow?.value, 10) || 5);

    const [rows] = await db.query(
      `${productsSelectSql()}
       WHERE p.active = 1 AND p.stock <= ?
       ORDER BY p.stock ASC, total_sold DESC, p.name ASC`,
      [alertLimit]
    );

    const data = rows.map((row) => ({
      ...row,
      stock_status: row.stock <= 0 ? 'out' : row.stock <= alertLimit ? 'low' : 'ok'
    }));

    res.json({
      success: true,
      data,
      meta: { low_stock_alert: alertLimit }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب المنتجات منخفضة المخزون' });
  }
});

// GET /api/products
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `${productsSelectSql()}
       WHERE p.active = 1
       ORDER BY total_sold DESC, p.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب المنتجات' });
  }
});

// GET /api/products/all
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `${productsSelectSql()}
       ORDER BY p.category ASC, total_sold DESC, p.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب المنتجات' });
  }
});

// GET /api/products/barcode/:code
router.get('/barcode/:code', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `${productsSelectSql()}
       WHERE p.barcode = ? AND p.active = 1
       LIMIT 1`,
      [req.params.code]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في البحث عن المنتج' });
  }
});

// POST /api/products
router.post('/', requireAdmin, async (req, res) => {
  const payload = normalizeProductPayload(req.body);
  if (payload.error) {
    return res.status(400).json({ success: false, message: payload.error });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO products (name, barcode, category, price, stock, unit, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        payload.data.name,
        payload.data.barcode,
        payload.data.category,
        payload.data.price,
        payload.data.stock,
        payload.data.unit,
        payload.data.active
      ]
    );
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: rows[0], message: 'تمت إضافة المنتج بنجاح' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'الباركود مسجل مسبقًا' });
    }

    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في إضافة المنتج' });
  }
});

// PUT /api/products/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ success: false, message: 'معرف المنتج غير صالح' });
  }

  const payload = normalizeProductPayload(req.body);
  if (payload.error) {
    return res.status(400).json({ success: false, message: payload.error });
  }

  try {
    const [result] = await db.query(
      'UPDATE products SET name = ?, barcode = ?, category = ?, price = ?, stock = ?, unit = ?, active = ? WHERE id = ?',
      [
        payload.data.name,
        payload.data.barcode,
        payload.data.category,
        payload.data.price,
        payload.data.stock,
        payload.data.unit,
        payload.data.active,
        productId
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    res.json({ success: true, message: 'تم تحديث المنتج' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'الباركود مسجل مسبقًا' });
    }

    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في تحديث المنتج' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ success: false, message: 'معرف المنتج غير صالح' });
  }

  try {
    const [result] = await db.query('UPDATE products SET active = 0 WHERE id = ?', [productId]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في حذف المنتج' });
  }
});

module.exports = router;
