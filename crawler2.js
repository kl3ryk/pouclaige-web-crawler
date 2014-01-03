exports.options = {
    urlList: "http://www.auchan.pl/praca/lista-ofert-pracy",
    urlRowSelector: ".offers tr:nth-child(n+2)",
    baseUrl: "http://www.auchan.pl"
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
        selector: "td:nth(2)",
    },
    {
        name: "city",
        selector: "td:nth(1)",
    }
];

exports.postParsers = [
    {
        name: "content",
        selector: "#job-box",
        callback: function(offer, options, $item) {
        	if ($item.length) {
            	return $item.html().trim();
            } else {
            	return null;
            }
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
