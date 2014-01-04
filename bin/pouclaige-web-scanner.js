#!/usr/bin/env node

/**
 * @license Copyright (c) 2014 Pouclaige
 * For licensing, see LICENSE
 */

"use strict";

var Supervisor = require(__dirname + "/../node_libs/pouclaige-web-scanner/Supervisor.js"),
    supervisor = new Supervisor();

supervisor.run(process.argv.slice(2));
