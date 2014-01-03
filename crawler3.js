exports.options = {
    urlList: "http://marketdino.startpraca.pl/offers/centrala/",
    urlRowSelector: ".job_offers tr:nth-child(n+2)",
    baseUrl: "http://marketdino.startpraca.pl"
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
        name: "voivodship",
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
        selector: "#content_www",
        callback: function(offer, options, $item) {
            return $item.html().trim();
        }
    }
];
