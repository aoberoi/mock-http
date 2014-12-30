'use strict';

/**
 * @module lib/Request
 * @copyright 2014- commenthol
 * @license MIT
 */

var util = require('util');
var Readable = require('streamss-shim').Readable;
var assign = require('./assign');
var pluck = require('./pluck');

/**
 * Mock implementation of Class http.IncomingMessage
 *
 * It behaves like the class, apart from really handling a socket. I.e. it implements the Readable Stream Class as well.
 * All methods can be used to mock a client request on the server such allowing to unit-test e.g. connect middleware
 *
 * @constructor
 * @see http://nodejs.org/api/http.html#http_http_incomingmessage
 * @param {Object} [options] - options object
 * @param {Number} options.highWaterMark - highWaterMark for Readable Stream
 * @param {String} options.url - internal Server URL of the request (should start with "/")
 * @param {String} options.method - HTTP method (GET|POST|PUT|DELETE|HEAD|...)
 * @param {Object} options.headers - HTTP-header object
 * @param {Buffer} options.buffer - buffer to send as Readable Stream, e.g. for POST-requests
 * @param {Number} options.emitClose - emit `close` event after sending num bytes
 * @return {Stream.Readable} Readable Stream
 */
function Request(options) {
	var self = this;

	if (! (this instanceof Request)) {
		return new Request(options);
	}

	options = options || {};
	Readable.call(this, pluck('highWaterMark', options));

	assign(this,
		pluck('url method headers trailers', options),
		{
			/** @see http://nodejs.org/api/http.html#http_message_url */
			url: '/',
			/** @see http://nodejs.org/api/http.html#http_message_method */
			method: 'GET',
			/** @see http://nodejs.org/api/http.html#http_message_httpversion */
			httpVersion: '1.0',
			httpVersionMajor: 1,
			httpVersionMinor: 0,
			/** @see http://nodejs.org/api/http.html#http_message_headers */
			headers: {},
			/** @see http://nodejs.org/api/http.html#http_message_trailers */
			trailers: {},
			socket: {},                 /// {Object}  Dummy object for socket
			connection: {},             /// {Object}  Dummy object for connection
			_internal: {
				httpVersion: '1.0',
				buffer: new Buffer(''),
				timer: 0,               /// {Number}  The time in msecs to take to
				timedout: false,        /// {Boolean} If true than `Response.setTimeout` was called.
				emitCloseCount: 0       /// {Number}
			}
		}
	);

	Object.defineProperty(this, 'httpVersion', {
		get: function() {
			return this._internal.httpVersion;
		},
		set: function(value) {
			var tmp = (value||'').split('.');

			this._internal.httpVersion = value;

			if (tmp.length === 2) {
				this.httpVersionMajor = tmp[0];
				this.httpVersionMinor = tmp[1];
			}
		}
	});

	this.httpVersion = options.httpVersion || this._internal.httpVersion;
	if (options.emitClose) {
		this._internal.emitClose = options.emitClose;
	}
	if (options.buffer) {
		this._internal.buffer = options.buffer;
	}
	if (typeof options === 'string') {
		this.url = options;
	}

	return this;
}
util.inherits(Request, Readable);

Request.prototype._read = function(size){
	var buf;
	while (this._internal.buffer.length > 0) {
		buf = this._internal.buffer.slice(0, size);
		this._internal.buffer = this._internal.buffer.slice(size, this._internal.buffer.length);
		this._internal.emitCloseCount += size;
		if (this._internal.emitClose && this._internal.emitClose <= this._internal.emitCloseCount) {
			this._internal.buffer = new Buffer(''); // reset buffer to stop pushing
			this.emit('close');
		}
		if (! this.push(buf)) {
			return;
		}
	}
	this.push(null);
};

// real API
assign(Request.prototype,
	/** @memberof Request.prototype */
	{
		/**
		 * @see http://nodejs.org/api/http.html#http_message_settimeout_msecs_callback
		 * @param {Number} msecs
		 * @param {Function} callback
		 */
		setTimeout: function(msecs, callback) {
			var self = this;
			setTimeout(function(){
				self._internal.timedout = true;
				callback && callback();
			}, msecs || 0);
		},
	}
);

// test API - they do **NOT** exist in the "real" API
/**
 * Test only - Set internal buffer
 * @param {Buffer|String} data - buffered data
 * @param {String} [encoding]
 */
Request.prototype.setBuffer = function(data, encoding){
	this._internal.buffer = new Buffer(data.toString(encoding || 'utf8'));
};
/**
 * Test only - Set HTTP header
 * @param {String} name - name of HTTP header
 * @param {String} value - value of HTTP header
 */
Request.prototype.setHeader = function(name, value) {
	this.headers[name] = value;
};
/**
 * Test only - Get HTTP header
 * @param {String} name - name of HTTP header
 * @return HTTP header value
 */
Request.prototype.getHeader = function(name) {
	return this.headers[name];
};

module.exports = Request;