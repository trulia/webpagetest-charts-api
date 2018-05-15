//specify the dataStore that you want to use
const dataInterface = require("./file");
//var dataInterface = require('./db');
const debug = require("debug")("wpt-api:data_store");

var apiInterface = {
  saveDatapoint: function saveDatapoint_interface(test, results) {
    //the internet is flaky sometimes
    if (!goodTestResults(results)) {
      console.error("Test Died on: " + results.data.testUrl);
      return;
    }

    try {
      delete results.data.average;
      delete results.data.median;
      delete results.data.standardDeviation;
      delete results.data.lighthouse; //huuuuuge
    } catch (e) {
      debug("ran into trouble deleting extra data.");
    }

    dataInterface.saveDatapoint(test, results);
  },

  getDatapoint: dataInterface.getDatapoint,
  getSuite: dataInterface.getSuite,
  getSuiteTest: dataInterface.getSuiteTest
};

module.exports = apiInterface;

/*
 * An overly verbose debugged method for helping
 * with occasional network service inconsistencies
 */
function goodTestResults(results) {
  let msg = "goodTestResults suceeeded";
  let res = true;

  if (!results.data.runs[1]) {
    msg = "no results.data.runs[1]";
    res = false;
  } else if (!results.data.runs[1].firstView) {
    msg = "no results.data.runs[1].firstView";
    res = false;
  } else if (!results.data.runs[1].firstView.images) {
    msg = "no results.data.runs[1].firstView.images";
    res = false;
  } else if (
    results.data.runs[1].repeatView &&
    !results.data.runs[1].repeatView.images
  ) {
    msg = "no results.data.runs[1].repeatView.images";
    res = false;
  } else if (!results.data.runs[1].firstView.SpeedIndex) {
    msg = "no results.data.runs[1].firstView.SpeedIndex";
    res = false;
  } else if (
    results.data.runs[1].repeatView &&
    !results.data.runs[1].repeatView.SpeedIndex
  ) {
    msg = "no results.data.runs[1].repeatView.SpeedIndex";
    res = false;
  } else if (!results.data.runs[1].firstView["lighthouse.Performance"]) {
    msg = "no results.data.runs[1].firstView.['lighthouse.Performance']";
    res = false;
  } else if (
    results.data.runs[1].repeatView &&
    !results.data.runs[1].repeatView["lighthouse.Performance"]
  ) {
    msg = "no results.data.runs[1].repeatView.['lighthouse.Performance']";
    res = false;
  }

  debug(msg);
  debug(results);
  return res;
}
