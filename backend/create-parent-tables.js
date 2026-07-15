const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dawamu.db');

// Create parent_accounts table
db.run(`
    CREATE TABLE IF NOT EXISTS parent_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error('Error creating parent_accounts:', err.message);
    } else {
        console.log('✅ parent_accounts table created');
        
        db.run(`
            CREATE TABLE IF NOT EXISTS parent_student_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                FOREIGN KEY (parent_id) REFERENCES parent_accounts(id),
                FOREIGN KEY (student_id) REFERENCES students(id),
                UNIQUE(parent_id, student_id)
            )
        `, (err) => {
            if (err) {
                console.error('Error creating parent_student_links:', err.message);
            } else {
                console.log('✅ parent_student_links table created');
                db.close();
            }
        });
    }
});
