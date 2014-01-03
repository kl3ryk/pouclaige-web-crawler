'use strict';

var fork = require('child_process').fork;
var util = require('util');
var _ = require('underscore');

function Supervisor(options) {
    this.options = options;
};

Supervisor.prototype.retreiveSingle = function(proc, items) {
    for (var i = 0; i < items.length; i++) {
        proc.send({
            command: 'retreive-single',
            data: items[i]
        });
    };
};

Supervisor.prototype.parseMessage = function(proc, message) {
    if (_.isObject(message)) {
        switch (message.command) {
            case 'retreive-list': {
                console.log('[+] Child process (%s) send a items list of size %d', proc.name, message.data.length);
                // this.retreiveSingle(proc, message.data)
            }; break;
            case 'retreive-single': {
                console.log('[+] Child process (%s) send a signle item with name %s, accepted: %s', proc.name, message.data.title, message.data.accept);
            }; break
        };
    } else {
        console.log('[+] Child process (%s) send message: %s', proc.name, message);
    }
};

Supervisor.prototype.run = function() {
    var tmpList = ['crawler3.js', 'crawler2.js', 'crawler1.js'],
        itself = this;

    for (var i = 0; i < tmpList.length; i++) {
        var proc = fork('Crawler.js', [tmpList[i]])
            .on('error', function(err) {
                console.error('[!] An error occured in child process (%s)', this.name);
            })
            .on('exit', function(code, signal) {
                console.log('[+] Child process (%s) exited with code(%s) and signal(%s)', this.name, code, signal);
            })
            .on('close', function(code, signal) {
                console.log('[+] Child process (%s) closed with code(%s) and signal(%s)', this.name, code, signal);
            })
            .on('disconnect', function() {
                console.log('[+] Child process (%s) was disconnected', this.name);
            })
            .on('message', function(message) {
                itself.parseMessage(this, message);
            });
        proc.name = tmpList[i];
        proc.send({
            command: 'retreive-list'
        });
    };
};

module.exports = Supervisor;
