var extname = require('path').extname;
var fs = require('fs');

// filter for use with Connect
var exports = module.exports = function(viewTypes){
    return function(req, res, next){
        exports.update(res, viewTypes);
        next();
    };
};

exports.update = function(res,viewTypes){

    ///// default response settings /////
    res._quip_headers = {'Content-Type': 'text/html'};
    res._quip_status = 200;

    ///// private helper methods /////
    var withStatus = function(code){
        return function(data){
            return data ? res.status(code).send(data):
                          res.status(code);
        };
    };
    var redirection = function(code, message){
        return function(loc){
            res._quip_headers.Location = loc;
            return res.status(code).send(
                '<html>' +
                    '<head>' +
                        '<title>' + code + ' ' + message + '</title>' +
                    '</head>' +
                    '<body>' +
                        '<p>' +
                            message + ': ' +
                            '<a href="' + loc + '">' + loc + '</a>' +
                        '</p>' +
                    '</body>' +
                '</html>'
            );
        };
    }
    var withType = function(type){
        return function(data){
            res.headers({'Content-Type': type});
            return data ? res.send(data): res;
        }
    };

    ///// exported methods /////
    res.status = function(code){
        res._quip_status = code;
        return res;
    };
    res.headers = function(headers){
        for(var k in headers) res._quip_headers[k] = headers[k];
        return res;
    };

    // success
    res.ok = withStatus(200);
    res.created = withStatus(201);
    res.accepted = withStatus(202);

    // redirection
    res.moved = redirection(301, 'Moved Permanently');
    res.redirect = redirection(302, 'Found');
    res.found = res.redirect;
    res.notModified = function(){res.status(304).send();};

    // client error
    res.badRequest = withStatus(400);
    res.unauthorized = withStatus(401);
    res.forbidden = withStatus(403);
    res.notFound = withStatus(404);
    res.notAllowed = withStatus(405);
    res.conflict = withStatus(409);
    res.gone = withStatus(410);

    // server error
    res.error = withStatus(500, 'error');

    // mime types
    res.text = withType('text/plain');
    res.plain = res.text;
    res.html = withType('text/html');
    res.xhtml = withType('application/xhtml+xml');
    res.css = withType('text/css');
    res.xml = withType('text/xml');
    res.atom = withType('application/atom+xml');
    res.rss = withType('application/rss+xml');
    res.javascript = withType('text/javascript');
    res.json = withType('application/json');

    // JSONP is a special case that should always respond with a 200,
    // there is no reliable way to reveive a JSONP result on the
    // client-side if the HTTP status-code is not 200!
    res.jsonp = function(callback, data){
        if(typeof data == 'object') data = JSON.stringify(data);
        data = callback + '(' + data + ');';
        return res.ok().javascript(data);
    };

    // respond with given data using current header and status code
    res.send = function(data){
        if(res._quip_headers['Content-Type'] == 'application/json'){
            if(typeof data == 'object') data = JSON.stringify(data);
        }
        res.writeHead(res._quip_status, res._quip_headers);
        if(data) res.write(data);
        res.end();
        return null;
    };

res.loadView = function(path) {
  return fs.readFileSync(path, 'utf8');
}

res.viewTypes = viewTypes;

/**
 * Render `view` partial with the given `options`.
 *
 * Options:
 *   - `object` Single object with name derived from the view (unless `as` is present) 
 *
 *   - `as` Variable name for each `collection` value, defaults to the view name.
 *     * as: 'something' will add the `something` local variable
 *     * as: this will use the collection value as the template context
 *     * as: global will merge the collection value's properties with `locals`
 *
 *   - `collection` Array of objects, the name is derived from the view name itself. 
 *     For example _video.html_ will have a object _video_ available to it.
 *
 * @param  {String} view
 * @param  {Object|Array} options or collection
 * @return {String}
 * @api public
 */

res.partial = function(view, options, ext){
    // Inherit parent view extension when not present
    if (ext && view.indexOf('.') < 0) {
        view += ext;
    }

    // Allow collection to be passed as second param
    if (Array.isArray(options)) {
        options = { collection: options };
    }

    // Defaults
    options = options || {};
    options.locals = options.locals || {};
    options.partial = true;
    options.layout = false;

    // Collection support
    var collection = options.collection;
    if (collection) {
        var name = options.as || view.split('.')[0],
            len = collection.length;
        delete options.collection;
        options.locals.collectionLength = len;
        return collection.map(function(val, i){
            options.locals.firstInCollection = i === 0;
            options.locals.indexInCollection = i;
            options.locals.lastInCollection = i === len - 1;
            options.object = val;
            return this.partial(view, options);
        }, this).join('');
    } else {
        if (options.object) {
            var name = options.as || view.split('.')[0];
            if (typeof name === 'string') {
                options.locals[name] = options.object;
            } else if (name === global) {
                utils.merge(options.locals, options.object);
            } else {
                options.scope = options.object;
            }
        }
        return this.render(view, options);
    }
};

/**
 * Render `view` with the given `options` and optional callback `fn`.
 * When a callback function is given a response will _not_ be made
 * automatically, however otherwise a response of _200_ and _text/html_ is given.
 *
 * Options:
 *  
 *  Most engines accept one or more of the following options,
 *  both _haml_ and _jade_ accept all:
 *
 *  - `scope`     Template evaluation context (the value of `this`)
 *  - `locals`    Object containing local variables
 *  - `debug`     Output debugging information
 *  - `status`    Response status code, defaults to 200
 *  - `headers`   Response headers object
 *
 * @param  {String} view
 * @param  {Object|Function} options or callback function
 * @param  {Function} fn
 * @api public
 */

res.render = function(view, options, fn){
    // Support callback function as second arg
    if (typeof options === 'function') {
        fn = options, options = {};
    }
    
    var options = options || {}

    // Support "view engine" setting
    if (view.indexOf('.') < 0 && defaultEngine) {
        view += '.' + defaultEngine;
    }

    // Defaults
    var self = this,
        root =  process.cwd() + '/views',
        ext = extname(view),
        partial = options.partial,
        layout = options.layout === undefined ? true : options.layout,
        layout = layout === true
            ? 'layout' + ext
            : layout;

    // Allow layout name without extension
    if (typeof layout === 'string' && layout.indexOf('.') < 0) {
        layout += ext;
    }

    // Partials support
    if (options.partial) {
        root = root + '/partials';
    }

    // View path
    var path = view[0] === '/'
        ? view
        : root + '/' + view;

    // Pass filename to the engine and view
    options.locals = options.locals || {};
    options.locals.__filename = options.filename = path;

    // Always expose partial() as a local
    options.locals.partial = function(view, options){
        return self.partial.call(self, view, options, ext);
    };
    
    // Merge view helpers
    //options.locals.__proto__ = helpers;

    function error(err) {
        if (fn) {
            fn(err);
        } else {
            //self.req.next(err);
        }
    }

    var str = res.loadView(path);

    // Cache template engine exports
    var engine = viewTypes[ext] || (viewTypes[ext] = require(ext.substr(1)));

    // Attempt render
    try {
        var str = engine.render(str, options);
    } catch (err) {
        return error(err);
    }

    // Layout support
    if (layout) {
        options.layout = false;
        options.locals.body = str;
        options.isLayout = true;
        self.render(layout, options, fn);
    } else if (partial) {
        return str;
    } else if (fn) {
        fn(null, str);
    } else {
        self.send(str, options.headers, options.status);
    }

};


    return res;

};
