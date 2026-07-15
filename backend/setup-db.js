const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dawamu.db');

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('❌ Error creating users table:', err.message);
  } else {
    console.log('✅ Users table created successfully');
    
    // Insert admin user
    db.run(`
      INSERT OR IGNORE INTO users (email, password, role, name)
      VALUES ('admin@dawamu.com', 'admin123', 'admin', 'System Administrator')
    `, (err) => {
      if (err) {
        console.error('❌ Error inserting admin user:', err.message);
      } else {
        console.log('✅ Admin user created successfully');
        console.log('📧 Email: admin@dawamu.com');
        console.log('🔑 Password: admin123');
      }
      
      // Show all users
      db.all('SELECT id, email, role, name FROM users', (err, rows) => {
        if (err) {
          console.error('Error fetching users:', err.message);
        } else {
          console.log('\n📋 Current users:');
          console.table(rows);
        }
        db.close();
      });
    });
  }
});
