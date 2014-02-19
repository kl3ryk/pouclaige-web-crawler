/* jshint node: true */
"use strict";

var fork = require("child_process").fork;
var Sequelize = require("sequelize");
var slug = require("slug");

function Supervisor(options) {
    this.options = options;
    this.sequelize = new Sequelize("xxx", "xxx", "xxxx", {
        dialect: "mysql",
        port: 3306,
        host: "xxx",
        logging: false
    });
}

Supervisor.prototype.insertToDB = function (tableName, data, callback) {
    var sql = "INSERT INTO " + tableName;
    var columns = [];
    var values = [];
    var sqlValues = [];

    var Page = this.sequelize.define("page", {}, {
        timestamps: false,
        underscored: true
    });

    Page.__factory = {
        autoIncrementField: "id"
    };
    Page.id = "";

    for (var key in data) {
        columns.push(key);
        values.push(data[key]);
        sqlValues.push("?");
    }

    sql += " (" + columns.join(",") + ") VALUES (" + sqlValues.join(",") + ")";

    this.sequelize.query(sql, Page, {
        raw: false
    }, values)
        .success(function (info) {
            console.log(info.id);
            if (callback) {
                callback(info);
            }
        })
        .failure(function (err) {
            console.log(err);
        });
};

Supervisor.prototype.updateOfferAfterInsert = function (dbOffer, offer, info) {
    var titleSlug = slug(dbOffer.title + " " + info.id, {
        charmap: slug.charmap,
    }).toLowerCase().replace(/[^a-z0-9-]/gi, "");

    for (var key in offer.department) {
        if (offer.department[key].length >= 3) {
            var offerDepartement = {
                offer_id: info.id,
                branch_id: key
            };

            this.insertToDB("branches_offers", offerDepartement);
        }
    }

    this.sequelize.query("UPDATE offers SET slug = ? WHERE id = ?", null, {
        raw: true
    }, [titleSlug, info.id])
        .success(function (info) {
            console.log(info);
        })
        .failure(function (err) {
            console.log(err);
        });
};

Supervisor.prototype.insertOfferToDB = function (offer) {
    for (var state in offer.city) {
        console.log("state: %d", state);
        var dbOffer = {};
        dbOffer.company_id = offer.company_id;
        dbOffer.status = 2;
        dbOffer.work_type = offer.type ? 2 : 1;
        dbOffer.duration = 35;
        dbOffer.email = offer.email || null;
        dbOffer.source = "crawler";
        dbOffer.oid = offer.url;
        dbOffer.title = offer.title;
        dbOffer.ref = offer.ref || null;
        dbOffer.start = dbOffer.created = dbOffer.sort_date = new Date();

        dbOffer.offer_url = offer.url;
        dbOffer.application_url = offer.apply_url || offer.url;
        dbOffer.notification = offer.email ? 0 : 1;
        dbOffer.notification_type = 0;

        var finish = new Date();
        finish.setDate(finish.getDate() + 30);
        dbOffer.finish = finish;
        dbOffer.state_id = state;
        dbOffer.city = offer.city[state].join(", ");
        dbOffer.description = offer.description;
        this.insertToDB("offers", dbOffer, this.updateOfferAfterInsert.bind(null, dbOffer, offer));
        console.log("insertOfferToDB");
    }
};

Supervisor.prototype.insertOffer = function (offer) {
    // insert into crawler_offers
    var crawlerOffer = {};

    crawlerOffer.type = offer.type ? 2 : 1;
    crawlerOffer.department = JSON.stringify(offer.department);
    crawlerOffer.localization = JSON.stringify(offer.city);
    crawlerOffer.title = offer.title;
    crawlerOffer.url = offer.url;
    crawlerOffer.company_id = offer.company_id;

    crawlerOffer.filled = 1;
    crawlerOffer.added = 0;
    crawlerOffer.changed = 0;
    crawlerOffer.accepted = 0;
    crawlerOffer.apply_url = offer.apply_url || offer.url;

    if (!offer.accept) {
        console.log("[!] Not accepted");
    } else {
        crawlerOffer.accepted = 1;
    }

    if (!offer.city || Object.keys(offer.city).length <= 0) {
        crawlerOffer.filled = 0;
        console.log("[!] Brak localization");
    }

    var getCountFilteredByCount = function (items, minCount) {
        var result = 0;

        for (var key in items) {
            if (items[key].length >= minCount) {
                result++;
            }
        }

        return result;
    };

    if (getCountFilteredByCount(offer.department, 3) <= 0) {
        console.log("[!] Brak department");
    }

    if (crawlerOffer.accepted && crawlerOffer.filled) {
        console.log("cities");
        console.log(offer.city);
        crawlerOffer.added = 1;
        this.insertOfferToDB(offer);
    }
    this.insertToDB("crawler_offers", crawlerOffer);

    console.log("accepted: %d, filled: %d", crawlerOffer.accepted, crawlerOffer.filled);
};

Supervisor.prototype.parseMessage = function (proc, message) {
    var itself = this;
    if (Object.prototype.toString.call(message) === "[object Object]") {
        switch (message.command) {
        case "retreive-list":
            {
                console.log("[+] Child process (%s) send a items list of size %d", proc.name, message.data.length);
            }
            break;
        case "retreive-single":
            {

                itself.sequelize
                    .authenticate()
                    .complete(function (err) {
                        if ( !! err) {
                            console.log("Unable to connect to the database:", err);
                            return;
                        }

                        itself.sequelize
                            .query(
                                "SELECT (SELECT count(*) FROM offers WHERE oid = :url) AS offerCount, (SELECT count(*) FROM crawler_offers WHERE url = :url) AS crawelerOffersCount",
                                null, {
                                    raw: true
                                }, {
                                    url: message.data.url
                                })
                            .success(function (count) {
                                var key;
                                count = count[0];

                                // if (false) {
                                if (count.offerCount || count.crawelerOffersCount) {
                                    console.log("[!] Offer skipped offerCount:crawelerOffersCount = %d:%d", count.offerCount, count.crawelerOffersCount);
                                    console.log(message.data.url + "\n");
                                    return;
                                } else {
                                    console.log("[+] Child process (%s) send a signle item with name %s", proc.name, message.data.title);
                                    console.log(" |-url:%s", message.data.url);
                                    console.log(" |-company_id: %d", message.data.company_id);
                                    console.log(" |-accepted: %s", message.data.accept);
                                    console.log(" |-email: %s", message.data.email);
                                    console.log(" |-type(intern): %s", message.data.type);
                                    console.log(" |-department: ");

                                    for (key in message.data.department) {
                                        console.log(" |----%s:%s", key, message.data.department[key].join(","));
                                    }
                                    console.log(" |");
                                    console.log(" |-city: ");

                                    for (key in message.data.city) {
                                        console.log(" |----%s:%s", key, message.data.city[key].join(","));
                                    }

                                    console.log(" |-insert to db if correct");
                                }

                                itself.insertOffer(message.data);

                                console.log("");
                            });
                    }).failure(function (e) {
                        console.log(e);
                    });
            }
            break;
        }
    } else {
        console.log("[+] Child process (%s) send message: %s", proc.name, message);
    }
};

Supervisor.prototype.run = function () {
    var tmpList = [
        "plugins/selgros.pl.js",
        "plugins/credit-agricole.pl.js",
    ];

    for (var i = 0; i < tmpList.length; i++) {
        var proc = fork("Crawler.js", [tmpList[i]])
            .on("error", this.onProcessError)
            .on("exit", this.onProcessExit)
            .on("close", this.onProcessClose)
            .on("disconnect", this.onProcessDisconnect)
            .on("message", this.onProcessMessage.bind(null, this));
        proc.name = tmpList[i];
    }
};

Supervisor.prototype.onProcessExit = function (code, signal) {
    console.log("[+] Child process (%s) exited with code(%s) and signal(%s)", this.name, code, signal);
};

Supervisor.prototype.onProcessClose = function (code, signal) {
    console.log("[+] Child process (%s) closed with code(%s) and signal(%s)", this.name, code, signal);
};

Supervisor.prototype.onProcessDisconnect = function () {
    console.log("[+] Child process (%s) was disconnected", this.name);
};

// @todo resolve problem with binding
Supervisor.prototype.onProcessMessage = function (supervisor, message) {
    supervisor.parseMessage(this, message);
};

Supervisor.prototype.onProcessError = function ( /*err*/ ) {
    console.error("[!] An error occured in child process (%s)", this.name);
};

module.exports = Supervisor;
