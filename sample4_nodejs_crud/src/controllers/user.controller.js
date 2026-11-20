const userService = require('../services/user.service');

async function list(req, res) {
  const { items, meta } = await userService.list(req.query);
  res.json({ data: items, meta });
}

async function detail(req, res) {
  const user = await userService.getById(req.params.id);
  res.json({ data: user });
}

async function create(req, res) {
  const user = await userService.create(req.body);
  res.status(201).json({ data: user });
}

async function update(req, res) {
  const user = await userService.update(req.user, req.params.id, req.body);
  res.json({ data: user });
}

async function remove(req, res) {
  await userService.remove(req.user, req.params.id);
  res.status(204).end();
}

module.exports = { list, detail, create, update, remove };
