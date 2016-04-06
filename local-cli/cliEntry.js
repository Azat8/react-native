/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
'use strict';

const bundle = require('./bundle/bundle');
const childProcess = require('child_process');
const Config = require('./util/Config');
const defaultConfig = require('./default.config');
const dependencies = require('./dependencies/dependencies');
const generate = require('./generate/generate');
const library = require('./library/library');
const link = require('./rnpm/link/src/link');
const parseCommandLine = require('./util/parseCommandLine');
const path = require('path');
const Promise = require('promise');
const runAndroid = require('./runAndroid/runAndroid');
const logAndroid = require('./logAndroid/logAndroid');
const runIOS = require('./runIOS/runIOS');
const logIOS = require('./logIOS/logIOS');
const server = require('./server/server');
const TerminalAdapter = require('yeoman-environment/lib/adapter.js');
const yeoman = require('yeoman-environment');
const unbundle = require('./bundle/unbundle');
const upgrade = require('./upgrade/upgrade');
const version = require('./version/version');

const fs = require('fs');
const gracefulFs = require('graceful-fs');

// Just a helper to proxy 'react-native link' to rnpm
const linkWrapper = (args, config) => {
  const rnpmConfig = require('./rnpm/core/src/config');
  return new Promise((resolve, reject) => {
    link(rnpmConfig, args.slice(1)).then(resolve, reject);
  });
}

// graceful-fs helps on getting an error when we run out of file
// descriptors. When that happens it will enqueue the operation and retry it.
gracefulFs.gracefulify(fs);

const documentedCommands = {
  'start': [server, 'starts the webserver'],
  'bundle': [bundle, 'builds the javascript bundle for offline use'],
  'unbundle': [unbundle, 'builds javascript as "unbundle" for offline use'],
  'new-library': [library, 'generates a native library bridge'],
  'android': [generateWrapper, 'generates an Android project for your app'],
  'run-android': [runAndroid, 'builds your app and starts it on a connected Android emulator or device'],
  'log-android': [logAndroid, 'print Android logs'],
  'run-ios': [runIOS, 'builds your app and starts it on iOS simulator'],
  'log-ios': [logIOS, 'print iOS logs'],
  'upgrade': [upgrade, 'upgrade your app\'s template files to the latest version; run this after ' +
                       'updating the react-native version in your package.json and running npm install'],
  'link': [linkWrapper, 'link a library'],
};

const exportedCommands = {dependencies: dependencies};
Object.keys(documentedCommands).forEach(function(command) {
  exportedCommands[command] = documentedCommands[command][0];
});

const undocumentedCommands = {
  '--version': [version, ''],
  'init': [printInitWarning, ''],
};

const commands = Object.assign({}, documentedCommands, undocumentedCommands);

/**
 * Parses the command line and runs a command of the CLI.
 */
function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
  }

  const setupEnvScript = /^win/.test(process.platform)
    ? 'setup_env.bat'
    : 'setup_env.sh';
  childProcess.execFileSync(path.join(__dirname, setupEnvScript));

  const command = commands[args[0]];
  if (!command) {
    console.error('Command `%s` unrecognized', args[0]);
    printUsage();
    return;
  }

  const cliArgs = parseCommandLine([{
    command: 'config',
    default: '',
    type: 'string',
    description: 'Path to CLI configuration file',
  }]);

  let configPath = cliArgs.config;
  let cwd = process.cwd();

  // If the config is not passed, find it
  if (!configPath) {
    configPath = Config.findConfigPath(__dirname);
    cwd = __dirname;
  }

  // Get the config
  const config = Config.get(cwd, configPath, defaultConfig);

  command[0](args, config).done();
}

function generateWrapper(args, config) {
  return generate([
    '--platform', 'android',
    '--project-path', process.cwd(),
    '--project-name', JSON.parse(
      fs.readFileSync('package.json', 'utf8')
    ).name
  ], config);
}

function printUsage() {
  console.log([
    'Usage: react-native <command>',
    '',
    'Commands:'
  ].concat(Object.keys(documentedCommands).map(function(name) {
    return '  - ' + name + ': ' + documentedCommands[name][1];
  })).join('\n'));
  process.exit(1);
}

// The user should never get here because projects are inited by
// using `react-native-cli` from outside a project directory.
function printInitWarning() {
  return Promise.resolve().then(function() {
    console.log([
      'Looks like React Native project already exists in the current',
      'folder. Run this command from a different folder or remove node_modules/react-native'
    ].join('\n'));
    process.exit(1);
  });
}

class CreateSuppressingTerminalAdapter extends TerminalAdapter {
  constructor() {
    super();
    // suppress 'create' output generated by yeoman
    this.log.create = function() {};
  }
}

/**
 * Creates the template for a React Native project given the provided
 * parameters:
 *   - projectDir: templates will be copied here.
 *   - argsOrName: project name or full list of custom arguments to pass to the
 *                 generator.
 */
function init(projectDir, argsOrName) {
  console.log('Setting up new React Native app in ' + projectDir);
  const env = yeoman.createEnv(
    undefined,
    undefined,
    new CreateSuppressingTerminalAdapter()
  );

  env.register(
    require.resolve(path.join(__dirname, 'generator')),
    'react:app'
  );

  // argv is for instance
  // ['node', 'react-native', 'init', 'AwesomeApp', '--verbose']
  // args should be ['AwesomeApp', '--verbose']
  const args = Array.isArray(argsOrName)
    ? argsOrName
    : [argsOrName].concat(process.argv.slice(4));

  const generator = env.create('react:app', {args: args});
  generator.destinationRoot(projectDir);
  generator.run();
}

module.exports = {
  run: run,
  init: init,
  commands: exportedCommands
};
