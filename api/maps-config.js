// Public browser key only. Never read or return the Geocoding credential here.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error: 'Método não permitido.'});
  }
  const key = (process.env.GOOGLE_MAPS_BROWSER_API_KEY || '').trim();
  if (!key) return res.status(503).json({error: 'Configure GOOGLE_MAPS_BROWSER_API_KEY na Vercel para este Preview e faça um novo deploy.'});
  return res.status(200).json({key});
};
