const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateInvoiceNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = Date.now().toString().slice(-6);
  return `INV-${date}-${time}`;
}

function normalizeInvoiceItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return { error: 'لا توجد منتجات في الفاتورة' };
  }

  const normalizedItems = [];

  for (const rawItem of items) {
    const quantity = Number(rawItem.quantity);
    const unitPrice = Number(rawItem.unit_price);
    const productName = String(rawItem.product_name || '').trim();
    const productId = rawItem.product_id ? Number(rawItem.product_id) : null;
    const barcode = String(rawItem.barcode || '').trim() || null;

    if (!productName) {
      return { error: 'اسم المنتج مطلوب في كل بند' };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: 'كمية المنتج غير صالحة' };
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: 'سعر المنتج غير صالح' };
    }

    if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
      return { error: 'معرف المنتج غير صالح' };
    }

    normalizedItems.push({
      product_id: productId,
      product_name: productName,
      barcode,
      quantity,
      unit_price: unitPrice,
      subtotal: unitPrice * quantity
    });
  }

  return { data: normalizedItems };
}

// POST /api/invoices
router.post('/', requireAuth, async (req, res) => {
  const normalized = normalizeInvoiceItems(req.body?.items);
  if (normalized.error) {
    return res.status(400).json({ success: false, message: normalized.error });
  }

  const discount = Math.max(0, Number(req.body?.discount) || 0);
  const paymentMethod = String(req.body?.payment_method || 'cash').trim() || 'cash';
  const notes = String(req.body?.notes || '').trim();
  const total = normalized.data.reduce((sum, item) => sum + item.subtotal, 0);
  const netTotal = Math.max(0, total - discount);
  const paidAmountInput = req.body?.paid_amount;
  const paidAmount = paidAmountInput === undefined || paidAmountInput === null || paidAmountInput === ''
    ? netTotal
    : Number(paidAmountInput);

  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return res.status(400).json({ success: false, message: 'المبلغ المدفوع غير صالح' });
  }

  const changeAmount = Math.max(0, paidAmount - netTotal);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    for (const item of normalized.data) {
      if (!item.product_id) continue;

      const [[product]] = await conn.query(
        'SELECT id, stock, active FROM products WHERE id = ? FOR UPDATE',
        [item.product_id]
      );

      if (!product || !product.active) {
        throw new Error(`PRODUCT_NOT_FOUND:${item.product_name}`);
      }

      if (Number(product.stock) < item.quantity) {
        throw new Error(`INSUFFICIENT_STOCK:${item.product_name}`);
      }
    }

    const invoiceNumber = generateInvoiceNumber();
    const [invoiceResult] = await conn.query(
      `INSERT INTO invoices
         (invoice_number, total, discount, net_total, paid_amount, change_amount,
          payment_method, items_count, notes, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        total,
        discount,
        netTotal,
        paidAmount,
        changeAmount,
        paymentMethod,
        normalized.data.length,
        notes,
        req.session.user.id
      ]
    );

    for (const item of normalized.data) {
      await conn.query(
        `INSERT INTO invoice_items
           (invoice_id, product_id, product_name, barcode, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceResult.insertId,
          item.product_id,
          item.product_name,
          item.barcode,
          item.unit_price,
          item.quantity,
          item.subtotal
        ]
      );

      if (item.product_id) {
        await conn.query(
          'UPDATE products SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      invoice: {
        id: invoiceResult.insertId,
        invoice_number: invoiceNumber,
        net_total: netTotal,
        change_amount: changeAmount
      },
      message: 'تم حفظ الفاتورة بنجاح'
    });
  } catch (error) {
    await conn.rollback();
    console.error(error);

    if (error.message?.startsWith('PRODUCT_NOT_FOUND:')) {
      return res.status(400).json({
        success: false,
        message: `المنتج غير متاح للبيع: ${error.message.split(':')[1]}`
      });
    }

    if (error.message?.startsWith('INSUFFICIENT_STOCK:')) {
      return res.status(400).json({
        success: false,
        message: `الكمية غير متوفرة في المخزون: ${error.message.split(':')[1]}`
      });
    }

    res.status(500).json({ success: false, message: 'فشل في حفظ الفاتورة' });
  } finally {
    conn.release();
  }
});

// GET /api/invoices
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];

    if (req.query.from) {
      where += ' AND DATE(i.created_at) >= ?';
      params.push(req.query.from);
    }

    if (req.query.to) {
      where += ' AND DATE(i.created_at) <= ?';
      params.push(req.query.to);
    }

    if (req.query.search) {
      where += ' AND i.invoice_number LIKE ?';
      params.push(`%${req.query.search}%`);
    }

    const [rows] = await db.query(
      `SELECT i.*, u.full_name AS cashier_name
       FROM invoices i
       LEFT JOIN users u ON i.cashier_id = u.id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM invoices i ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page, limit });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب الفواتير' });
  }
});

// GET /api/invoices/stats/today
router.get('/stats/today', requireAuth, async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS invoices_count,
        COALESCE(SUM(net_total), 0) AS total_sales,
        COALESCE(SUM(items_count), 0) AS items_sold
      FROM invoices
      WHERE DATE(created_at) = CURDATE()
    `);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب إحصائيات اليوم' });
  }
});

// GET /api/invoices/:id
router.get('/:id', requireAuth, async (req, res) => {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({ success: false, message: 'معرف الفاتورة غير صالح' });
  }

  try {
    const [[invoice]] = await db.query(
      `SELECT i.*, u.full_name AS cashier_name
       FROM invoices i
       LEFT JOIN users u ON i.cashier_id = u.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'الفاتورة غير موجودة' });
    }

    const [items] = await db.query(
      'SELECT * FROM invoice_items WHERE invoice_id = ?',
      [invoiceId]
    );

    res.json({ success: true, data: { ...invoice, items } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'فشل في جلب الفاتورة' });
  }
});

module.exports = router;
