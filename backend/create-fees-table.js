const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dawamu.db');

// Create fees table
db.run(`
  CREATE TABLE IF NOT EXISTS fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
    term TEXT NOT NULL,
    year INTEGER NOT NULL,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ Error creating fees table:', err.message);
  } else {
    console.log('✅ Fees table created successfully');
    
    // Add sample fee records
    db.run(`
      INSERT OR IGNORE INTO fees (student_id, student_name, amount, due_date, term, year, status)
      VALUES 
        (1, 'John Doe', 15000, '2026-08-15', 'Term 1', 2026, 'Pending'),
        (1, 'John Doe', 15000, '2026-09-15', 'Term 2', 2026, 'Paid'),
        (1, 'John Doe', 15000, '2026-10-15', 'Term 3', 2026, 'Pending')
    `, (err) => {
      if (err) {
        console.error('Error adding sample fees:', err.message);
      } else {
        console.log('✅ Sample fee records added');
        
        // Show all fees
        db.all('SELECT * FROM fees', (err, rows) => {
          if (err) {
            console.error('Error fetching fees:', err.message);
          } else {
            console.log('\n📋 Current fee records:');
            console.table(rows);
          }
          db.close();
        });
      }
    });
  }
});
