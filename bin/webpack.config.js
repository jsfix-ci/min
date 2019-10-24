const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');
const log = require('./log');
const { name } = require('../package');

module.exports = function(env, configPath, minPath) {
  let config = env({
    entry: path.resolve('./app.js'),
    resolveLoader: {
      alias: {
        [name]: path.resolve(__dirname, '../lib'),
      },
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        [name]: path.resolve(__dirname, '../lib'),
      },
    },
    module: {
      rules: [
        {
          test: /[\\/]routes\.js$/,
          exclude: /node_modules|min[\\/]lib/,
          use: `${name}/loader`,
        },
        {
          test: /\.(ts|js)x?$/,
          exclude: /node_modules/,
          use: ['babel-loader'],
        },
      ],
    },
    plugins: [],
  });

  // merge project config
  let projectConfig;
  try {
    const p = path.resolve(process.cwd(), configPath);
    projectConfig = require(p);
    log.info(`found webpack config: ${p}`);
  } catch (e) {
    log.error(e);
  }
  if (typeof projectConfig === 'function') {
    config = projectConfig(config);
  } else if (typeof projectConfig === 'object') {
    config = merge(config, projectConfig);
  } else {
    throw new Error('invalid webpack.config.js, forget to export your config?');
  }

  // load min config
  let minConfig = {};
  try {
    const p = path.resolve(process.cwd(), minPath);
    minConfig = require(p);
    log.info(`found min config: ${p}`);
  } catch (e) {
    log.error(e);
  }
  if (typeof minConfig !== 'object') {
    throw new Error('invalid min.config.js, forget to export your config?');
  }

  // log config, generate log constants
  let logConfig = minConfig.log;
  global.__LOG__ = false;
  global.__LOG_ENDPOINT__ = null;
  global.__LOG_FILE__ = null;
  if (logConfig !== false) {
    if (typeof logConfig != 'object') {
      logConfig = {};
    }
    global.__LOG__ = true;
    global.__LOG_ENDPOINT__ = logConfig.endpoint || '/__log__';
    global.__LOG_FILE__ = logConfig.file;

    const endpoint = global.__LOG_ENDPOINT__;
    const file = global.__LOG_FILE__;
    log.info(
      `log enabled: endpoint=${endpoint}, ${file ? 'file=' + file : 'console'}`,
    );
  }

  // hack __LOG_STUB__ for server
  require('register-module')({
    name: '__LOG_STUB__',
    path: path.resolve(__dirname, '../lib/log'),
    main: 'server.js',
  });

  // for SSR
  const nodeConfig = merge(config, {
    name: 'node',
    target: 'node',
    externals: {
      react: 'react',
      'react-dom': 'react-dom',
      __LOG_STUB__: '__LOG_STUB__',
    },
    output: {
      filename: 'ssr.js',
      path: path.resolve('./dist'),
      libraryTarget: 'umd',
    },
    plugins: [
      // disable code splitting
      // https://medium.com/@glennreyes/how-to-disable-code-splitting-in-webpack-1c0b1754a3c5
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 1,
      }),
    ],
  });

  // for browser
  const browserConfig = merge(config, {
    name: 'browser',
    resolve: {
      alias: {
        __LOG_STUB__: path.resolve(__dirname, '../lib/log/browser'),
      },
    },
    output: {
      filename: 'index.js',
      chunkFilename: '[hash:5].[chunkhash:5].chunk.js',
      publicPath: '/__min-static__/',
      path: path.resolve('./dist/__min-static__'),
    },
    plugins: [
      new webpack.DefinePlugin({
        __LOG__,
        __LOG_ENDPOINT__: `"${__LOG_ENDPOINT__}"`,
      }),
    ],
  });

  return [nodeConfig, browserConfig];
};
