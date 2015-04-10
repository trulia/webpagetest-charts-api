/*
 * Given a test result data, save it.
 * Asked for a test result, retrieve it.
 */

var debug   = require('debug')('wptc:data_store_fs');
var moment  = require('moment');
var request = require('request');
var mkdirp  = require('mkdirp');
var fs      = require('fs');
var path    = require('path');
var jf      = require('jsonfile');
var os      = require('os');
var junk    = require('junk');

//this should probably come from config
var resultsPath = 'public' + path.sep + 'results' + path.sep;

dataStore = {

  /*
   * Given a test and some results, save to the file system:
   * the json
   * filmstrip image
   * waterfall image
   * for the intial view and the refresh view.
   */
  saveDatapoint: function saveDatapointTest_anon(test, results) {

    //the internet is flaky sometimes
    if (!goodTestResults(results)){
      console.error('Test Died on: ' + results.response.data.testUrl);
      return;
    }

    var response = results.data
      , datePath = moment().format('YYYY-MM-DD-HH-mm-ss')
      , datapointPath = test.suitePathName + path.sep + test.testId + path.sep + datePath
      , datapointDir  = resultsPath + datapointPath
      ;

    //make the new dir structure
    mkdirp.sync(datapointDir);

    //save the json test data to a file
    jf.writeFile(datapointDir + path.sep + 'results.json', results, function(err) {
      if (err) console.error(err);
    });

    debug('Saved results for ' + response.testUrl);

  },

  getDatapoint: function getTestData_anon(suiteId, testId, datapointId) {
  
    var tests = fs.readdirSync(resultsPath + suiteId + path.sep + testId).filter(junk.not)
      , testIndex = tests.indexOf(datapointId)
      , testDir = resultsPath + suiteId + path.sep + testId + path.sep + tests[testIndex] + path.sep
      , data = {}
      , resourceBase = '/results/' + suiteId + '/' + testId + '/' + datapointId + '/'
      ;
    
    data = {
      datapointId: datapointId,
      suiteId: suiteId,
      testId: testId,
      jsonLink: resourceBase + 'results.json',
      testResults: jf.readFileSync(testDir + 'results.json'),
      testDate: tests[testIndex],
      nextTest: testIndex < tests.length - 1 ?  {suiteId: suiteId, testId: testId, datapointId: tests[testIndex + 1]} : null,
      prevTest: testIndex > 0 ? {suiteId: suiteId, testId: testId, datapointId: tests[testIndex - 1]} : null,
    };
    
    return data;
  },

  /*
   * Return the data for a suite of tests
   */
  getSuite: function (suiteName) {
    debug("getting suite: " + suiteName);

    var suiteDir = resultsPath + suiteName
      , testDirs = fs.readdirSync(suiteDir).filter(junk.not)
      ;

    suite = {
      suite: suiteName,
      tests: testDirs
    };

    return suite;
  },

  getSuiteTest: function getChartData_anon (suiteName, testName) {
    
    debug("getting suite test: " + suiteName + ' - ' + testName);

    suiteTests = {
      suite: suiteName,
      testName: testName,
      datapoints: []
    };

    var testDirBase = resultsPath + suiteName + path.sep + testName;

    testDirs = fs.readdirSync(testDirBase).filter(junk.not);
    testDirs.forEach(function(testDir){
      var datapoint = {
            id: testDir,
            //sync to keep the array of results in order. lil lazy/slow
            data: jf.readFileSync(testDirBase + path.sep + testDir + path.sep + 'results.json').data
          }
        ;
      suiteTests.datapoints.push(datapoint);
    });
    return suiteTests;
  }
};


module.exports = dataStore;

/*
 * An overly verbose debugged method for helping
 * with occasional network service inconsistencies
 */
function goodTestResults (results) {
    var msg = 'goodTestResults suceeeded'
      , res = true
      ;

    if (!results.data.runs[1]) {
      msg = 'no results.data.runs[1]';
      res = false;
    } else if (!results.data.runs[1].firstView) {
      msg = 'no results.data.runs[1].firstView';
      res = false;
    } else if (!results.data.runs[1].repeatView) {
      msg = 'no results.data.runs[1].repeatView';
      res = false;
    } else if (!results.data.runs[1].firstView.images) {
      msg = 'no results.data.runs[1].firstView.images';
      res = false;
    } else if (!results.data.runs[1].repeatView.images) {
      msg = 'no results.data.runs[1].repeatView.images';
      res = false;
    } else if (!results.data.runs[1].firstView.SpeedIndex) {
      msg = 'no results.data.runs[1].firstView.SpeedIndex';
      res = false;
    } else if (!results.data.runs[1].repeatView.SpeedIndex) {
      msg = 'no results.data.runs[1].repeatView.SpeedIndex';
      res = false;
    }

    debug(msg);
    debug(results);
    return res;
}