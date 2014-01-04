/**
 * @license Copyright (c) 2014 Pouclaige
 * For licensing, see LICENSE
 */

"use strict";

exports.options = {
    urlList: "http://www.selgros.pl/oferty-pracy",
    urlRowSelector: ".job_offert tbody tr",
    baseUrl: "http://www.selgros.pl"
};

exports.preParsers = [
    {
        name: "title",
        selector: "td:nth(0) a",
    },
    {
        name: "url",
        selector: "td:nth(0) a",
        callback: function(offer, options, $item) {
            var url = $item.attr('href');

            if (options.baseUrl) {
                return options.baseUrl + url;
            }

            return url;
        }
    },
    {
        name: "finish",
        selector: "td:nth(1)",
    },
    {
        name: "city",
        selector: "td:nth(2)",
    }
];

exports.postParsers = [
    {
        name: "content",
        selector: "#sv-vacancy",
        callback: function(offer, options, $item) {
            return $item.html().trim();
        }
    },
    {
        name: "accept",
        callback: function(offer, options, $item) {
            if (/\b(specjalista|manager)\b/gi.exec(offer.title)){
                return false;
            } else {
                return true;
            }
        }
    }
];
