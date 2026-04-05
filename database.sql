CREATE DATABASE IF NOT EXISTS railway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE railway;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  role ENUM('admin','cashier') DEFAULT 'cashier',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  barcode VARCHAR(100) UNIQUE,
  category VARCHAR(100) NOT NULL DEFAULT 'عام',
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT DEFAULT 0,
  unit VARCHAR(30) DEFAULT 'قطعة',
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  net_total DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  change_amount DECIMAL(10,2) DEFAULT 0,
  payment_method ENUM('cash','card','other') DEFAULT 'cash',
  items_count INT DEFAULT 0,
  notes TEXT,
  cashier_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(255) NOT NULL,
  barcode VARCHAR(100),
  unit_price DECIMAL(10,2) NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT
);

INSERT IGNORE INTO users (username, password, full_name, role)
VALUES ('admin', '$2a$10$r0JvxJyHINM6AYewuxPUReYZF8x8/3XfMNWLER/XHFsMNM0/P6M0S', 'المدير', 'admin');

INSERT IGNORE INTO settings VALUES ('shop_name', 'محلي');
INSERT IGNORE INTO settings VALUES ('currency', 'ج.م');
INSERT IGNORE INTO settings VALUES ('currency_position', 'after');
INSERT IGNORE INTO settings VALUES ('receipt_footer', 'شكراً لزيارتكم');
INSERT IGNORE INTO settings VALUES ('tax_enabled', '0');
INSERT IGNORE INTO settings VALUES ('tax_rate', '14');
INSERT IGNORE INTO settings VALUES ('show_stock', '1');
INSERT IGNORE INTO settings VALUES ('low_stock_alert', '5');

INSERT IGNORE INTO products (name, barcode, category, price, stock, unit) VALUES
('مياه معدنية 600ml', '6001234567890', 'مشروبات', 5.00, 100, 'زجاجة'),
('عصير برتقال 250ml', '6001234567891', 'مشروبات', 8.50, 50, 'علبة'),
('شيبسي كبير', '6001234567892', 'سناكس', 15.00, 30, 'قطعة'),
('لبن كامل الدسم', '6001234567893', 'ألبان', 22.00, 20, 'كرتون'),
('خبز توست', '6001234567894', 'مخبوزات', 18.00, 15, 'قطعة'),
('جبنة رومي 250g', '6001234567895', 'ألبان', 45.00, 10, 'قطعة'),
('سكر 1kg', '6001234567896', 'بقالة', 35.00, 25, 'كيلو'),
('شاي أحمر 100 ظرف', '6001234567897', 'بقالة', 28.00, 18, 'علبة'),
('نسكافيه صغير', '6001234567898', 'مشروبات', 55.00, 12, 'علبة'),
('بيبسي علبة', '6001234567899', 'مشروبات', 12.00, 60, 'علبة');
