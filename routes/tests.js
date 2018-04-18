/*
 * the endpoints for fetching test result data
 * makes some assumptions about what is wanted (eg: charts)
 */

var express   = require('express');
var router    = express.Router();
var debug     = require('debug')('wpt-api:tests');
var _         = require('lodash');
var async     = require('async');
var jf        = require('jsonfile');
var moment    = require('moment');
var cache     = require('memory-cache');

//change this to the data store you want to use
var dataStore   = require('../data_store');

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

  if(data) {
    encloseRenderSuite(req, res)(data)
  } else {
    data = dataStore.getSuite(req.params.suiteId, encloseRenderSuite(req, res));
  }
});

/**
 * Get a specific datapoint
 */
router.get('/:suiteId/:testId/:datapointId', function(req, res) {

  var data = getCache(req);

  if (data) {
    encloseRenderDatapoint(req, res)(data);
  } else {
    dataStore.getDatapoint(
      req.params.suiteId,
      req.params.testId,
      req.params.datapointId,
      encloseRenderDatapoint(req, res)
    );
  };

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
  var range = range ? range : '0,0';
  var defaultVal = (suiteConfig && suiteConfig.dataRange) ? suiteConfig.dataRange : defaultChartConfig.dataRange;

  var dataRange = range.split(',').map(function(val){
          var parsed = parseInt(val, 10)
            if (isNaN(parsed)) {
              parsed = Infinity 
            }
            return parsed;
      })

  //valid range, or default for suite, or default for anything
  var validRange = (dataRange[0] < dataRange[1]) ? dataRange : defaultVal
  return validRange;
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

    //this filtering should be moved to the data_store
    if (inRange(fvPointValue, chartConfig.dataRange)
      && inRange(rvPointValue, chartConfig.dataRange)) {
      chart.fvValues.push([dataDate.getTime(), fvPointValue]);
      chart.rvValues.push([dataDate.getTime(), rvPointValue]);
      chart.datapoints.push(dp.datapointId);
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

function encloseRenderSuite(req, res) {
  return function renderSuite(data) {

    var suiteConfig = _.find(masterConfig.testSuites, {suiteId: data.suiteId});

    data.charts = [];
    data.chartConfig = buildChartConfig(req, suiteConfig.chartConfig);
    data.availableChartTypes = availableChartTypes;
    data.suiteConfig = suiteConfig;

    async.map(data.tests, function(testName, asyncCallback){
      dataStore.getSuiteTest(data.suiteId, testName, function(testData){
        data.charts.push(chartFromDatapoints(
          data.suiteId,
          _.find(suiteConfig.testPages, {testId: testName}),
          testData.datapoints,
          data.chartConfig
        ));
        asyncCallback();
      });
    }, function(err, results) {
      setCache(req, data)
      res.set(defaultHeaders);
      res.json(data);
    });
  }
}

function encloseRenderDatapoint(req, res) {
  return function renderDatapoint(data) {
    var suiteConfig = _.find(masterConfig.testSuites, {suiteId: data.suiteId})
      , testData
    ;

    dataStore.getSuiteTest(data.suiteId, data.testId, function(testData){
      data.testConfig = _.find(suiteConfig.testPages, {testId: data.testId});
      data.chartConfig = buildChartConfig(req, suiteConfig.chartConfig);
      data.chart = chartFromDatapoints(
        data.suiteId,
        _.find(suiteConfig.testPages, {testId: data.testId}),
        testData.datapoints,
        data.chartConfig
      );
      setCache(req, data)


      res.set(defaultHeaders);
      res.json(data);
    });
  }
}
