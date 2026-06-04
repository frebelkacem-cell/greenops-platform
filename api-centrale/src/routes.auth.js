const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { pool } = require('./db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username et password requis.' });
  }
  try {
    const result = await pool.query(
      'SELECT id, username, password, role FROM users WHERE username = $1',
      [username]
    );
    if (result.rowCount === 0) return res.status(401).json({ error: 'Identifiants invalides.' });

    const user  = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Identifiants invalides.' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    return res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    console.error('[Auth] Erreur login:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
