const { db } = require('../lib/db');
const { obsazenost } = require('../lib/terminy');
const { json, fail } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    const p = await db();
    const terminy = (await obsazenost(p)).map(({ obsazeno, ...t }) => t);
    json(res, 200, { terminy });
  } catch (e) { fail(res, e); }
};
