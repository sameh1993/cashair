require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== Middleware ====================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cashier_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ==================== Routes ====================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/settings', require('./routes/settings'));

// ==================== Page Routes ====================
function requireSession(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/');
}

function requireAdminSession(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  return res.redirect('/pos');
}

app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/pos');
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/pos', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'public', 'pos.html')));
app.get('/products', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/low-stock', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'public', 'low-stock.html')));
app.get('/invoices', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoices.html')));
app.get('/settings', requireAdminSession, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

// ==================== 404 ====================
app.use((req, res) => res.status(404).send('Page not found'));

// ==================== Error Handler ====================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Server error' });
});

// ==================== Start ====================
app.listen(PORT, () => {
  console.log(`Cashier POS running on http://localhost:${PORT}`);
});
