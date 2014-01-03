'use strict';

var $ = require('jquery');
var request = require('request');
var util = require("util");
var events = require("events");
var child_process = require('child_process');

var config = require("pouclaige-configuration-processor").configurationProcessor,
    assertParserConfiguration,
    assertOptionsConfiguration,
    assertConfiguration;

var flowInspector = require("flow-inspector"),
    Task = flowInspector.Task,
    TaskAggregator = flowInspector.TaskAggregator;

var configuration = require('./' + process.argv[2]);

assertParserConfiguration = config.expectArrayEach(config.expectSchema({
    name: config.expectString(),
    selector: config.expectOptional(config.expectString()),
    callback: config.expectOptional(config.expectFunction())
}));

assertOptionsConfiguration = config.expectSchema({
    urlList: config.expectString(),
    urlRowSelector: config.expectString(),
    baseUrl: config.expectOptional(config.expectString())
})

assertConfiguration = config.expectSchema({
    preParsers: assertParserConfiguration,
    postParsers: assertParserConfiguration,
    options: assertOptionsConfiguration
});

var options = assertConfiguration(configuration);

function Crawler(options) {
    this.init(options);
};

util.inherits(Crawler, events.EventEmitter);

Crawler.prototype.init = function(options) {
    this.options = options;
    this.preParsers = [];
    this.postParsers = [];
    this.parsedOffers = 0;

    this.on("on-offers-list-ready", this.onOfferListReady);
};

Crawler.prototype.addPreParser = function(parser) {
    this.preParsers.push(parser);
};

Crawler.prototype.addPostParser = function(parser) {
    this.postParsers.push(parser);
};

Crawler.prototype.updateParser = function(parserGroup, parser) {
    // ...
};

Crawler.prototype.removeParser = function(parserGroup, name) {
    // ...
};

Crawler.prototype.runParser = function(offer, parser, $item) {
    if (parser.selector) {
        $item = $(parser.selector, $item);
    }

    if (parser.callback) {
        return parser.callback(offer, this.options, $item);
    } else {
        return $item.text().trim();
    }
};

Crawler.prototype.runPreParsers = function(offer, $item) {
    for (var i = 0; i < this.preParsers.length; i++) {
        offer[this.preParsers[i].name] = this.runParser(offer, this.preParsers[i], $item);
    }
};

Crawler.prototype.runPostParsers = function(offer, $item) {
    for (var i = 0; i < this.postParsers.length; i++) {
        offer[this.postParsers[i].name] = this.runParser(offer, this.postParsers[i], $item);
    }
};

Crawler.prototype.crawlOffer = function(offers, offer) {
    var itself = this;
    var task = new Task();

    task.start();

    request({
        url: offer['url'],
        pool: { maxSockets: 10000 }
    }, function (error, response, body) {
        if (error || 200 !== response.statusCode) {
            return void task.fail(error);
        }

        task.done({
            body: body,
            response: response,
        });
    });

    task.onceDone(function(evt){
        itself.runPostParsers(offer, $(evt.body));
        itself.emit("offer-ready", offer);
    });

    return task;
};

Crawler.prototype.onOfferListReady = function(offers) {
    var i,
        itself = this,
        offersTask = new Task(),
        offersAggregator = new TaskAggregator();

    offersTask.start();

    for (i = 0; i < offers.length; i += 1) {
        offersAggregator.add(this.crawlOffer(offers, offers[i]));
    }

    offersAggregator.onceEveryDone(offersTask.done.bind(offersTask));
    offersTask.onceDone(function(evt){
        itself.emit("offers-ready", offers);
    });
};

Crawler.prototype.run = function() {
    var itself = this,
        offersTask = new Task();

    offersTask.start();

    request(itself.options.urlList, function (error, response, body) {
        if (error || 200 !== response.statusCode) {
            return void offersTask.fail(error);
        }

        offersTask.done({
            body: body,
            response: response,
        });
    });

    offersTask.onceDone(function(evt){
        var items = $(itself.options.urlRowSelector, evt.body),
            offers = [];

        for (var i = 0; i < items.length; i++) {
            var offer = {}
            itself.runPreParsers(offer, $(items[i]))
            offers.push(offer);
        }

        itself.emit("on-offers-list-ready", offers);
    });
};

var crawler = new Crawler(configuration.options)
    .on("offers-ready", function (offers) {
        process.send({
            command: 'retreive-list',
            data: offers
        });

        process.exit(0);
    })
    .on("offer-ready", function (offer) {
        process.send({
            command: 'retreive-single',
            data: offer
        });
    });

for (var i = 0; i < configuration.preParsers.length; i++) {
    crawler.addPreParser(configuration.preParsers[i]);
};

for (var i = 0; i < configuration.postParsers.length; i++) {
    crawler.addPostParser(configuration.postParsers[i]);
};

process.on('message', function(message) {
    switch (message.command) {
        case 'retreive-list': {
            crawler.run();
        }; break;
        case 'retreive-single': {
        }; break
    };
});

// http://www.warbud.pl/pl/kariera/dla-profesjonalistow/aktualne-oferty-pracy
