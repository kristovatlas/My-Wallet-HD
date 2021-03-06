module.exports = function(karma) {

  var configuration = {
    basePath : './',

    frameworks: ['jasmine', 'browserify'],

    browsers : ['Chrome'], //'PhantomJS'],

    customLaunchers: {
      Chrome_travis_ci: {
        base: 'Chrome',
        flags: ['--no-sandbox']
      }
    },

    browserNoActivityTimeout: 60000,

    // reportSlowerThan: 50,

    client: {
      captureConsole: true
    },

    autoWatch: true,

    // logLevel: karma.LOG_DEBUG,

    reporters: ['progress','coverage'],

    coverageReporter: {
      type : 'html',
      dir : 'coverage/',
      subdir: '.'
    },

    preprocessors: {
      'tests/**/*.coffee' : ['browserify']
    },

    browserify: {
      configure: function(bundle) {
        bundle.once('prebundle', function() {
          bundle.transform('coffeeify');
          bundle.transform('browserify-istanbul');
          bundle.plugin('proxyquireify/plugin');
        });
      },
      debug: true
    },

    coffeePreprocessor: {
      // options passed to the coffee compiler
      options: {
        bare: true,
        sourceMap: true
      },
      // transforming the filenames
      transformPath: function(path) {
        return path.replace(/\.coffee$/, '.js');
      }
    },
    
    files: [
      'src/shared.js',
      // 'tests/**/*.coffee',
      // Or specify individual test files:
      'tests/mocks/*.coffee',
      'tests/wallet_spender_spec.js.coffee', // Throws a timeout if you put this at the end of the list
      'tests/blockchain_api_spec.js.coffee',
      'tests/claim_redeem_spec.js.coffee',
      'tests/legacy_addresses_spec.js.coffee',
      'tests/tags_spec.js.coffee',
      'tests/transaction_spec.js.coffee',
      'tests/transaction_spend_spec.js.coffee',
      'tests/my_wallet_spec.js.coffee', // This seems to leave some global state around, see below:
      'tests/wallet_spec.js.coffee', // Throws an error unless my_wallet_spec runs first (bad...)
      'tests/bip38_spec.js.coffee',
      'tests/hd_account_spec.js.coffee',
      'tests/hdwallet_spec.js.coffee'
    ]
  };

  if(process.env.TRAVIS) {
    configuration.browsers = ['Chrome_travis_ci'];
  }

  karma.set(configuration);
};
