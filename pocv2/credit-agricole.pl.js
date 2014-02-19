'use strict';

var $ = require('cheerio');

exports.options = {
    urlList: {
        url: "https://kariera.credit-agricole.pl/oferty/oferty,send,1,praktyki,1?page={PAGE}",
        startPage: 1,
        isNextPage: function (options, body, items) {
            return 20 === items.length;
        }
    },
    urlRowSelector: "#career_list > div",
};

exports.preParsers = [{
    name: "company_id",
    value: "787"
}, {
    name: "title",
    selector: ".job a",
}, {
    name: "apply_url",
    selector: ".apply a",
    callback: function (offer, options, $item) {
        var url = $item.attr('href');

        if (false === /^https?:\/\//gi.test(url) && options.baseUrl) {
            return options.baseUrl + url;
        }

        return url;
    }
}, {
    name: "url",
    selector: ".job a",
    callback: function (offer, options, $item) {
        var url = $item.attr('href');

        if (false === /^https?:\/\//gi.test(url) && options.baseUrl) {
            return options.baseUrl + url;
        }

        return url;
    }
}, {
    name: "city",
    selector: ".city"
}];

exports.postParsers = [{
    name: "content",
    selector: ".career-offer-wrapper",
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
        $item.find(".career-offer-header, .career-apply-btn, .career-offer-nav, .career-footer, .close-offer").remove();

        // console.log($item.html());
        $item.find("strong, b").each(function (index, element) {
            var $element = $(element),
                text = $element.text().trim();
            if ("Odpowiedzialność" === text || "Odpowiedzialność:" === text ||
                "Oczekiwany profil" === text || "Oczekiwany profil:" === text ||
                "Poszukiwany profil" === text || "Poszukiwany profil:" === text ||
                "Główne zadania" === text || "Główne zadania:" === text ||
                "Profil kandydata" === text || "Profil kandydata:" === text ||
                "Oczekiwanyprofil" === text || "Oczekiwanyprofil:" === text ||
                "Oferujemy" === text || "Oferujemy:" === text) {

                if ($element.closest("p").length && $element.closest("p") &&
                    $element.closest("p").text().trim() === text) {
                    $element.closest("p").addClass("title");
                } else {
                    $element.replaceWith("<p class=\"title\">" + text + "</p>");
                }
            }
        });

        $item.find("p, div, strong, b, span").each(function (index, element) {
            var $element = $(element);
            if ("" === $element.text().trim()) {
                $element.remove();
            }
        });

        var replaced = true;
        var div = $item.find("div")[0];
        $item.find("div > p").each(function (index, element) {
            if ($(element).find(".title").length) {
                div = element;
            }
        });

        while (replaced) {
            replaced = false;

            for (var i = 0; i < div.children.length; i++) {
                if ("text" === div.children[i].type && "" === $(div.children[i]).text().trim()) {
                    $(div.children[i]).remove();
                    replaced = true;
                } else if ("tag" === div.children[i].type) {
                    if ((i + 2) <= div.children.length &&
                        "br" === div.children[i].name &&
                        div.children[i + 1] && "tag" === div.children[i + 1].type &&
                        div.children[i + 2] && "tag" === div.children[i + 2].type &&
                        "br" === div.children[i + 1].name &&
                        "br" === div.children[i + 2].name) {
                        $(div.children[i]).remove();
                        replaced = true;
                    } else if ((i + 1) <= div.children.length &&
                        "br" === div.children[i].name &&
                        div.children[i + 1] && "tag" === div.children[i + 1].type &&
                        "p" === div.children[i + 1].name) {
                        $(div.children[i]).remove();
                        replaced = true;
                    } else if ((i + 1) <= div.children.length && "p" === div.children[i].name) {
                        if (div.children[i + 1] && "tag" === div.children[i + 1].type && "br" === div.children[i + 1].name) {
                            $(div.children[i + 1]).remove();
                            replaced = true;
                        }
                        if (div.children[i - 1] && "tag" === div.children[i - 1].type && "br" === div.children[i - 1].name) {
                            $(div.children[i - 1]).remove();
                            replaced = true;
                        }
                    }
                }
            }
        }
        return $item.html().trim();
    }
}];
