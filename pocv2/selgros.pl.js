'use strict';

var $ = require('cheerio');

exports.options = {
    urlList: "http://www.selgros.pl/oferty-pracy",
    urlRowSelector: ".job_offert tbody tr",
    baseUrl: "http://www.selgros.pl"
};

exports.preParsers = [{
    name: "company_id",
    value: "1131"
}, {
    name: "title",
    selector: "td:nth-child(1) a",
}, {
    name: "url",
    selector: "td:nth-child(1) a",
    callback: function (offer, options, $item) {
        var url = $item.attr('href');

        if (false === /^https?:\/\//gi.test(url) && options.baseUrl) {
            return options.baseUrl + url;
        }

        return url;
    }
}, {
    name: "finish",
    selector: "td:nth-child(2)",
}, {
    name: "city",
    selector: "td:nth-child(3)",
    callback: function (offer, options, $item) {
        var city = $item.text().trim();

        if ("centrala" === city.toLowerCase()) {
            return "Poznań";
        } else {
            return city;
        }
    }
}];

exports.postParsers = [{
    name: "ref",
    selector: ".ref",
    callback: function (offer, options, $item) {
        var ref = $item.text().trim();
        if (!ref) {
            return null;
        } else {
            return ref;
        }
    }
}, {
    name: "content",
    selector: "#sv-vacancy",
    callback: function (offer, options, $item) {
        return $item.html().trim();
    }
}, {
    name: "description",
    callback: function (offer, options, $item) {
        if (!offer.content) {
            return null;
        }

        $item = $("<div>" + offer.content + "</div>");
        $item.find('p, div, h2').each(function (index, element) {
            var $element = $(element);
            if ("" === $element.text().trim()) {
                $element.remove();
            }
        });
        $item.find(".sv-rel").remove();
        $item.find(".sv-bluebox").remove();
        $item.find(".sv-rel").remove();

        return $item.html().trim();
    }
}];
