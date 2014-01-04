/**
 * @license Copyright (c) 2014 Pouclaige
 * For licensing, see LICENSE
 */

"use strict";

var $ = require("jquery"),
    assertConfiguration,
    assertOptionsConfiguration,
    assertParserConfiguration,
    config = require("pouclaige-configuration-processor").configurationProcessor,
    configuration = require(process.argv[2]),
    crawler,
    Crawler, // public, constructor
    events = require("events"),
    flowInspector = require("flow-inspector"),
    i,
    request = require("request"),
    Task = flowInspector.Task,
    TaskAggregator = flowInspector.TaskAggregator,
    util = require("util");

assertParserConfiguration = config.expectArrayEach(config.expectSchema({
    name: config.expectString(),
    selector: config.expectOptional(config.expectString()),
    callback: config.expectOptional(config.expectFunction())
}));

assertOptionsConfiguration = config.expectSchema({
    urlList: config.expectString(),
    urlRowSelector: config.expectString(),
    baseUrl: config.expectOptional(config.expectString())
});

assertConfiguration = config.expectSchema({
    preParsers: assertParserConfiguration,
    postParsers: assertParserConfiguration,
    options: assertOptionsConfiguration
});

/**
 * @auguments {events/EventEmiiter}
 * @constructor
 * @param {object} options
 */
Crawler = function (options) {
    this.init(options);
};
util.inherits(Crawler, events.EventEmitter);

/**
 * @param {object} options
 * @return {void}
 */
Crawler.prototype.init = function (options) {
    this.options = options;
    this.preParsers = [];
    this.postParsers = [];
    this.parsedOffers = 0;

    this.on("on-offers-list-ready", this.onOfferListReady);
};

/**
 * @param {object} parser
 * @return {void}
 */
Crawler.prototype.addPreParser = function (parser) {
    this.preParsers.push(parser);
};

/**
 * @param {object} parser
 * @return {void}
 */
Crawler.prototype.addPostParser = function (parser) {
    this.postParsers.push(parser);
};

/**
 * @param {array} parserGroup
 * @param {object} parser
 * @return {void}
 */
Crawler.prototype.updateParser = function (parserGroup, parser) {
    // ...
};

/**
 * @param {array} parserGroup
 * @param {object} parser
 * @return {void}
 */
Crawler.prototype.removeParser = function (parserGroup, name) {
    // ...
};

/**
 * @param {object} offer
 * @param {object} parser
 * @param {object} $item
 * @return {void}
 */
Crawler.prototype.runParser = function (offer, parser, $item) {
    if (parser.selector) {
        $item = $(parser.selector, $item);
    }

    if (parser.callback) {
        return parser.callback(offer, this.options, $item);
    } else {
        return $item.text().trim();
    }
};

/**
 * @param {object} offer
 * @param {object} $item
 * @return {void}
 */
Crawler.prototype.runPreParsers = function (offer, $item) {
    for (var i = 0; i < this.preParsers.length; i++) {
        offer[this.preParsers[i].name] = this.runParser(offer, this.preParsers[i], $item);
    }
};

/**
 * @param {object} offer
 * @param {object} $item
 * @return {void}
 */
Crawler.prototype.runPostParsers = function (offer, $item) {
    var i;

    for (i = 0; i < this.postParsers.length; i++) {
        offer[this.postParsers[i].name] = this.runParser(offer, this.postParsers[i], $item);
    }
};

/**
 * @param {array} offers
 * @param {object} offer
 * @return {void}
 */
Crawler.prototype.crawlOffer = function (offers, offer) {
    var itself = this,
        task = new Task();

    task.start();

    request({
        url: offer.url,
        pool: {
            maxSockets: 10000
        }
    }, function (error, response, body) {
        if (error || 200 !== response.statusCode) {
            return void task.fail(error);
        }

        task.done({
            body: body,
            response: response,
        });
    });

    task.onceDone(function (evt) {
        itself.runPostParsers(offer, $(evt.body));
        itself.emit("offer-ready", offer);
    });

    return task;
};

/**
 * @param {array} offers
 * @return {void}
 */
Crawler.prototype.onOfferListReady = function (offers) {
    var i,
        itself = this,
        offersTask = new Task(),
        offersAggregator = new TaskAggregator();

    offersTask.start();

    for (i = 0; i < offers.length; i += 1) {
        offersAggregator.add(this.crawlOffer(offers, offers[i]));
    }

    offersAggregator.onceEveryDone(offersTask.done.bind(offersTask));
    offersTask.onceDone(function (evt) {
        itself.emit("offers-ready", offers);
    });
};

/**
 * @return {void}
 */
Crawler.prototype.run = function () {
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

    offersTask.onceDone(function (evt) {
        var i,
            items = $(itself.options.urlRowSelector, evt.body),
            offer,
            offers = [];

        for (i = 0; i < items.length; i++) {
            offer = {};
            itself.runPreParsers(offer, $(items[i]));
            offers.push(offer);
        }

        itself.emit("on-offers-list-ready", offers);
    });
};

crawler = new Crawler(configuration.options)
    .on("offers-ready", function (offers) {
        process.send({
            command: "retreive-list",
            data: offers
        });

        process.exit(0);
    })
    .on("offer-ready", function (offer) {
        process.send({
            command: "retreive-single",
            data: offer
        });
    });

for (i = 0; i < configuration.preParsers.length; i++) {
    crawler.addPreParser(configuration.preParsers[i]);
}

for (i = 0; i < configuration.postParsers.length; i++) {
    crawler.addPostParser(configuration.postParsers[i]);
}

process.on("message", function (message) {
    switch (message.command) {
    case "retreive-list":
        crawler.run();
        break;
    case "retreive-single":
        break;
    }
});

// http://www.warbud.pl/pl/kariera/dla-profesjonalistow/aktualne-oferty-pracy
