# WebPagetest Charts API
[WebPagetest](http://www.webpagetest.org/) Rules. There are tools that are easier to use, but nothing that lets you
really see deeply into the browser side of things. But there's no easy way to compare results over time.
So this is a small express application that runs tests, stores them, and offers endpoints to access the
data. It assumes that you'll want to look at a variety of charts for your data, so the
following datapoints are available:

- SpeedIndex: Google's special score.  It's an excellent
summtion of how Google will see your site, and a great
numerical indicator for how fast your site feels to
visitors. Read the  [SpeedIndex docs](https://sites.google.com/a/webpagetest.org/docs/using-webpagetest/metrics/speed-index)  for more info
- loadTime: How long (ms) to load the critical page content
- fullyLoaded: How long (ms) to fully load all the page content
- ~~requests: how many requests are made when loading the page~~ (needs update for new API response)
- TTFB: time to the first byte recieved, rumored to be the most important for SEO
- visualComplete: Time (ms) until the page is done changing visually
- Lighthouse Suite: [Lighthouse](https://developers.google.com/web/tools/lighthouse/) tracks a lot of metrics, the ones WepageTest expsoses are:
  - Performance
  - Performance.speed-index-metric
  - Performance.first-meaningful-paint
  - Performance.estimated-input-latency
  - Performance.first-interactive
  - Performance.consistently-interactive
  - BestPractices
  - Accessibility
  - SEO
  - ProgressiveWebApp


It also keeps links to
the full WebPagetest results for deeper introspection. You can build a UI on
this API. A working example is https://github.com/trulia/webpagetest-charts-ui. Visit that repo to see screenshots of what it can display.

And none of this would have happened without [marcelduran](https://github.com/marcelduran) and his
[webpagetest-api](https://github.com/marcelduran/webpagetest-api)
module which made the data side of this very easy to prototype quickly.

## How It Works
In this repo, there's no database: just the file system. (The data storage logic is its own
module, so it could be replaced with something else, mongo, etc. PRs welcome!) The app saves results into
`public/results/<test-suite-name>/<test-name>/<yyyy-mm-dd-hh-mm-ss/` directories
containing the json results from the test.

The endpoints then serve this data up in chartable summaries, as well as specific
datapoints. The available endpoints are served from the `/` url of the api.


## Installation

1. clone this repo

1. Create a json config file with your test suites. See 'Test Suite Config' below.

1. Decide if you want to use the filesystem to store your data (default),
or a database. The Filesystem works well, but can get slow if there are
lots of data points.  If you want to use a database:
  1. Create a postgres/mysql/sqlite table with the schema (postgres shown, datapoint_id needs to be an auto increment column.):

    ```sql
    CREATE TABLE webpagetestcharts (
  	  test_results text  NOT NULL,
  	  date timestamp without time zone  NOT NULL,
  	  suite_id text  NOT NULL,
  	  test_id text  NOT NULL,
  	  datapoint_id integer DEFAULT nextval('id_seq'::regclass) NOT NULL
    );
    ```

  1. Edit the file `data_store/index.js` to require the correct interface (`db`).
  1. Edit the connection string in `data_store/db.js` to connect to the database.
  1. In `package.json`, update the `any-db-*` database module to reference
  the correct db type (postgres is the default).

1. do an `npm install`

1. Run the server with: `SUITE_CONFIG=/your/wpt-api/config-file.json npm start`. You MUST specify a `SUITE_CONFIG` otherwise you'll get an error when the app starts.

1. Visit the host/port the application is running on.  By default this will be http://localhost:3001 to get a list of available endpoints.

Note: The tests take a
few minutes to run, so there might not be much to see initially. And please don't
spam WPT with requests, if you are constantly
restarting the server, you may be sending
lots of tests to your API key.

If things get weird You can get into debug mode by adding `DEBUG='wpt-api*'` to your startup command.

Or specify just the module you're debugging for less verbosity.
Building a service on top of a module that talks to a service can get weird sometimes,
so there's lots of debugging.

Once everything is working well wrap it up in [forever](https://www.npmjs.com/package/forever) or [pm2](https://www.npmjs.com/package/pm2) or whatever you want to keep it up and running.  For example, the forever command
should look like:

```
SUITE_CONFIG=config.json forever start bin/www
```

## Test Suite Config
The json file is the only file needed for this app to run the way you want it to. The trickiest
idea here is the 'parentPage' concept. Often you want to test a page that's in an ever changing
list (eg: users with the most photos), or isn't persistent (eg: search results on temporal objects). For those
cases you define the page that has your list, and give a selector to get the link that actually
should be tested.

Sometimes WebPagetest struggles, sometimes your site struggles. Sometimes for the sake
of the chart, you need to ignore outliers. You can specify a data range and date range
in your config and those results will be ignored in the chart
(though you can choose to show them)


Here is a annotated sample. Note that these comments are not valid json, so it's not
cut and pasteable.  A usable test version is in the repo under example_config.json

```JavaScript
{
  // you'll need one of these
  "wptApiKey": "get one from http://www.webpagetest.org/getkey.php",

  // A Suite is a collection of urls under a theme.
  // e.g.: User Profiles.
  "testSuites":[
    {
      // The title of the suite, used in links in the UI
      "suiteDisplayName": "Mobile User Profiles",

      // used in urls and in the file system (`[\w\-]` only please)
      "suiteId": "user_profiles",

      // nice to tell people what's happening
      "desc": "This suite runs on a Motorola G phone using Chrome in Dulles, VA over 3G data",

      // minutes
      "runEvery": 120,

      // the host for the suite's urls
      "testHost": "http://example.com/",

      // this magic string comes from WPT via the locations command:
      // https://github.com/marcelduran/webpagetest-api
      "location": "Dulles_MotoG:Motorola G - Chrome",

      // if you want to specify a user agent when making the request
      // for a parentPage (eg: a mobile device).
      "parentRequestUserAgent": "",

      // if you want to pass data along in the query string for each test
      // handy for turning features on and off to compare
      "queryStringData": {},

      // config for the chart data basedon the chart type
      // helps keep the default chart view sane sometimes if
      // there are occasional outliers (eg: speedindex 9999999)
      // that can skew the chart display. I recommend skipping this
      // bit initially until you better know your data.
      "chartConfig" : [
        {
          // the type of chart these settings apply to
          "type" : "SpeedIndex",
          // the lo/hi values to give to the chart
          "dataRange": [0, 8000],
          // how many days of datapoints to return
          "dateCutoff": 30
        }
      ],

      // the array of urls to test.  you can give it normal urls as
      // well as urls to get urls from (eg: to get the first result from a search)
      "testPages": [
        {
          // nice to read
          "testDisplayName": "Test User Profile",

          // used in urls and in the file system (`[\w\-]` only please)
          "testId": "publicProfile",

          // url to test using the host above.  
          "path": "/profile/testUser"

          // tests can have their own host if they need to override the suite
          // eg, our pages vs. our competitors pages.
          "testHost": "http://example.org/"
        },
        {

          // Nice to read
          "testDisplayName": "Most Popular User Profile",

          // used in urls and in the file system (`[\w\-]` only please)
          "testId": "mostPopularUser",

          // The path that holds the url that will ultimately be tested
          "parentPath": "/search/profiles/popular",

          // the selector to get the item that has the href to be tested.
          // The first match will be used. What goes here is wrapped in `$()`
          "parentHrefSelector": ".userResult"
        }
      ]
    }
  ]
}
  ```

## Contributing
PRs are Happily Accepted! The preferred PR method is:

1. Fork this repo
2. Create a feature branch on your fork
3. code things
4. PR your feature branch to this master
5. We'll check out your PR, test, code review and when it's ready merge it in.

If you have a larger idea, feel free to bring it up in an issue first.  Please
note that this project is released with a Contributor Code of Conduct. By
participating in this project you agree to abide by its terms.

## Todo
1. Package into something npm installable
1. Allow a custom directory for data, as opposed to `public/results`
1. Let the config do more around configuring the tests.
1. Refactor config to be less confusing (each test a file in the config directory?)
