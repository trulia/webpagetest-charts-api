/*
 * the endpoints for fetching test result data
 * makes some assumptions about what is wanted (eg: charts)
 */

const express = require("express");
const router = express.Router();
const debug = require("debug")("wpt-api:tests");
const _ = require("lodash");
const async = require("async");
const jf = require("jsonfile");
const moment = require("moment");
const cache = require("memory-cache");

//change this to the data store you want to use
const dataStore = require("../data_store");

/*
 * Settings for tests
 */
const masterConfig = jf.readFileSync(process.env.SUITE_CONFIG);
const availableChartTypes = [
  "SpeedIndex",
  "loadTime",
  "fullyLoaded",
  "TTFB",
  "visualComplete"
];
const defaultChartConfig = {
  type: "SpeedIndex",
  dataRange: [0, Infinity],
  dateCutoff: 30
};

const defaultHeaders = {
  "Cache-Control": "public, max-age: 3600"
};

/**
 * Get all the tests for a suite and data points
 * within those tests.
 */
router.get("/:suiteId", function(req, res) {
  let data = getCache(req);

  if (data) {
    encloseRenderSuite(req, res)(data);
  } else {
    data = dataStore.getSuite(req.params.suiteId, encloseRenderSuite(req, res));
  }
});

/**
 * Get a specific datapoint
 */
router.get("/:suiteId/:testId/:datapointId", function(req, res) {
  let data = getCache(req);

  if (data) {
    encloseRenderDatapoint(req, res)(data);
  } else {
    dataStore.getDatapoint(
      req.params.suiteId,
      req.params.testId,
      req.params.datapointId,
      encloseRenderDatapoint(req, res)
    );
  }
});

module.exports = router;

function buildChartConfig(req, defaultConfig) {
  let type = makeType(req.query.chartType);
  let typeConfig = _.find(defaultConfig, { type: type });
  let dateCutoff = makeDateCutoff(req.query.dateCutoff, typeConfig);
  let dataRange = makeDataRange(req.query.dataRange, typeConfig);

  return {
    type: type,
    dateCutoff: dateCutoff,
    dataRange: dataRange
  };
}

function makeType(type) {
  return _.indexOf(availableChartTypes, type) != "-1"
    ? type
    : defaultChartConfig.type;
}

function makeDateCutoff(cutoff, suiteConfig) {
  const custom = parseInt(cutoff, 10);
  const defaultVal =
    suiteConfig && suiteConfig.dateCutoff
      ? suiteConfig.dateCutoff
      : defaultChartConfig.dateCutoff;

  return custom || defaultVal;
}

function makeDataRange(range, suiteConfig) {
  const range = range ? range : "0,0";
  const defaultVal =
    suiteConfig && suiteConfig.dataRange
      ? suiteConfig.dataRange
      : defaultChartConfig.dataRange;

  const dataRange = range.split(",").map(function(val) {
    var parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      parsed = Infinity;
    }
    return parsed;
  });

  //valid range, or default for suite, or default for anything
  return dataRange[0] < dataRange[1] ? dataRange : defaultVal;
}

function chartFromDatapoints(suiteId, testConfig, datapoints, chartConfig) {
  let chart = {
    suiteId: suiteId,
    testId: testConfig.testId,
    testDisplayName: testConfig.testDisplayName,
    fvValues: [],
    rvValues: [],
    datapoints: []
  };
  let dateCutoff = moment().subtract(chartConfig.dateCutoff || 30, "days");

  datapoints.forEach(function(dp) {
    let dataDate = new Date(dp.data.completed * 1000);
    //if older ignore.
    if (dataDate < dateCutoff) {
      return;
    }

    fvPointValue = parseInt(dp.data.runs[1].firstView[chartConfig.type], 10);

    //if test requests a repeat firstView
    if (!testConfig.firstViewOnly) {
      rvPointValue = parseInt(dp.data.runs[1].repeatView[chartConfig.type], 10);
    }

    //this filtering should be moved to the data_store
    if (
      (inRange(fvPointValue, chartConfig.dataRange) &&
        testConfig.firstViewOnly) ||
      (inRange(fvPointValue, chartConfig.dataRange) &&
        inRange(rvPointValue, chartConfig.dataRange))
    ) {
      chart.fvValues.push([dataDate.getTime(), fvPointValue]);
      if (!testConfig.firstViewOnly) {
        chart.rvValues.push([dataDate.getTime(), rvPointValue]);
      }
      chart.datapoints.push(dp.datapointId);
    }
  });

  return chart;
}

function inRange(value, range) {
  debug("inRange comparing " + value + " to " + range.toString());
  return value > range[0] && value < range[1];
}

function cacheKey(req) {
  let paramsKey =
    "suite" +
    req.params.suiteId +
    "test" +
    req.params.testId +
    "dp" +
    req.params.datapointId;
  let queryKey =
    "ct" +
    req.query.chartType +
    "dr" +
    req.query.dataRange +
    "dc" +
    req.query.dateCutoff;

  return paramsKey + queryKey;
}

function getCache(req) {
  const key = cacheKey(req);
  const data = cache.get(key);

  debug("getting cache key: " + key);
  debug(data);

  return data;
}

function setCache(req, data) {
  const key = cacheKey(req);

  debug("setting cache key: " + key);
  debug(data);

  return cache.put(key, data, 1000 * (60 * 60));
}

function encloseRenderSuite(req, res) {
  return function renderSuite(data) {
    const suiteConfig = _.find(masterConfig.testSuites, {
      suiteId: data.suiteId
    });

    data.charts = [];
    data.chartConfig = buildChartConfig(req, suiteConfig.chartConfig);
    data.availableChartTypes = availableChartTypes;
    data.suiteConfig = suiteConfig;

    async.map(
      data.tests,
      function(testName, asyncCallback) {
        dataStore.getSuiteTest(data.suiteId, testName, function(testData) {
          data.charts.push(
            chartFromDatapoints(
              data.suiteId,
              _.find(suiteConfig.testPages, { testId: testName }),
              testData.datapoints,
              data.chartConfig
            )
          );
          asyncCallback();
        });
      },
      function(err, results) {
        setCache(req, data);
        res.set(defaultHeaders);
        res.json(data);
      }
    );
  };
}

function encloseRenderDatapoint(req, res) {
  return function renderDatapoint(data) {
    const suiteConfig = _.find(masterConfig.testSuites, {
      suiteId: data.suiteId
    });
    let testData;

    dataStore.getSuiteTest(data.suiteId, data.testId, function(testData) {
      data.testConfig = _.find(suiteConfig.testPages, { testId: data.testId });
      data.chartConfig = buildChartConfig(req, suiteConfig.chartConfig);
      data.chart = chartFromDatapoints(
        data.suiteId,
        _.find(suiteConfig.testPages, { testId: data.testId }),
        testData.datapoints,
        data.chartConfig
      );
      setCache(req, data);

      res.set(defaultHeaders);
      res.json(data);
    });
  };
}
