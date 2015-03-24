/*
 * A route to show the currently running config for the app.
 */

var express = require('express');
var router = express.Router();
var debug = require('debug')('wpt-api:suite_config');
var jf  = require('jsonfile');

router.get('/', function(req, res, next) {
  var config = jf.readFileSync(process.env.SUITE_CONFIG);
  res.json(config);
});

module.exports = router;
