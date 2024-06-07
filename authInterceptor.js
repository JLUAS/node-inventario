// authMiddleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401); // Si no hay token, retornar "Unauthorized"

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Si el token no es válido, retornar "Forbidden"
    req.user = user;
    next(); // Continuar con la solicitud
  });
}

module.exports = authenticateToken;
