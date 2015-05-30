/*
 * Deals with running the tests and processing the responses.
 * The saving of the data is handled by the dataStore.
 */

var express     = require('express');
var router      = express.Router();
var debug       = require('debug')('wpt-api:run_tests');
var jf          = require('jsonfile');
var _           = require('lodash');

var WebPageTest = require('webpagetest');
var cheerio     = require('cheerio');
var request     = require('request');

var querystring = require('querystring');
var async       = require('async');
var dataStore   = require('../data_store/file');
var events      = require('events');


var testConfig = jf.readFileSync(process.env.SUITE_CONFIG);
var eventEmitter = new events.EventEmitter();

// Used to space out the test runs to prevent
// accidentally overwhleming WPT
var nextTestRun = Date.now();
var testInterval = (1000 * 10);

/*
 * Run the tests for the given suite
 */
router.get('/:testSuite', function(req, res, next) {
  var testSuite  = _.find(testConfig.testSuites, 'suiteId', req.params.testSuite);
  eventEmitter.emit('startTests', testSuite);
  res.json({message: 'tests have started for ' + req.params.testSuite});

});

module.exports = router;

/*
 * Start the test process, start parsing the data
 * into a format that WPT will like, gathering urls
 * if necessary
 */
eventEmitter.on('startTests', function startTests(testSuite) {
  debug('starting tests on ' + testSuite);

  //blend the suite settings into each test.
  testSuite.testPages.forEach(function(el, index, arr){
    _.defaults(testSuite.testPages[index], {
      testHost: testSuite.testHost,
      queryStringData: testSuite.queryStringData,
      parentRequestUserAgent: testSuite.parentRequestUserAgent,
      SpeedIndexChartRange: testSuite.SpeedIndexChartRange,
      location: testSuite.location
    });

    testSuite.testPages[index].suitePathName = testSuite.suiteId;

    if(testSuite.parentRequestUserAgent){
      testSuite.testPages[index].headers = {'User-Agent': testSuite.parentRequestUserAgent};
    }

  });

  convertToWPTRequests(testSuite.testPages);

});

/*
 * Convert the test data structure into a WPT data structure
 * Some test building requires making web requests, so this
 * is wrapped in async.
 */
function convertToWPTRequests(testPages) {
  debug('converting tests');
  debug(testPages);
  async.map(testPages, prepareTest, function(err, tests){
    debug('prepared');
    debug(tests);
    eventEmitter.emit('runTests', tests);
  });

}


/*
 * Take a test item and set it up to be processed by WPT
 * asyncCallback() is a noop used by async to know when
 * the `map` call in `convertToWPTRequests` is done
 */
function prepareTest(item, asyncCallback) {
  debug('preparing...');
  debug(item);
  //parentPage tests are twofold. Visit a page, get a url from that page, then test that url
  if(isParentPage(item)) {
    item.url = item.testHost + item.parentPath;
    request(item, function prepareEm(err, response, body) {
      if (err) {
        console.error(err);
      }

      item.url = makeTestUrl(item.testHost, getHrefFromElement(body,item.parentHrefSelector), item.queryStringData);
      asyncCallback(null, item);
    });
  } else {
    item.url = makeTestUrl(item.testHost, item.path, item.queryStringData);
    asyncCallback(null, item);
  }
}

/*
 * Is the page given in the test a page that
 * needs to be parsed for the actual link to test
 */
function isParentPage(page) {
  return _.has(page, 'parentHrefSelector') && _.has(page, 'parentPath');
}

/*
 * Build URL from host path and querystring. Never been done before.
 */
function makeTestUrl(host, path, qs) {
  var base   = host + path
    , qsJoin = base.strPos ? '&' : '?'
    ;

  return host + path + (!_.isEmpty(qs) ? qsJoin + querystring.stringify(qs) : '');
}

/*
 * Given a bit of html get the first matching link in it.
 */
function getHrefFromElement(body, selector) {
  var href
    , $ = cheerio.load(body)
    ;

  if ($(selector)[0]) {
    href = $(selector)[0].attribs.href;
  }

  debug('using ' + selector + ' found a href of' + href);
  return href;
}

/*
 * Run each test
 */
eventEmitter.on('runTests', function runTests(tests) {
  tests.forEach(function(test){
    setTimeout(function() {
      runTest(test);
    }, getTestRunTimeout());
  });
});


/*
 * Spaces out the tests every `testInterval` ms to prevent overloading WPT
 */
function getTestRunTimeout() {
  var difference = Date.now() - nextTestRun
    , pad = difference > 0 ? 0 : (testInterval + Math.abs(difference))
  ;

  nextTestRun = Date.now() + pad;
  return pad;
}

/*
 * Run the webpage test and save the results
 * The specified options could be in config.
 */
function runTest(test) {
  debug('Starting test on ' + test.url + ' using ' + test.location);
  var testConfig = jf.readFileSync(process.env.SUITE_CONFIG)
    , wptPublic = new WebPageTest('www.webpagetest.org', testConfig.wptApiKey)
    , options = {
        pollResults   : 5, //poll every 5 seconds
        timeout       : 600, //wait for 10 minutes
        video         : true, //this enables the filmstrip
        location      : test.location,
        firstViewOnly : false //do calculate the second/refresh view
      }
    ;

  wptPublic.runTest(test.url, options, function(err, results) {
    if (err) {
      return console.error([err, {url: test.url, options: options}]);
    }

    dataStore.saveDatapoint(test, results);
  });
}
