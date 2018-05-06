/*
 * Given a test result data, save it.
 * Asked for a test result, retrieve it.
 */

const debug = require("debug")("wpt-api:data_store");
const moment = require("moment");
const request = require("request");
const mkdirp = require("mkdirp");
const fs = require("fs");
const path = require("path");
const jf = require("jsonfile");
const os = require("os");
const junk = require("junk");
const async = require("async");

//this should probably come from config
const resultsPath = "public" + path.sep + "results" + path.sep;

dataStore = {
  /*
   * Given a test and some results, save to the file system:
   * the json
   * filmstrip image
   * waterfall image
   * for the intial view and the refresh view.
   */
  saveDatapoint: function saveDatapoint(test, results) {
    let response = results.data;
    let datePath = moment().format("YYYY-MM-DD-HH-mm-ss");
    let datapointPath =
      test.suiteId + path.sep + test.testId + path.sep + datePath;
    let datapointDir = resultsPath + datapointPath;

    //make the new dir structure
    mkdirp.sync(datapointDir);

    //save the json test data to a file
    jf.writeFile(datapointDir + path.sep + "results.json", results, function(
      err
    ) {
      if (err) console.error(err);
    });

    debug("Saved results for " + response.testUrl);
  },

  getDatapoint: function getDatapoint(suiteId, testId, datapointId, callback) {
    fs.readdir(resultsPath + suiteId + path.sep + testId, function(err, tests) {
      if (err || !tests) {
        debug(
          "no tests found for datapoint: " +
            suiteId +
            " - " +
            testId +
            " - " +
            datapointId
        );
        callback({});
        return;
      }
      tests = tests.filter(junk.not);
      let testIndex = tests.indexOf(datapointId);
      let testDir =
        resultsPath +
        suiteId +
        path.sep +
        testId +
        path.sep +
        tests[testIndex] +
        path.sep;
      let data = {};
      let resourceBase =
        "/results/" + suiteId + "/" + testId + "/" + datapointId + "/";

      jf.readFile(testDir + "results.json", function(err, jsonResults) {
        data = {
          datapointId: datapointId,
          suiteId: suiteId,
          testId: testId,
          jsonLink: resourceBase + "results.json",
          testResults: jsonResults,
          testDate: tests[testIndex],
          nextTest:
            testIndex < tests.length - 1
              ? {
                  suiteId: suiteId,
                  testId: testId,
                  datapointId: tests[testIndex + 1]
                }
              : null,
          prevTest:
            testIndex > 0
              ? {
                  suiteId: suiteId,
                  testId: testId,
                  datapointId: tests[testIndex - 1]
                }
              : null
        };
        callback(data);
      });
    });
  },

  /*
   * Return the data for a suite of tests
   */
  getSuite: function getSuite(suiteId, callback) {
    debug("getting suite: " + suiteId);

    let suiteDir = resultsPath + suiteId;
    fs.readdir(suiteDir, function(err, testDirsRaw) {
      if (err) {
        console.error(err);
      }
      const testDirs = testDirsRaw.filter(junk.not);

      suite = {
        suiteId: suiteId,
        tests: testDirs
      };

      callback(suite);
    });
  },

  getSuiteTest: function getSuiteTest(suiteName, testName, callback) {
    debug("getting suite test: " + suiteName + " - " + testName);

    let suiteTests = {
      suite: suiteName,
      testName: testName,
      datapoints: []
    };

    let testDirBase = resultsPath + suiteName + path.sep + testName;

    fs.readdir(testDirBase, function(err, testDirs) {
      testDirs = testDirs.filter(junk.not);
      async.map(
        testDirs,
        function(testDir, asyncCallback) {
          jf.readFile(
            testDirBase + path.sep + testDir + path.sep + "results.json",
            function(err, jsonData) {
              const datapoint = {
                datapointId: testDir,
                data: jsonData.data
              };
              suiteTests.datapoints.push(datapoint);
              asyncCallback();
            }
          );
        },
        function() {
          callback(suiteTests);
        }
      );
    });
  }
};

module.exports = dataStore;
