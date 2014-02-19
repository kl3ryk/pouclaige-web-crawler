"use strict";

var $ = require("cheerio");
var request = require("request");
var util = require("util");
var events = require("events");
var Sequelize = require("sequelize");
var natural = require("natural");
var sanitizeHtml = require("sanitize-html");
var phantom = require("node-phantom-simple");

var config = require("pouclaige-configuration-processor").configurationProcessor;
var assertParserConfiguration,
    assertOptionsConfiguration,
    assertConfiguration,
    paginatedUrlConfiguration;

var flowInspector = require("pouclaige-flow-inspector");
var Task = flowInspector.Task,
    TaskAggregator = flowInspector.TaskAggregator;

var configuration = require("./" + process.argv[2]);

assertParserConfiguration = config.expectArrayEach(config.expectSchema({
    name: config.expectString(),
    selector: config.expectOptional(config.expectString()),
    callback: config.expectOptional(config.expectFunction())
}));

paginatedUrlConfiguration = config.expectSchema({
    url: config.expectString(),
    isNextPage: config.expectOptional(config.expectFunction()),
    startPage: config.expectOptional(config.expectInt())
});

assertOptionsConfiguration = config.expectSchema({
    urlList: config.expectGroupOr([
        config.expectString(),
        paginatedUrlConfiguration,
        config.expectArrayEach(config.expectGroupOr([
            config.expectString(),
            paginatedUrlConfiguration
        ]))
    ]),
    callback: config.expectOptional(config.expectFunction()),
    urlRowSelector: config.expectString(),
    baseUrl: config.expectOptional(config.expectString()),
    baseApplyUrl: config.expectOptional(config.expectString()),
    pool: config.expectOptional(config.expectInt()),
    phantom: config.expectBooleanDefault(false)
});

assertConfiguration = config.expectSchema({
    preParsers: assertParserConfiguration,
    postParsers: assertParserConfiguration,
    options: assertOptionsConfiguration
});

var options = assertConfiguration(configuration);

if (options.maxSockets) {
    require("http").globalAgent.maxSockets = options.maxSockets;
}

function Crawler(options) {
    this.init(options);
}

util.inherits(Crawler, events.EventEmitter);

Crawler.prototype.init = function (options) {
    this.options = options;
    this.preParsers = [];
    this.postParsers = [];
    this.parsedOffers = 0;

    this.on("on-offers-list-ready", this.onOfferListReady);
};

Crawler.prototype.addPreParser = function (parser) {
    this.preParsers.push(parser);
};

Crawler.prototype.addPostParser = function (parser) {
    this.postParsers.push(parser);
};

Crawler.prototype.runParser = function (offer, parser, $item) {
    if (parser.selector) {
        $item = $(parser.selector, $item);
    }

    if (parser.value) {
        return parser.value;
    }
    if (parser.callback) {
        return parser.callback(offer, this.options, $item);
    } else {
        return $item.text().trim();
    }
};

Crawler.prototype.runPreParsers = function (offer, $item) {
    var i;

    for (i = 0; i < this.preParsers.length; i++) {
        offer[this.preParsers[i].name] = this.runParser(offer, this.preParsers[i], $item);
    }
};

Crawler.prototype.runPostParsers = function (offer, $item) {
    var i;

    for (i = 0; i < this.postParsers.length; i++) {
        offer[this.postParsers[i].name] = this.runParser(offer, this.postParsers[i], $item);
    }
};

Crawler.prototype.crawlOffer = function (offers, offer) {
    var itself = this;
    var task = new Task();

    task.start();

    if (this.options.phantom) {
        itself.phantom.createPage(function (task, err, page) {
            return page.open(offer.url, function ( /*status*/ ) {
                page.get("content", function (err, content) {
                    console.log("offer done");
                    task.done({
                        body: content
                    });

                    page.close();
                });
            });
        }.bind(null, task));
    } else {
        request({
            url: offer.url,
            pool: {
                maxSockets: 10000
            }
        }, function (error, response, body) {
            if (response.headers["content-type"] === "application/pdf") {
                body = null;
            }

            if (error || response.statusCode !== 200) {
                console.log("[!] Crawler.prototype.crawlOffer error:");
                console.log(error);
                return void task.fail(error);
            }

            task.done({
                body: body,
                response: response
            });
        });
    }

    task.onceDone(function (evt) {
        itself.runPostParsers(offer, $(evt.body, {
            normalizeWhitespace: true,
            lowerCaseTags: true
        }));
        itself.emit("offer-ready", offer);
    });

    return task;
};

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
    offersTask.onceDone(function ( /*evt*/ ) {
        itself.emit("offers-ready", offers);
    });
};

Crawler.prototype.crawlOfferList = function (urlObject, page) {
    var itself = this,
        offersTask = new Task(),
        url = urlObject.url || urlObject,
        requestUrl = url.replace("{PAGE}", page);

    offersTask.start();

    if (this.options.phantom) {
        itself.phantom.createPage(function (offersTask, err, page) {
            return page.open(requestUrl, function ( /*status*/ ) {
                page.get("content", function (err, content) {
                    var body = content;
                    console.log("offer list done");
                    if (itself.options.callback) {
                        body = itself.options.callback(itself.options, body);
                    }

                    offersTask.done({
                        body: content
                    });

                    page.close();
                });
            });
        }.bind(null, offersTask));
    } else {
        request(requestUrl, function (offersTask, error, response, body) {

            if (error || response.statusCode !== 200) {
                console.log("[!] Crawler.prototype.run error:");
                console.log(error);
                return void offersTask.fail(error);
            }

            if (itself.options.callback) {
                body = itself.options.callback(itself.options, body);
            }

            offersTask.done({
                body: body,
                response: response
            });
        }.bind(null, offersTask));
    }

    offersTask.onceDone(function (evt) {
        var items = $(itself.options.urlRowSelector, evt.body, {
            normalizeWhitespace: true,
            lowerCaseTags: true
        }),
            offers = [],
            i;

        for (i = 0; i < 10 /*items.length*/ ; i++) {
            var offer = {};
            itself.runPreParsers(offer, $(items[i]));
            offers.push(offer);
        }

        // isPaginated
        var isNextPage = urlObject.isNextPage ?
            urlObject.isNextPage(evt.body, itself.options, items) :
            items.length > 0;

        if (/{PAGE}/gi.test(url) && isNextPage) {
            itself.crawlOfferList(urlObject, ++page);
        }

        itself.emit("on-offers-list-ready", offers);
    });

    return offersTask;
};

Crawler.prototype.run = function () {
    var urlList = this.options.urlList,
        startPage = 0,
        j = 0,
        itself = this;

    if (!Array.isArray(urlList)) {
        urlList = [urlList];
    }

    if (this.options.phantom) {
        phantom.create(function (err, ph) {
            console.log("phanotm created");
            itself.phantom = ph;

            for (j = 0; j < urlList.length; j++) {
                startPage = urlList[j].startPage || 0;
                itself.crawlOfferList(urlList[j], startPage);
            }
        });
    } else {
        for (j = 0; j < urlList.length; j++) {
            startPage = urlList[j].startPage || 0;
            this.crawlOfferList(urlList[j], startPage);
        }
    }
};

var crawler = new Crawler(configuration.options)
    .on("offer-ready", function (offer) {
        process.send({
            command: "retreive-single",
            data: offer
        });
    });

var parserOffset = 0;
for (parserOffset = 0; parserOffset < configuration.preParsers.length; parserOffset++) {
    crawler.addPreParser(configuration.preParsers[parserOffset]);
}

for (parserOffset = 0; parserOffset < configuration.postParsers.length; parserOffset++) {
    crawler.addPostParser(configuration.postParsers[parserOffset]);
}

var sequelize = new Sequelize("xxx", "xxx", "xxx", {
    dialect: "mysql",
    port: 3306,
    host: "xxx",
    logging: false
});

function normalizePhrase(phrase) {
    phrase = phrase.toLowerCase();
    return phrase.replace(/[ -]*/gim, "");
}

function normalizeWithPhrases(text, phrases) {
    text = text.toLowerCase();
    for (var i = 0; i < phrases.length; i++) {
        var newPhrase = normalizePhrase(phrases[i].keyword);
        text = text.replace(phrases[i].keyword.toLowerCase(), newPhrase);
    }

    return text;
}

crawler.addPostParser({
    name: "email",
    callback: function (offer /*, options, $item*/ ) {
        var re = /(?:(?:[^<>()[\]\\.,;:\s@\"]+(?:\.[^<>()[\]\\.,;:\s@\"]+)*)|(?:\".+\"))@(?:(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(?:(?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;
        var offerText = $(offer.content).text();
        var email = offerText.match(re);

        if (email && email.length > 0) {
            return email[0];
        } else {
            return null;
        }
    }
});

crawler.addPostParser({
    name: "description",
    callback: function (offer, options /*, $item*/ ) {
        var allowedTags = ["a", "ul", "li", "p", "b", "strong", "br"];

        if (options.allowedTags) {
            allowedTags = options.allowedTags;
        }

        return sanitizeHtml(offer.description, {
            allowedTags: allowedTags,
            allowedAttributes: {
                "a": ["href", "target", "rel"],
                "p": ["class"]
            },
            transformTags: {
                "h1": sanitizeHtml.simpleTransform("p", {
                    class: "title"
                }),
                "h2": sanitizeHtml.simpleTransform("p", {
                    class: "title"
                }),
                "h3": sanitizeHtml.simpleTransform("p", {
                    class: "title"
                }),
                "h4": sanitizeHtml.simpleTransform("p", {
                    class: "title"
                }),
                "h5": sanitizeHtml.simpleTransform("p", {
                    class: "title"
                }),
                "h6": sanitizeHtml.simpleTransform("p", {
                    class: "title"
                }),
                "a": sanitizeHtml.simpleTransform("a", {
                    target: "_blank",
                    rel: "nofollow"
                }),
                "ol": "ul",
                "dir": "ul"
            }
        }).trim();
    }
});

sequelize
    .authenticate()
    .complete(function (err) {
        if (err) {
            console.log("Unable to connect to the database:", err);
            return;
        }

        sequelize
            .query("SELECT id, type, value, trim(keyword) as keyword, trim(`return`) as `return`, virtual FROM crawler_phrases UNION SELECT id, \"city\" as type, state_id as value, name as keyword, null as `return`, 0 as virtual FROM cities UNION SELECT id, \"city\" as type, id as value, name as keyword, null as `return`, 1 as virtual FROM states")
            .success(function (unnormalizedPhrases) {
                var types = {};

                for (var j = 0; j < unnormalizedPhrases.length; j++) {
                    if (!types[unnormalizedPhrases[j].type]) {
                        types[unnormalizedPhrases[j].type] = {};
                    }

                    if (!types[unnormalizedPhrases[j].type][unnormalizedPhrases[j].value]) {
                        types[unnormalizedPhrases[j].type][unnormalizedPhrases[j].value] = [];
                    }

                    types[unnormalizedPhrases[j].type][unnormalizedPhrases[j].value].push(unnormalizedPhrases[j]);
                }

                crawler.addPostParser({
                    name: "accept",
                    callback: function (offer /*, options, $item*/ ) {
                        var accepted = false,
                            rejected = false,
                            i = 0;

                        if (offer.description.length < 50) {
                            return false;
                        }

                        var normalizedTitle = normalizeWithPhrases(offer.title, types.accept[0].concat(types.accept[1]));

                        var trie = new natural.Trie(false);
                        trie.addStrings(new natural
                            .StemmerPl()
                            .tokenizeAndStem(normalizedTitle));

                        for (i = 0; i < types.accept[1].length; i++) {
                            // get synonyms for phrase
                            accepted = trie.contains(normalizePhrase(types.accept[1][i].keyword));

                            if (accepted) {
                                break;
                            }
                        }

                        for (i = 0; i < types.accept[0].length; i++) {
                            // get synonyms for phrase
                            rejected = trie.contains(normalizePhrase(types.accept[0][i].keyword));

                            if (rejected) {
                                break;
                            }
                        }

                        if (!accepted && rejected) {
                            return false;
                        } else {
                            return true;
                        }
                    }
                });

                crawler.addPostParser({
                    name: "type",
                    callback: function (offer /*, options, $item*/ ) {
                        // var acceptRegexp = new RegExp("(?=[^A-Za-z\\u0100—\\u017F\\u0180—\\u024F])(" + types.type[0].join("|") + ")(?=[^A-Za-z\\u0100—\\u017F\\u0180—\\u024F])", "gi");
                        var normalizedTitle = normalizeWithPhrases(offer.title, types.type[0]);

                        var trie = new natural.Trie(false);
                        trie.addStrings(new natural
                            .StemmerPl()
                            .tokenizeAndStem(normalizedTitle));

                        for (var i = 0; i < types.type[0].length; i++) {
                            // get synonyms for phrase
                            if (trie.contains(normalizePhrase(types.type[0][i].keyword))) {
                                return true;
                            }
                        }

                        return false;
                    }
                });

                crawler.addPostParser({
                    name: "department",
                    callback: function (offer /*, options, $item*/ ) {
                        var result = {},
                            phrases = [],
                            key;

                        if (!offer.content) {
                            return null;
                        }

                        for (key in types.department) {
                            phrases = phrases.concat(types.department[key]);
                        }

                        var offerText = $(offer.content).text();
                        var offerTextNormalized = normalizeWithPhrases(offerText, phrases);
                        var contentTrie = new natural.Trie(false);
                        contentTrie.addStrings(new natural
                            .StemmerPl()
                            .tokenizeAndStem(offerTextNormalized));

                        for (key in types.department) {
                            if (!types.department.hasOwnProperty(key)) {
                                continue;
                            }

                            var matches = [];
                            for (var i = 0; i < types.department[key].length; i++) {
                                var phrase = types.department[key][i];

                                // get synonyms for phrase
                                if (contentTrie.contains(normalizePhrase(phrase.keyword))) {
                                    matches.push(phrase.keyword);
                                }
                            }

                            if (matches.length >= 1) {
                                result[key] = matches;
                            }
                        }

                        // for (var key in types.department) {
                        //     if (!types.department.hasOwnProperty(key)) {
                        //         continue;
                        //     }

                        //     var regexp = new RegExp("(?=[^A-Za-z\\u0100—\\u017F\\u0180—\\u024F])(" + types["department"][key].join("|") + ")(?=[^A-Za-z\\u0100—\\u017F\\u0180—\\u024F])", "gi");
                        //     var matches = offer.content.match(regexp);

                        //     if (matches && matches.length >= 3) {
                        //         result[key] = matches;
                        //     }
                        // }

                        return result;
                    }
                });

                crawler.addPostParser({
                    name: "city",
                    callback: function (offer /*, options, $item*/ ) {
                        var result = {},
                            subject = "",
                            key;

                        if (offer.city) {
                            subject = subject.concat(offer.city);
                        }

                        if (offer.voivodship) {
                            subject = subject.concat(" ", offer.voivodship);
                        }

                        if (!subject && !offer.content) {
                            return null;
                        } else if (!subject) {
                            subject = $(offer.content).text();
                        }

                        var phrases = [];
                        for (key in types.city) {
                            phrases = phrases.concat(types.city[key]);
                        }

                        var subjectNormalized = normalizeWithPhrases(subject, phrases);
                        // console.log("Search location in %s (normalized:%s)", subject, subjectNormalized);
                        var subjectTrie = new natural.Trie(false);
                        subjectTrie.addStrings(new natural
                            .StemmerPl()
                            .tokenizeAndStem(subjectNormalized));

                        var removeDuplicates = function (elem, pos, self) {
                            if (!elem) {
                                return elem;
                            }
                            return self.indexOf(elem) === pos;
                        };

                        for (key in types.city) {
                            if (!types.city.hasOwnProperty(key)) {
                                continue;
                            }

                            var matches = [];
                            for (var i = 0; i < types.city[key].length; i++) {
                                var phrase = types.city[key][i];
                                var normalizedKeyword = normalizePhrase(phrase.keyword);

                                if (subjectTrie.contains(normalizedKeyword) || normalizedKeyword === subjectNormalized) {
                                    if (!phrase.virtual) {
                                        matches.push(phrase.
                                            return ?phrase.
                                            return :phrase.keyword);
                                    } else {
                                        matches.push("");
                                    }
                                }
                            }

                            if (matches.length > 0) {
                                matches = matches.filter(removeDuplicates);
                                result[key] = matches;
                            }
                        }

                        return result;
                    }
                });

                crawler.run();
            })
            .failure(function (e) {
                console.log(e);
            });
    });
