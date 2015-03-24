/*
 * Return the available routes and what they do.
 */

var express = require('express');
var router  = express.Router();
var debug   = require('debug')('wpt-api:info');

router.get('/', function(req, res, next) {
  var data = {
    'availableEndpoints': {
      '/run_tests/:suiteName': 'Manually run the tests. Don\'t abuse, WPT is sensitive',
      '/suite_config': 'See the test config that is being used',
      '/tests': 'get a list of suites and their tests',
      '/tests/:suiteName/': 'Get chartable data for each test in the suite.',
      '/tests/:suiteName/:testName': 'Get aggregated data for a test within a suite, and links to the tests within. A lot of data.',
      '/tests/:suiteName/:testName/:testId': 'Get a specific test'
    }
  };
  debug('sending info: ' + data.toString());
  res.json(data);
});

module.exports = router;
