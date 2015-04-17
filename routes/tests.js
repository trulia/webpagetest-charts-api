/*
 * the endpoints for fetching test result data
 * makes some assumptions about what is wanted (eg: charts)
 */

var express   = require('express');
var router    = express.Router();
var debug     = require('debug')('wpt-api:tests');
var _         = require('lodash');
var jf        = require('jsonfile');
var moment    = require('moment');
var cache     = require('memory-cache');
var dataStore = require('../data_store/file');

/*
 * Settings for tests
 */
var masterConfig = jf.readFileSync(process.env.SUITE_CONFIG);
var availableChartTypes = [
  "SpeedIndex",
  "loadTime",
  "fullyLoaded",
  "TTFB",
  "visualComplete"
];
var defaultChartConfig = {
  type : "SpeedIndex",
  dataRange: [0, Infinity],
  dateCutoff: 30
};

var defaultHeaders = {
  'Cache-Control': 'public, max-age: 3600'
};



/**
 * Get all the tests for a suite and data points
 * within those tests.
 */
router.get('/:suiteId', function(req, res) {
  var data = getCache(req);

  if (!data) {
    data = dataStore.getSuite(req.params.suiteId);
    var suiteConfig = _.find(masterConfig.testSuites, {suiteId: data.suite});

    data.charts = [];
    data.chartConfig = buildChartConfig(req, suiteConfig.chartConfig);
    data.availableChartTypes = availableChartTypes;
    data.suiteConfig = suiteConfig;

    data.tests.forEach(function(testName){
      testData = dataStore.getSuiteTest(data.suite, testName);
      data.charts.push(chartFromDatapoints(
        data.suite,
        _.find(suiteConfig.testPages, {testId: testName}),
        testData.datapoints,
        data.chartConfig
      ));
    });
    setCache(req, data)
  }

  res.set(defaultHeaders);
  res.json(data);
  
});


/**
 * Get the all the results for a specific test
 * this is a lot you probably want '/:suiteId'
 */
router.get('/:suiteId/:testId', function(req, res) {
  var data = getCache(req);

  if (!data) {
    data = dataStore.getSuiteTest(req.params.suiteId, req.params.testId);
    setCache(req, data)
  }

  res.set(defaultHeaders);
  res.json(data);
  
});


/**
 * Get a specific datapoint
 */
router.get('/:suiteId/:testId/:datapointId', function(req, res) {

  var data = getCache(req);

  if (!data) {
    data = dataStore.getDatapoint(req.params.suiteId, req.params.testId, req.params.datapointId);
    var suiteConfig = _.find(masterConfig.testSuites, {suiteId: data.suiteId})
      , testData = cachedData(['suiteId', 'testId'], req) || dataStore.getSuiteTest(data.suiteId, data.testId)
    ;

    data.testConfig = _.find(suiteConfig.testPages, {testId: data.testId});
    data.chartConfig = buildChartConfig(req, suiteConfig.chartConfig);
    data.chart = chartFromDatapoints(
      data.suiteId,
      _.find(suiteConfig.testPages, {testId: data.testId}),
      testData.datapoints,
      data.chartConfig
    );
    setCache(req, data)
  }

  res.set(defaultHeaders);
  res.json(data);

});

module.exports = router;

function buildChartConfig(req, defaultConfig) {
  var type = makeType(req.query.chartType)
    , typeConfig =  _.find(defaultConfig, {type: type})
    , dateCutoff = makeDateCutoff(req.query.dateCutoff, typeConfig)
    , dataRange = makeDataRange(req.query.dataRange, typeConfig)
    ;

  return {
    type: type,
    dateCutoff: dateCutoff,
    dataRange: dataRange
  };
}

function makeType(type) {
  return _.indexOf(availableChartTypes, type) != '-1' ? type :defaultChartConfig.type;
}

function makeDateCutoff(cutoff, suiteConfig) {
  var custom = parseInt(cutoff, 10)
    , defaultVal = (suiteConfig && suiteConfig.dateCutoff) ? suiteConfig.dateCutoff : defaultChartConfig.dateCutoff
    ;

  return custom || defaultVal;
}

function makeDataRange(range, suiteConfig) {
  var dataRange = !range ? [0,0] : range.split(',').map(function(val){ return parseInt(val, 10) || Infinity })
    , defaultVal = (suiteConfig && suiteConfig.dataRange) ? suiteConfig.dataRange : defaultChartConfig.dataRange
    ;

  //valid range, or default for suite, or default for anything
  return (dataRange[0] < dataRange[1]) ? dataRange : defaultVal;
}

function chartFromDatapoints(suiteId, testConfig, datapoints, chartConfig) {
  var chart = {
        suiteId: suiteId,
        testId: testConfig.testId,
        testDisplayName: testConfig.testDisplayName,
        fvValues: [],
        rvValues: [],
        datapoints: []
      }
    , dateCutoff = moment().subtract((chartConfig.dateCutoff || 30), 'days')
  ;

  datapoints.forEach(function(dp) {
    var dataDate = new Date(dp.data.completed * 1000);
    //if older ignore.
    if (dataDate < dateCutoff) {
      return;
    }

    fvPointValue = parseInt(dp.data.runs[1].firstView[chartConfig.type], 10);
    rvPointValue = parseInt(dp.data.runs[1].repeatView[chartConfig.type], 10);

    if (inRange(fvPointValue, chartConfig.dataRange)
      && inRange(rvPointValue, chartConfig.dataRange)) {
      chart.fvValues.push([dataDate.getTime(), fvPointValue]);
      chart.rvValues.push([dataDate.getTime(), rvPointValue]);
      chart.datapoints.push(dp.id);
    }

  });

  return chart;
}

function inRange (value, range) {
  debug('inRange comparing ' + value + ' to ' + range.toString());
  return value > range[0] && value < range[1];
}

function cacheKey(req) {
  var paramsKey = 'suite' + req.params.suiteId +
                  'test' + req.params.testId +
                  'dp' + req.params.datapointId
    , queryKey  = 'ct' + req.query.chartType +
                  'dr' + req.query.dataRange +
                  'dc' + req.query.dateCutoff
    ;

  return paramsKey + queryKey;
}

function getCache(req) {
  var key = cacheKey(req)
    , data = cache.get(key)
    ;

  debug('getting cache key: ' + key);
  debug(data);

  return data;
}

function setCache(req, data) {
    var key = cacheKey(req);

  debug('setting cache key: ' + key);
  debug(data);
  
  return cache.put(key, data, 1000 * (60 * 60));
}

