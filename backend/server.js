const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 5000;
const JWT_SECRET = 'dawamu_school_secret_key_2026';

app.use(cors());
app.use(express.json());

// Database - using sqlite3 directly
const db = new sqlite3.Database('./dawamu.db');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  
  const tokenParts = token.split(' ');
  if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, message: 'Invalid token format' });
  }
  
  jwt.verify(tokenParts[1], JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  });
};

// ============ AUTH ROUTES ============
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  console.log('Login attempt:', email);
  
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role 
      } 
    });
  });
});

// ============ STUDENT ROUTES ============
app.get('/api/students', verifyToken, (req, res) => {
  console.log('Fetching students...');
  db.all("SELECT * FROM students ORDER BY name", (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
    console.log('Found', rows ? rows.length : 0, 'students');
    res.json(rows || []);
  });
});

app.post('/api/add-student', verifyToken, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const { name, admission_no, grade, parent_phone, parent_email } = req.body;
  
  if (!name || !admission_no || !grade) {
    return res.json({ success: false, message: 'Name, admission number and grade required' });
  }
  
  db.run(
    `INSERT INTO students (name, admission_no, grade, parent_phone, parent_email) VALUES (?, ?, ?, ?, ?)`,
    [name, admission_no, grade, parent_phone || null, parent_email || null], 
    function(err) {
      if (err) {
        console.error('Insert error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, id: this.lastID, message: 'Student added successfully' });
    }
  );
});

app.delete('/api/students/:id', verifyToken, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const studentId = req.params.id;
  
  db.run("DELETE FROM students WHERE id = ?", [studentId], function(err) {
    if (err) {
      console.error('Delete error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Student deleted successfully' });
  });
});

app.put('/api/students/:id', verifyToken, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const studentId = req.params.id;
  const { name, admission_no, grade, parent_phone, parent_email } = req.body;
  
  db.run(
    `UPDATE students SET name = ?, admission_no = ?, grade = ?, parent_phone = ?, parent_email = ? WHERE id = ?`,
    [name, admission_no, grade, parent_phone, parent_email, studentId],
    function(err) {
      if (err) {
        console.error('Update error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Student updated successfully' });
    }
  );
});

// ============ SUBJECT ROUTES ============
app.get('/api/subjects', verifyToken, (req, res) => {
  db.all("SELECT * FROM subjects ORDER BY name", (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

// ============ RESULTS ROUTES ============
app.get('/api/results', verifyToken, (req, res) => {
  db.all(`
    SELECT r.*, s.name as student_name 
    FROM results r
    JOIN students s ON r.student_id = s.id
    ORDER BY s.name, r.subject_name
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

app.get('/api/student-results/:studentId', verifyToken, (req, res) => {
  const studentId = req.params.studentId;
  db.all(
    "SELECT * FROM results WHERE student_id = ? ORDER BY subject_name",
    [studentId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json(rows || []);
    }
  );
});

app.post('/api/add-result', verifyToken, (req, res) => {
  const { student_id, subject_id, subject_name, marks, exam_type, term, year, grade } = req.body;
  
  if (!student_id || !subject_id || !subject_name || marks === undefined) {
    return res.json({ success: false, message: 'Missing required fields' });
  }
  
  const currentYear = year || new Date().getFullYear();
  const currentTerm = term || 'Term 1';
  
  db.run(
    `INSERT INTO results (student_id, subject_id, subject_name, marks, exam_type, term, year, grade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, subject_id, subject_name, marks, exam_type || 'End Term', currentTerm, currentYear, grade || ''],
    function(err) {
      if (err) {
        console.error('Insert error:', err);
        return res.json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Result added successfully', id: this.lastID });
    }
  );
});

app.delete('/api/delete-result/:id', verifyToken, (req, res) => {
  const resultId = req.params.id;
  db.run("DELETE FROM results WHERE id = ?", [resultId], function(err) {
    if (err) {
      return res.json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Result deleted successfully' });
  });
});

// ============ FEE ROUTES ============
app.get('/api/fees', verifyToken, (req, res) => {
  db.all("SELECT * FROM fees ORDER BY id DESC", (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/add-fee', verifyToken, (req, res) => {
  const { student_name, amount, due_date, status, term, year } = req.body;
  
  if (!student_name || !amount || !due_date) {
    return res.json({ success: false, message: 'Missing required fields' });
  }
  
  db.run(
    "INSERT INTO fees (student_name, amount, due_date, status, term, year) VALUES (?, ?, ?, ?, ?, ?)",
    [student_name, amount, due_date, status || 'Pending', term || 'Term 1', year || new Date().getFullYear()],
    function(err) {
      if (err) {
        return res.json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Fee added successfully' });
    }
  );
});

app.put('/api/update-fee-status/:id', verifyToken, (req, res) => {
  const feeId = req.params.id;
  const { status } = req.body;
  
  db.run(
    "UPDATE fees SET status = ? WHERE id = ?",
    [status, feeId],
    function(err) {
      if (err) {
        return res.json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Fee status updated successfully' });
    }
  );
});

app.delete('/api/delete-fee/:id', verifyToken, (req, res) => {
  const feeId = req.params.id;
  db.run("DELETE FROM fees WHERE id = ?", [feeId], function(err) {
    if (err) {
      return res.json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Fee record deleted successfully' });
  });
});

// ============ PARENT ROUTES ============
app.get('/api/parent-accounts', verifyToken, (req, res) => {
  db.all(`
    SELECT pa.*, 
           GROUP_CONCAT(s.name) as children_names
    FROM parent_accounts pa
    LEFT JOIN parent_student_links psl ON pa.id = psl.parent_id
    LEFT JOIN students s ON psl.student_id = s.id
    GROUP BY pa.id
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/create-parent', verifyToken, (req, res) => {
  const { email, password, full_name, phone, student_ids } = req.body;
  
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.json({ success: false, message: err.message });
    
    db.run(
      "INSERT INTO parent_accounts (email, password, full_name, phone) VALUES (?, ?, ?, ?)",
      [email, hashedPassword, full_name, phone],
      function(err) {
        if (err) return res.json({ success: false, message: err.message });
        
        const parentId = this.lastID;
        
        if (student_ids && student_ids.length > 0) {
          const stmt = db.prepare("INSERT INTO parent_student_links (parent_id, student_id) VALUES (?, ?)");
          student_ids.forEach(studentId => {
            stmt.run(parentId, studentId);
          });
          stmt.finalize();
        }
        
        res.json({ 
          success: true, 
          message: 'Parent account created successfully',
          parentId: parentId
        });
      }
    );
  });
});

app.delete('/api/parent-accounts/:id', verifyToken, (req, res) => {
  const parentId = req.params.id;
  
  db.run("DELETE FROM parent_student_links WHERE parent_id = ?", [parentId], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    
    db.run("DELETE FROM parent_accounts WHERE id = ?", [parentId], (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Parent account deleted successfully' });
    });
  });
});

// ============ STAFF MANAGEMENT ============
app.get('/api/staff', verifyToken, (req, res) => {
  db.all("SELECT id, name, email, role FROM users ORDER BY name", (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/create-staff', verifyToken, (req, res) => {
  const { name, email, password, role } = req.body;
  
  if (!name || !email || !password) {
    return res.json({ success: false, message: 'Name, email and password required' });
  }
  
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, existing) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    if (existing) {
      return res.json({ success: false, message: 'Email already exists' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userRole = role || 'teacher';
    
    db.run(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, userRole],
      function(err) {
        if (err) {
          return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ 
          success: true, 
          message: 'Staff created successfully',
          id: this.lastID
        });
      }
    );
  });
});

app.delete('/api/staff/:id', verifyToken, (req, res) => {
  const staffId = req.params.id;
  
  db.get("SELECT * FROM users WHERE id = ? AND email = 'admin@dawamu.com'", [staffId], (err, admin) => {
    if (admin) {
      return res.json({ success: false, message: 'Cannot delete main admin account' });
    }
    
    db.run("DELETE FROM users WHERE id = ?", [staffId], function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Staff deleted successfully' });
    });
  });
});

// ============ ATTENDANCE ROUTES ============
app.post('/api/attendance', verifyToken, (req, res) => {
  const { student_id, date, status } = req.body;
  
  db.run(
    "INSERT OR REPLACE INTO attendance (student_id, date, status, teacher_id) VALUES (?, ?, ?, ?)",
    [student_id, date, status, req.userId],
    function(err) {
      if (err) {
        return res.json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Attendance recorded successfully' });
    }
  );
});

app.get('/api/attendance/:studentId', verifyToken, (req, res) => {
  const { studentId } = req.params;
  db.all(
    "SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 30",
    [studentId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json(rows || []);
    }
  );
});

// ============ DASHBOARD STATS ============
app.get('/api/stats', verifyToken, (req, res) => {
  const stats = {};
  
  db.get("SELECT COUNT(*) as total FROM students", (err, row) => { 
    stats.students = row ? row.total : 0;
  });
  db.get("SELECT COUNT(*) as total FROM users WHERE role = 'teacher'", (err, row) => { 
    stats.teachers = row ? row.total : 0;
  });
  db.get("SELECT COUNT(*) as total FROM results", (err, row) => { 
    stats.results = row ? row.total : 0;
  });
  
  setTimeout(() => res.json(stats), 100);
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ Dawamu School API running on http://localhost:${PORT}`);
  console.log('========================================');
});
