/**
 * @license Copyright (c) 2014 Pouclaige
 * For licensing, see LICENSE
 */

"use strict";

var _ = require("underscore"),
    fork = require("child_process").fork,
    onChildProcessClose, // private, function
    onChildProcessDisconnect, // private, function
    onChildProcessError, // private, function
    onChildProcessExit, // private, function
    onChildProcessMessage, // private, function
    parseMessage, // private, function
    path = require("path"),
    Supervisor; // public, constructor

/**
 * @access private
 * @param {number} code
 * @param {string} signal
 * @return {void}
 * @this {child_process/ChildProcess}
 */
onChildProcessClose = function (code, signal) {
    console.log("[+] Child process (%s) closed with code(%s) and signal(%s)", this.name, code, signal);
};

/**
 * @access private
 * @param {string} message
 * @return {void}
 * @this {child_process/ChildProcess}
 */
onChildProcessDisconnect = function () {
    console.log("[+] Child process (%s) was disconnected", this.name);
};

/**
 * @access private
 * @param {object} message
 * @return {void}
 * @this {child_process/ChildProcess}
 */
onChildProcessError = function (err) {
    console.error("[!] An error occured in child process (%s)", this.name);
};

/**
 * @access private
 * @param {string} message
 * @return {void}
 * @this {child_process/ChildProcess}
 */
onChildProcessExit = function (code, signal) {
    console.log("[+] Child process (%s) exited with code(%s) and signal(%s)", this.name, code, signal);
};

/**
 * @access private
 * @param {string} message
 * @return {void}
 * @this {child_process/ChildProcess}
 */
onChildProcessMessage = function (message) {
    parseMessage(this, message);
};

/**
 * @access private
 * @param {child_process/ChildProcess} proc
 * @param {string} message
 * @return {void}
 */
parseMessage = function (proc, message) {
    if (_.isObject(message)) {
        switch (message.command) {
        case "retreive-list":
            console.log("[+] Child process (%s) send a items list of size %d", proc.name, message.data.length);
            // this.retreiveSingle(proc, message.data)
            break;
        case "retreive-single":
            console.log("[+] Child process (%s) send a signle item with name %s, accepted: %s", proc.name, message.data.title, message.data.accept);
            break;
        }
    } else {
        console.log("[+] Child process (%s) send message: %s", proc.name, message);
    }
};

/**
 * @constructor
 * @param {object} options
 */
Supervisor = function (options) {
    this.options = options;
};

/**
 * @param {child_process/ChildProcess} proc
 * @param {array} items
 * @return {void}
 */
Supervisor.prototype.retreiveSingle = function (proc, items) {
    var i;

    for (i = 0; i < items.length; i++) {
        proc.send({
            command: "retreive-single",
            data: items[i]
        });
    }
};

/**
 * @param {array} crawlerPluginFiles
 * @return {void}
 */
Supervisor.prototype.run = function (crawlerPluginFiles) {
    var i,
        proc,
        procArgs;

    for (i = 0; i < crawlerPluginFiles.length; i++) {
        procArgs = [
            path.resolve(crawlerPluginFiles[i])
        ];

        proc = fork(path.join(__dirname, "CrawlerProcess.js"), procArgs)
            .on("error", onChildProcessError)
            .on("exit", onChildProcessExit)
            .on("close", onChildProcessClose)
            .on("disconnect", onChildProcessDisconnect)
            .on("message", onChildProcessMessage);

        proc.name = crawlerPluginFiles[i];
        proc.send({
            command: "retreive-list"
        });
    }
};

module.exports = Supervisor;
