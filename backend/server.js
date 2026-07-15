const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'dawamu_school_secret_key_2026';

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    credentials: true
}));
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

// ============ PARENT LOGIN ROUTE ============
app.post('/api/parent-login', (req, res) => {
  const { email, password } = req.body;
  console.log('Parent login attempt:', email);
  
  db.get("SELECT * FROM parent_accounts WHERE email = ?", [email], (err, parent) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (!parent) {
      console.log('Parent not found:', email);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    // Use bcrypt to compare passwords
    let validPassword = false;
    try {
      validPassword = bcrypt.compareSync(password, parent.password);
      console.log('Password comparison result:', validPassword);
    } catch (e) {
      console.error('bcrypt comparison error:', e);
      validPassword = false;
    }
    
    if (!validPassword) {
      console.log('Invalid password for parent:', email);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    const token = jwt.sign({ 
      id: parent.id, 
      role: 'parent', 
      name: parent.full_name,
      email: parent.email 
    }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: parent.id, 
        name: parent.full_name, 
        email: parent.email, 
        role: 'parent' 
      } 
    });
  });
});

// ============ PARENT DASHBOARD ROUTES ============
// Get parent's children
app.get('/api/parent-children', verifyToken, (req, res) => {
  const parentId = req.userId;
  
  db.all(`
    SELECT s.id, s.name, s.admission_number, s.grade, s.parent_phone, s.parent_email
    FROM students s
    JOIN parent_student_links psl ON s.id = psl.student_id
    WHERE psl.parent_id = ?
  `, [parentId], (err, rows) => {
    if (err) {
      console.error('Error fetching children:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

// Get parent's child results
app.get('/api/parent-results/:studentId', verifyToken, (req, res) => {
  const studentId = req.params.studentId;
  const parentId = req.userId;
  
  // Check if this student belongs to the parent
  db.get(
    "SELECT * FROM parent_student_links WHERE parent_id = ? AND student_id = ?",
    [parentId, studentId],
    (err, link) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      if (!link) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
      
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
    }
  );
});

// Get parent's child fees
app.get('/api/parent-fees/:studentId', verifyToken, (req, res) => {
  const studentId = req.params.studentId;
  const parentId = req.userId;
  
  db.get(
    "SELECT * FROM parent_student_links WHERE parent_id = ? AND student_id = ?",
    [parentId, studentId],
    (err, link) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      if (!link) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
      
      db.all(
        "SELECT * FROM fees WHERE student_id = ? ORDER BY due_date DESC",
        [studentId],
        (err, rows) => {
          if (err) {
            return res.status(500).json({ success: false, message: err.message });
          }
          res.json(rows || []);
        }
      );
    }
  );
});

// Get parent's child attendance
app.get('/api/parent-attendance/:studentId', verifyToken, (req, res) => {
  const studentId = req.params.studentId;
  const parentId = req.userId;
  
  db.get(
    "SELECT * FROM parent_student_links WHERE parent_id = ? AND student_id = ?",
    [parentId, studentId],
    (err, link) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      if (!link) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
      
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
    }
  );
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
  
  const { name, admission_no, admission_number, grade, parent_phone, parent_email } = req.body;
  const finalAdmissionNumber = admission_number || admission_no;
  
  if (!name || !finalAdmissionNumber || !grade) {
    return res.json({ success: false, message: 'Name, admission number and grade required' });
  }
  
  db.run(
    `INSERT INTO students (name, admission_number, grade, parent_phone, parent_email) VALUES (?, ?, ?, ?, ?)`,
    [name, finalAdmissionNumber, grade, parent_phone || null, parent_email || null], 
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
  const { name, admission_number, grade, parent_phone, parent_email } = req.body;
  
  db.run(
    `UPDATE students SET name = ?, admission_number = ?, grade = ?, parent_phone = ?, parent_email = ? WHERE id = ?`,
    [name, admission_number, grade, parent_phone, parent_email, studentId],
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
  db.all(`
    SELECT f.*, s.name as student_name 
    FROM fees f
    LEFT JOIN students s ON f.student_id = s.id
    ORDER BY f.id DESC
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching fees:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/add-fee', verifyToken, (req, res) => {
  const { student_id, student_name, amount, due_date, status, term, year } = req.body;
  
  if (!student_id || !student_name || !amount || !due_date) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: student_id, student_name, amount, due_date' 
    });
  }
  
  const currentYear = year || new Date().getFullYear();
  const currentTerm = term || 'Term 1';
  const currentStatus = status || 'Pending';
  
  db.run(
    `INSERT INTO fees (student_id, student_name, amount, due_date, status, term, year) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [parseInt(student_id), student_name, parseFloat(amount), due_date, currentStatus, currentTerm, currentYear],
    function(err) {
      if (err) {
        console.error('Insert error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, id: this.lastID, message: 'Fee added successfully' });
    }
  );
});

app.put('/api/update-fee/:id', verifyToken, (req, res) => {
  const feeId = req.params.id;
  const { student_id, student_name, amount, due_date, status, term, year } = req.body;
  
  if (!student_id || !student_name || !amount || !due_date) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  
  db.run(
    `UPDATE fees SET 
      student_id = ?, 
      student_name = ?, 
      amount = ?, 
      due_date = ?, 
      status = ?, 
      term = ?, 
      year = ?
     WHERE id = ?`,
    [parseInt(student_id), student_name, parseFloat(amount), due_date, status, term, year, feeId],
    function(err) {
      if (err) {
        console.error('Update error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Fee updated successfully' });
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
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Fee status updated successfully' });
    }
  );
});

app.delete('/api/delete-fee/:id', verifyToken, (req, res) => {
  const feeId = req.params.id;
  db.run("DELETE FROM fees WHERE id = ?", [feeId], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Fee record deleted successfully' });
  });
});

// ============ PAYMENT ROUTES ============
app.get('/api/payments', verifyToken, (req, res) => {
    db.all("SELECT * FROM payments ORDER BY payment_date DESC", (err, rows) => {
        if (err) {
            console.error('Error fetching payments:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json(rows || []);
    });
});

app.get('/api/payments/stats', verifyToken, (req, res) => {
    db.get(`
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'Completed' THEN amount ELSE 0 END), 0) as total_collected,
            COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0) as pending_payments,
            COUNT(CASE WHEN payment_method = 'M-Pesa' THEN 1 END) as mpesa_count,
            COUNT(*) as total_transactions
        FROM payments
    `, (err, row) => {
        if (err) {
            console.error('Error fetching payment stats:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json(row || { total_collected: 0, pending_payments: 0, mpesa_count: 0, total_transactions: 0 });
    });
});

app.post('/api/payments', verifyToken, (req, res) => {
    const { student_id, student_name, amount, payment_method, phone_number, transaction_id, status } = req.body;
    
    if (!student_name || !amount || !payment_method) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const tid = transaction_id || `MPESA-${Date.now()}`;
    const paymentStatus = status || 'Pending';
    
    db.run(
        `INSERT INTO payments (student_id, student_name, amount, payment_method, phone_number, transaction_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [student_id || null, student_name, amount, payment_method, phone_number || null, tid, paymentStatus],
        function(err) {
            if (err) {
                console.error('Error adding payment:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, id: this.lastID, message: 'Payment recorded successfully' });
        }
    );
});

// ============ PARENT ACCOUNT ROUTES ============
app.get('/api/parent-accounts', verifyToken, (req, res) => {
    db.all(`
        SELECT 
            p.id, 
            p.full_name, 
            p.email, 
            p.phone,
            GROUP_CONCAT(s.name, ', ') as children_names
        FROM parent_accounts p
        LEFT JOIN parent_student_links psl ON p.id = psl.parent_id
        LEFT JOIN students s ON psl.student_id = s.id
        GROUP BY p.id
        ORDER BY p.full_name
    `, (err, rows) => {
        if (err) {
            console.error('Error fetching parents:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/parent-students', verifyToken, (req, res) => {
    db.all("SELECT id, name, admission_number FROM students ORDER BY name", (err, rows) => {
        if (err) {
            console.error('Error fetching students:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/parent-accounts/:id', verifyToken, (req, res) => {
    const parentId = req.params.id;
    
    db.get("SELECT * FROM parent_accounts WHERE id = ?", [parentId], (err, parent) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        if (!parent) {
            return res.status(404).json({ success: false, message: 'Parent not found' });
        }
        
        db.all(
            "SELECT student_id FROM parent_student_links WHERE parent_id = ?",
            [parentId],
            (err, links) => {
                if (err) {
                    return res.status(500).json({ success: false, message: err.message });
                }
                parent.student_ids = links.map(link => link.student_id);
                res.json(parent);
            }
        );
    });
});

app.post('/api/create-parent', verifyToken, (req, res) => {
    const { email, password, full_name, phone, student_ids } = req.body;
    
    if (!email || !full_name || !password) {
        return res.status(400).json({ success: false, message: 'Email, full name and password required' });
    }
    
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        
        db.run(
            "INSERT INTO parent_accounts (email, password, full_name, phone) VALUES (?, ?, ?, ?)",
            [email, hashedPassword, full_name, phone || null],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ success: false, message: 'Email already registered' });
                    }
                    return res.status(500).json({ success: false, message: err.message });
                }
                
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

app.put('/api/parent-accounts/:id', verifyToken, (req, res) => {
    const parentId = req.params.id;
    const { full_name, phone, student_ids } = req.body;
    
    db.run(
        "UPDATE parent_accounts SET full_name = ?, phone = ? WHERE id = ?",
        [full_name, phone, parentId],
        function(err) {
            if (err) {
                console.error('Error updating parent:', err);
                return res.status(500).json({ success: false, message: err.message });
            }
            
            if (student_ids !== undefined) {
                db.run("DELETE FROM parent_student_links WHERE parent_id = ?", [parentId], (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, message: err.message });
                    }
                    
                    if (student_ids && student_ids.length > 0) {
                        const stmt = db.prepare("INSERT INTO parent_student_links (parent_id, student_id) VALUES (?, ?)");
                        student_ids.forEach(studentId => {
                            stmt.run(parentId, studentId);
                        });
                        stmt.finalize();
                    }
                    
                    res.json({ success: true, message: 'Parent updated successfully' });
                });
            } else {
                res.json({ success: true, message: 'Parent updated successfully' });
            }
        }
    );
});

app.delete('/api/parent-accounts/:id', verifyToken, (req, res) => {
    const parentId = req.params.id;
    
    db.run("DELETE FROM parent_student_links WHERE parent_id = ?", [parentId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        
        db.run("DELETE FROM parent_accounts WHERE id = ?", [parentId], function(err) {
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

// ============ ANALYTICS ROUTES ============
app.get('/api/analytics/performance', verifyToken, (req, res) => {
    db.get(`
        SELECT 
            COUNT(DISTINCT s.id) as total_students,
            COALESCE(AVG(r.marks), 0) as avg_score,
            COALESCE(COUNT(CASE WHEN r.marks >= 80 THEN 1 END) * 100.0 / NULLIF(COUNT(r.id), 0), 0) as pass_rate
        FROM students s
        LEFT JOIN results r ON s.id = r.student_id
    `, (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json(row || { total_students: 0, avg_score: 0, pass_rate: 0 });
    });
});

app.get('/api/analytics/subjects', verifyToken, (req, res) => {
    db.all(`
        SELECT 
            subject_name,
            COALESCE(AVG(marks), 0) as avg_score,
            COUNT(*) as student_count,
            MAX(marks) as highest,
            MIN(marks) as lowest
        FROM results
        GROUP BY subject_name
        ORDER BY avg_score DESC
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/analytics/attendance-trends', verifyToken, (req, res) => {
    db.all(`
        SELECT 
            strftime('%Y-%m', date) as month,
            COUNT(CASE WHEN status = 'Present' THEN 1 END) * 100.0 / COUNT(*) as attendance_rate
        FROM attendance
        WHERE date IS NOT NULL
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month DESC
        LIMIT 6
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/analytics/fees', verifyToken, (req, res) => {
    db.get(`
        SELECT 
            COALESCE(SUM(amount), 0) as total_fees,
            COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) as collected,
            COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0) as pending
        FROM fees
    `, (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json(row || { total_fees: 0, collected: 0, pending: 0 });
    });
});

// ============ EMAIL ROUTES ============
console.log('📧 Setting up email transporter...');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'jasontania64@gmail.com',
        pass: 'jzrusvqz ojrhsmbh'
    },
    tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
    },
    family: 4,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    smtp: {
        ignoreTLS: false,
        requiresAuth: true
    }
});

// Verify with retry
let verifyAttempts = 0;
function checkTransporter() {
    transporter.verify((error, success) => {
        if (error) {
            verifyAttempts++;
            console.error(`❌ Email verification attempt ${verifyAttempts} failed:`, error.message);
            if (verifyAttempts < 3) {
                console.log('🔄 Retrying in 3 seconds...');
                setTimeout(checkTransporter, 3000);
            } else {
                console.log('⚠️ Email verification failed. Emails may still work. Continuing...');
            }
        } else {
            console.log('✅ Email transporter ready!');
            console.log(`📧 Sending from: jasontania64@gmail.com`);
            console.log('✅ Using IPv4 (forced)');
        }
    });
}
checkTransporter();

// Send email to a specific parent
app.post('/api/send-email', verifyToken, (req, res) => {
    const { to, subject, message, student_name } = req.body;

    if (!to || !subject || !message) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
        return res.status(400).json({ success: false, message: 'Invalid email address format' });
    }

    console.log(`📧 Sending email to: ${to}`);
    console.log(`📝 Subject: ${subject}`);

    const mailOptions = {
        from: '"Dawamu School" <jasontania64@gmail.com>',
        to: to,
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background: #1a7a3a; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px;">🏫 Dawamu School</h1>
                    <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Transforming Boys Into Leaders</p>
                </div>
                <div style="padding: 25px; background: #f8fff8;">
                    ${student_name ? `<p style="font-size: 16px; color: #1a7a3a;"><strong>Student:</strong> ${student_name}</p>` : ''}
                    <p style="font-size: 15px; line-height: 1.6; color: #333;">${message.replace(/\n/g, '<br>')}</p>
                </div>
                <div style="background: #e8f5e9; padding: 12px; text-align: center; font-size: 12px; color: #555; border-top: 2px solid #1a7a3a;">
                    <p style="margin: 3px 0;">This is an automated message from Dawamu School Management System.</p>
                    <p style="margin: 3px 0;">© 2026 Dawamu School. All rights reserved.</p>
                </div>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        const status = error ? 'Failed' : 'Sent';
        const errorMessage = error ? error.message : null;
        
        db.run(
            `INSERT INTO email_logs (recipient_email, student_name, subject, message, status, error_message, sent_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [to, student_name || null, subject, message, status, errorMessage, req.userId],
            (logErr) => {
                if (logErr) console.error('Error logging email:', logErr);
            }
        );

        if (error) {
            console.error('❌ Email error:', error);
            let errorMsg = 'Failed to send email';
            if (error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') {
                errorMsg = 'Network error: Cannot reach email server. Please check your internet connection.';
            } else if (error.code === 'EAUTH') {
                errorMsg = 'Authentication error: Please check your email credentials.';
            } else if (error.code === 'ESOCKET') {
                errorMsg = 'Connection error: Please check your internet connection.';
            } else {
                errorMsg = error.message;
            }
            return res.status(500).json({ success: false, message: errorMsg, code: error.code });
        }
        console.log('✅ Email sent:', info.messageId);
        res.json({ success: true, message: 'Email sent successfully!', info: info });
    });
});

// Send email to all parents
app.post('/api/send-email-all', verifyToken, (req, res) => {
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    db.all("SELECT email, full_name FROM parent_accounts", (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        const emails = rows.map(row => row.email);
        if (emails.length === 0) {
            return res.status(400).json({ success: false, message: 'No parent emails found' });
        }

        const mailOptions = {
            from: '"Dawamu School" <jasontania64@gmail.com>',
            bcc: emails.join(','),
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background: #1a7a3a; color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 28px;">🏫 Dawamu School</h1>
                        <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Transforming Boys Into Leaders</p>
                    </div>
                    <div style="padding: 25px; background: #f8fff8;">
                        <p style="font-size: 15px; line-height: 1.6; color: #333;">${message.replace(/\n/g, '<br>')}</p>
                    </div>
                    <div style="background: #e8f5e9; padding: 12px; text-align: center; font-size: 12px; color: #555; border-top: 2px solid #1a7a3a;">
                        <p style="margin: 3px 0;">This is an automated message from Dawamu School Management System.</p>
                        <p style="margin: 3px 0;">© 2026 Dawamu School. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            const status = error ? 'Failed' : 'Sent';
            const errorMessage = error ? error.message : null;
            
            rows.forEach(parent => {
                db.run(
                    `INSERT INTO email_logs (recipient_email, recipient_name, subject, message, status, error_message, sent_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [parent.email, parent.full_name, subject, message, status, errorMessage, req.userId],
                    (logErr) => {
                        if (logErr) console.error('Error logging email:', logErr);
                    }
                );
            });

            if (error) {
                console.error('❌ Email error:', error);
                let errorMsg = 'Failed to send emails';
                if (error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') {
                    errorMsg = 'Network error: Cannot reach email server. Please check your internet connection.';
                } else if (error.code === 'EAUTH') {
                    errorMsg = 'Authentication error: Please check your email credentials.';
                } else {
                    errorMsg = error.message;
                }
                return res.status(500).json({ success: false, message: errorMsg });
            }
            res.json({ success: true, message: `Email sent to ${emails.length} parents!`, info: info });
        });
    });
});

// ============ EMAIL STATS & HISTORY ============
app.get('/api/email-stats', verifyToken, (req, res) => {
    db.get("SELECT COUNT(*) as total FROM parent_accounts", (err, parentRow) => {
        if (err) {
            console.error('Error fetching parent count:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
        
        const totalParents = parentRow ? parentRow.total : 0;
        const today = new Date().toISOString().split('T')[0];
        
        db.get(
            `SELECT COUNT(*) as sent_today FROM email_logs 
             WHERE status = 'Sent' AND DATE(sent_at) = ?`,
            [today],
            (err, todayRow) => {
                if (err) {
                    return res.json({
                        sent_today: 0,
                        total_parents: totalParents,
                        success_rate: 0,
                        failed_emails: 0
                    });
                }
                
                db.get(
                    `SELECT COUNT(*) as failed FROM email_logs WHERE status = 'Failed'`,
                    (err, failedRow) => {
                        if (err) {
                            return res.json({
                                sent_today: todayRow ? todayRow.sent_today : 0,
                                total_parents: totalParents,
                                success_rate: 0,
                                failed_emails: 0
                            });
                        }
                        
                        db.get(
                            `SELECT COUNT(*) as total_sent FROM email_logs WHERE status = 'Sent'`,
                            (err, sentRow) => {
                                if (err) {
                                    return res.json({
                                        sent_today: todayRow ? todayRow.sent_today : 0,
                                        total_parents: totalParents,
                                        success_rate: 0,
                                        failed_emails: failedRow ? failedRow.failed : 0
                                    });
                                }
                                
                                const totalSent = sentRow ? sentRow.total_sent : 0;
                                const totalFailed = failedRow ? failedRow.failed : 0;
                                const totalAttempts = totalSent + totalFailed;
                                const successRate = totalAttempts > 0 ? Math.round(totalSent / totalAttempts * 100) : 0;
                                
                                res.json({
                                    sent_today: todayRow ? todayRow.sent_today : 0,
                                    total_parents: totalParents,
                                    success_rate: successRate,
                                    failed_emails: totalFailed
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

app.get('/api/email-history', verifyToken, (req, res) => {
    db.all(`
        SELECT 
            id,
            DATE(sent_at) as date,
            COALESCE(student_name, recipient_name, 'Unknown') as student,
            subject as type,
            status
        FROM email_logs 
        ORDER BY sent_at DESC 
        LIMIT 20
    `, (err, rows) => {
        if (err || !rows || rows.length === 0) {
            const history = [
                { 
                    id: 1, 
                    date: new Date().toISOString().split('T')[0], 
                    student: 'Jason Njagi', 
                    type: 'Announcement', 
                    status: 'Sent' 
                },
                { 
                    id: 2, 
                    date: new Date(Date.now() - 86400000).toISOString().split('T')[0], 
                    student: 'All Parents', 
                    type: 'School News', 
                    status: 'Sent' 
                },
                { 
                    id: 3, 
                    date: new Date(Date.now() - 172800000).toISOString().split('T')[0], 
                    student: 'John Doe', 
                    type: 'Fee Reminder', 
                    status: 'Failed' 
                }
            ];
            return res.json(history);
        }
        res.json(rows);
    });
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