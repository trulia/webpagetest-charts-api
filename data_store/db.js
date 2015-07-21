/*
 * Given a test result test_results, save it.
 * Asked for a test result, retrieve it.
 */

var debug         = require('debug')('wpt-api:data_store');
var moment        = require('moment');
var async         = require('async');
var camelCaseKeys = require('camelcase-keys');
var db            = require('any-db');


var config  = {conString: 'driver://user:pass@localhost/database'};

dataStore = {

  /*
   * Given a test and some results, save to the db:
   * the json
   * for the intial view and the refresh view.
   */
  saveDatapoint: function saveDatapoint(test, results) {

    var response = results.data
      , testId = test.testId
      , suiteId = test.suiteId
      , conString = config.conString
      , conn = new db.createConnection(conString)
      , insertQuery = "\
        INSERT INTO \
          webpagetestcharts \
          (test_results, \
           date, \
           test_id, \
           suite_id) \
        VALUES \
          ('" + JSON.stringify(results) + "', \
          'now()', \
          '" + testId + "', \
          '" + suiteId + "')"
      ;


      conn.query(insertQuery, function(err, result) {
        if(err) {
          return console.error('error running query:' + insertQuery, err);
        }
        debug('Saved results for ' + response.testUrl);
      });
  },

  getDatapoint: function getDatapoint(suiteId, testId, datapointId, callback) {

    var data = {}
     , pageString
     , conString = config.conString
     , conn = new db.createConnection(conString)
     , testQuery = " \
       SELECT * \
       FROM webpagetestcharts \
       WHERE datapoint_id = '" + datapointId + "' \
       AND suite_id = '" + suiteId + "' \
       AND test_id = '" + testId + "' \
       UNION ALL \
       (SELECT * \
         FROM webpagetestcharts \
         WHERE datapoint_id < '" + datapointId + "' \
         AND suite_id = '" + suiteId + "' \
         AND test_id = '" + testId + "' \
         ORDER BY datapoint_id \
         DESC limit 1) \
       UNION ALL \
       (SELECT * \
         FROM webpagetestcharts \
         WHERE datapoint_id > '" + datapointId + "' \
         AND suite_id = '" + suiteId + "' \
         AND test_id = '" + testId + "' \
         ORDER BY datapoint_id \
         ASC limit 1) "
     ;

       conn.query(testQuery, function(err, result) {
         if(err) {
           return console.error('error running query: ' + testQuery, err);
         }
         debug('fetched results for ' + datapointId);

         result.rows[0].test_results = JSON.parse(result.rows[0].test_results);
         data = camelCaseKeys(result.rows[0]);

         //next / prev result?
         [1,2].forEach(function(j){
           if (result.rows[j]) {
             pageString = 'nextTest';
             if (result.rows[j].datapoint_id < result.rows[0].datapoint_id) {
               pageString = 'prevTest';
             }
             delete result.rows[j].test_results;
             data[pageString] = camelCaseKeys(result.rows[j]);
           }
         });

         callback(data);
       });
  },

  /*
   * Return the data for a suite of tests
   */
  getSuite: function getSuite (suiteId, callback) {
    debug("getting suite: " + suiteId);

    var data
     , conString = config.conString
     , conn = new db.createConnection(conString)
     , testQuery = " \
        SELECT \
         DISTINCT test_id as test \
        FROM \
          webpagetestcharts \
        WHERE \
          suite_id = '" + suiteId + "'"
     ;

       var query = conn.query(testQuery, function(err, result) {
         if(err) {
           return console.error('error running query', err);
         }
         debug('fetched results for ' + suiteId);

         data = {
           suiteId: suiteId,
           tests: result.rows.map(function(r){ return r.test; })
         };
         callback(data);
       });
  },

  getSuiteTest: function getSuiteTest (suiteId, testId, callback) {

    var data = {
          suite: suiteId,
          testName: testId,
          datapoints: []
       }
     , conString = config.conString
     , conn = new db.createConnection(conString)
     , testsQuery = " \
        SELECT \
         test_results, \
         date, \
         datapoint_id, \
         test_id, \
         suite_id \
        FROM \
          webpagetestcharts \
        WHERE \
          suite_id = '" + suiteId + "' \
        AND \
          test_id = '" + testId + "' \
        ORDER BY \
          date ASC"
     ;

    var query = conn.query(testsQuery, function(err, result) {
     if(err) {
       return console.error('error running query', err);
     }
     debug('fetched results for ' + suiteId + ' - ' + testId);

     result.rows.forEach(function(row){
       datapoint = {
         datapointId: row.datapoint_id,
         data: JSON.parse(row.test_results).data,
       };
       data.datapoints.push(datapoint);
     })

     callback(data);
    });
  }

};


module.exports = dataStore;
