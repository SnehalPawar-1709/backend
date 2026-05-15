const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'No token — please login again' });

  const token = header.split(' ')[1];
  if (!token)
    return res.status(401).json({ success: false, message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch(e) {
    if (e.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Session expired — please login again' });
    return res.status(401).json({ success: false, message: 'Invalid token — please login again' });
  }
};
