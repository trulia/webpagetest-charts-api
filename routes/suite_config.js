/*
 * A route to show the currently running config for the app.
 */

const express = require("express");
const router = express.Router();
const debug = require("debug")("wpt-api:suite_config");
const jf = require("jsonfile");

router.get("/", function(req, res, next) {
  const config = jf.readFileSync(process.env.SUITE_CONFIG);
  res.json(config);
});

module.exports = router;
