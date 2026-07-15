const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dawamu.db');

// Create students table
db.run(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    admission_number TEXT UNIQUE NOT NULL,
    grade TEXT NOT NULL,
    parent_phone TEXT,
    parent_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('❌ Error creating students table:', err.message);
  } else {
    console.log('✅ Students table created successfully');
    
    // Add a sample student for testing
    db.run(`
      INSERT OR IGNORE INTO students (name, admission_number, grade, parent_phone, parent_email)
      VALUES ('John Doe', 'DAW/2024/001', 'Grade 7', '+254 712 345678', 'parent@email.com')
    `, (err) => {
      if (err) {
        console.error('Error adding sample student:', err.message);
      } else {
        console.log('✅ Sample student added');
        
        // Show all students
        db.all('SELECT * FROM students', (err, rows) => {
          if (err) {
            console.error('Error fetching students:', err.message);
          } else {
            console.log('\n📋 Current students:');
            console.table(rows);
          }
          db.close();
        });
      }
    });
  }
});
