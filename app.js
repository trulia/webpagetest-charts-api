/*
 * Defines routes and the test running cron/setInterval
 */

const express = require("express");
const path = require("path");
const logger = require("morgan");
const compress = require("compression");
const jf = require("jsonfile");
const request = require("request");
const debug = require("debug")("wpt-api:app");

//route handlers
const info = require("./routes/info");
const suiteConfig = require("./routes/suite_config");
const runTests = require("./routes/run_tests");
const tests = require("./routes/tests");

const app = express();

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

app.use(logger("dev"));
app.use(compress());

//used to serve saved assets saved to the fs from wpt
app.use(express.static(path.join(__dirname, "public")));

//map the routes
app.use("/", info);
app.use("/suite_config", suiteConfig);
app.use("/run_tests", runTests);
app.use("/tests", tests);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// development error handler
// will print stacktrace
if (app.get("env") === "development") {
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
app.startTests = function() {
  //read in the config
  const testConfig = jf.readFileSync(process.env.SUITE_CONFIG);

  //start the testing loop
  testConfig.testSuites.forEach(function(testSuite) {
    const url =
      "http://localhost:" + app.get("port") + "/run_tests/" + testSuite.suiteId;
    const interval = testSuite.runEvery * 60 * 1000;
    debug(
      "Setting test run for " +
        url +
        " every " +
        testSuite.runEvery +
        " minutes"
    );
    setInterval(function(scheduledTest) {
      debug("running scheduled test");
      request(scheduledTest);
    }, interval, url);
    //and run it once to start
    request(url);
  });
};

module.exports = app;
