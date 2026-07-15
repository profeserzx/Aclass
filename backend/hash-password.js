const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dawamu.db');

const email = 'admin@dawamu.com';
const plainPassword = 'admin123';

// Hash the password
const saltRounds = 10;
const hashedPassword = bcrypt.hashSync(plainPassword, saltRounds);

console.log('📧 Email:', email);
console.log('🔑 Plain password:', plainPassword);
console.log('🔒 Hashed password:', hashedPassword);

// Update the database
db.run(
  "UPDATE users SET password = ? WHERE email = ?",
  [hashedPassword, email],
  function(err) {
    if (err) {
      console.error('❌ Error updating password:', err.message);
    } else {
      console.log('✅ Password updated successfully!');
      console.log('You can now login with:');
      console.log('📧 Email:', email);
      console.log('🔑 Password:', plainPassword);
    }
    db.close();
  }
);
