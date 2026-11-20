const authService = require('../services/auth.service');

function requestMeta(req) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

async function register(req, res) {
  const user = await authService.register(req.body);
  res.status(201).json({ data: user });
}

async function login(req, res) {
  const data = await authService.login(req.body, requestMeta(req));
  res.json({ data });
}

async function refresh(req, res) {
  const data = await authService.refresh(req.body.refreshToken, requestMeta(req));
  res.json({ data });
}

async function logout(req, res) {
  await authService.logout(req.body.refreshToken);
  res.status(204).end();
}

async function me(req, res) {
  const user = await authService.getMe(req.user.id);
  res.json({ data: user });
}

async function updateMe(req, res) {
  const user = await authService.updateMe(req.user.id, req.body);
  res.json({ data: user });
}

async function changePassword(req, res) {
  await authService.changePassword(req.user.id, req.body);
  res.status(204).end();
}

module.exports = { register, login, refresh, logout, me, updateMe, changePassword };
