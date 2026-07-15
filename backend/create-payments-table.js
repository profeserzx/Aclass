const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dawamu.db');

// Create payments table
db.run(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_method TEXT NOT NULL,
    transaction_id TEXT UNIQUE,
    phone_number TEXT,
    status TEXT DEFAULT 'Completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ Error creating payments table:', err.message);
  } else {
    console.log('✅ Payments table created successfully');
    
    // Add sample payment records
    db.run(`
      INSERT OR IGNORE INTO payments (student_id, student_name, amount, payment_method, transaction_id, phone_number, status)
      VALUES 
        (1, 'John Doe', 15000, 'M-Pesa', 'MPESA-2026-001', '+254 712 345678', 'Completed'),
        (1, 'John Doe', 5000, 'M-Pesa', 'MPESA-2026-002', '+254 712 345678', 'Pending'),
        (1, 'John Doe', 25000, 'Bank Transfer', 'BANK-2026-001', NULL, 'Completed')
    `, (err) => {
      if (err) {
        console.error('Error adding sample payments:', err.message);
      } else {
        console.log('✅ Sample payment records added');
        
        // Show all payments
        db.all('SELECT * FROM payments', (err, rows) => {
          if (err) {
            console.error('Error fetching payments:', err.message);
          } else {
            console.log('\n📋 Current payment records:');
            console.table(rows);
          }
          db.close();
        });
      }
    });
  }
});
