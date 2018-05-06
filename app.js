/*
 * Defines routes and the test running cron/setInterval
 */

var express     = require('express');
var path        = require('path');
var logger      = require('morgan');
var compress    = require('compression');
var jf          = require('jsonfile');
var request     = require('request');
var debug       = require('debug')('wpt-api:app');

//route handlers
var info        = require('./routes/info');
var suiteConfig = require('./routes/suite_config');
var runTests    = require('./routes/run_tests');
var tests       = require('./routes/tests');

var app         = express();

// if you want authentication, uncomment this section
// and `npm install --save basic-auth`
// note, that your ui can access the api using the login
// in the url:  http://a-username:a-password@example.com/
// var basicAuth = require('basic-auth');
//
// checkAuth = function(username, password) {
//   return function(req, res, next) {
//     var user = basicAuth(req);
//
//     if (!user || user.name !== username || user.pass !== password) {
//       res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
//       return res.send(401);
//     }
//
//     next();
//   };
// };
//
// // change these...
// app.use(checkAuth('a-username', 'a-password'));
// end auth section


app.use(logger('dev'));
app.use(compress());

//used to serve saved assets saved to the fs from wpt
app.use(express.static(path.join(__dirname, 'public')));


//map the routes
app.use('/', info);
app.use('/suite_config', suiteConfig);
app.use('/run_tests', runTests);
app.use('/tests', tests);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.json({
      error_message: err.message,
      error: err.stack
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    error_message: err.message,
    error: {}
  });
});

/*
 * A method to start the test cron rolling
 * called by the bin/www when the server starts
 * to listen.
 */
app.startTests = function () {
  //read in the config
  var testConfig = jf.readFileSync(process.env.SUITE_CONFIG);

  //start the testing loop
  testConfig.testSuites.forEach(function(testSuite){
    var url = 'http://localhost:' + app.get('port') + '/run_tests/' + testSuite.suiteId;
    var interval = testSuite.runEvery * 60 * 1000;
    debug('Setting test run for ' + url + ' every ' + testSuite.runEvery + ' minutes');
    setInterval(function(){
      debug('running scheduled test')
      request(url);
    }, interval);
    //and run it once to start
    request(url);
  });
};

module.exports = app;
