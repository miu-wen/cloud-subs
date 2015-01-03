
var util = require('util'),
    crypto = require('crypto');
var _ = require('underscore');
var S = require('string');
var EventProxy = require('eventproxy');

var request = require('./../util/request');
var ocr = require('./../ocr').ocr;

var BTSiteBase = require('./base');

var BANGUMI_BASE_URL = 'https://bangumi.moe';

function BTSiteBangumi(opts) {
  BTSiteBase.call(this);
  this.setSite('bangumi');
  //this.m_vcode_url = '';
  this.m_options = {
    category_tag_id: '549ef207fe682f7549f1ea90',
    inteam: 1,
    //teamsync: ''
  };
  if (opts) {
    this.m_options = _.extend(this.m_options, opts);
  }
}

util.inherits(BTSiteBangumi, BTSiteBase);

BTSiteBangumi.prototype.IsLogin = function (callback) {
  request.clearCookie(BANGUMI_BASE_URL);
  if (!this.m_cookie) {
    callback(null, false);
  } else {
    //check login
    request.setCookie(this.m_cookie, BANGUMI_BASE_URL);
    request.get(BANGUMI_BASE_URL + '/api/user/session', function (err, response, body) {
      if (err) {
        callback(err);
        return;
      }
      if (response.statusCode !== 200) {
        callback(null, false);
      } else {
        if (body.indexOf('{"_id":') !== -1) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      }
    });
  }
};

BTSiteBangumi.prototype.GetErrorMessage = function (body) {
  var r = null;
  try {
    r = JSON.parse(body);
  } catch (e) {
    return null;
  }
  return r;
};

BTSiteBangumi.prototype.LoginEx = function (callback) {
  var that = this;
  var passHash = crypto
      .createHash('md5')
      .update(this.m_password)
      .digest('hex');
  var formdata = {
    'username': this.m_username,
    'password': passHash
  };
  request.post(BANGUMI_BASE_URL + '/api/user/signin', formdata, {multipart: true}, function (err, response, body) {
    if (err) {
      callback(err);
      return;
    }
    //no vcode
    if (response.statusCode === 200) {
      var message = that.GetErrorMessage(body);
      if (message && message.success) {
        callback(null, true);
        return;
      }
      callback(message, false);
    } else {
      callback('unknown error', false);
    }
  });
};

BTSiteBangumi.prototype.LoginSucceed = function (callback) {
  var str_cookie = request.getCookie(BANGUMI_BASE_URL);
  this.saveCookie(str_cookie);
  callback(null, true);
};

BTSiteBangumi.prototype.GetTagSuggest = function (title, callback) {
  var that = this;
  var ep = new EventProxy();
  ep.all(['tags', 'torrent'], function (tags, torrent) {
    var tag_ids = [];
    tags.forEach(function (t) {
      if (t._id) {
        tag_ids.push(t._id);
      }
    });
    if (torrent && torrent.tag_ids && torrent.tag_ids.length) {
      var tids = torrent.tag_ids;
      tids.forEach(function (tid) {
        if (tid && tag_ids.indexOf(tid) < 0) {
          tag_ids.push(tid);
        }
      });
    }
    callback(null, tag_ids);
  });
  ep.fail(callback);

  request.post(BANGUMI_BASE_URL + '/api/tag/suggest',
    {query: title}, {multipart: true}, function (err, response, body) {
      if (err) {
        return ep.emit('error', err);
      }
      var m = that.GetErrorMessage(body);
      if (m && m instanceof Array) {
        ep.emit('tags', m);
      } else {
        ep.emit('tags', []);
      }
  });

  request.post(BANGUMI_BASE_URL + '/api/torrent/suggest',
    {title: title, inteam: 1}, {multipart: true}, function (err, response, body) {
      if (err) {
        return ep.emit('error', err);
      }
      var m = that.GetErrorMessage(body);
      if (m && typeof m == 'object') {
        ep.emit('torrent', m);
      } else {
        ep.emit('torrent', {});
      }
  });
};

BTSiteBangumi.prototype.UploadEx = function (formdata, callback) {
  var that = this;
  request.post(BANGUMI_BASE_URL + '/api/torrent/add',
    formdata, { multipart: true },
    function (err, response, body) {
      if (err) {
        callback(err);
        return;
      }
      if (response.statusCode === 200) {
        var message = that.GetErrorMessage(body);
        if (message && message.success) {
          // success
          callback(null, true);
          return;
        }
        callback(message, false);
      } else if (response.statusCode === 500) {
        var message = that.GetErrorMessage(body);
        callback(message, false);
      } else {
        callback('unknown error', false);
      }
  });
};

BTSiteBangumi.prototype.upload = function (title, intro, torrent_buf, callback) {
  //no need for vcode
  var formdata = {
    title: title,
    introduction: intro,
  };
  formdata = _.extend(formdata, this.m_options);
  formdata.__object = [{ 
    type: 'buffer',
    name: 'file',
    buffer: torrent_buf,
    options: {
      filename: 'file.torrent'
  }}];

  var that = this;
  this.GetTagSuggest(title, function (err, tag_ids) {
    if (err) {
      return callback(err);
    }
    formdata.tag_ids = tag_ids.join();
    that.UploadEx(formdata, function (err, succeed) {
      if (err) {
        callback(err);
      } else {
        callback(null, succeed);
      }
    });
  });
};

BTSiteBangumi.prototype.getlastpublish = function (callback) {
  var that = this;
  request.get(BANGUMI_BASE_URL + '/api/torrent/my', function (err, response, body) {
    if (err) {
      callback(err);
      return;
    }
    if (body) {
      var message = that.GetErrorMessage(body);
      if (message && message.torrents) {
        var t = message.torrents[0];
        var lastone = {
          url: BANGUMI_BASE_URL + '/#!/torrent/' + t._id,
          title: t.title
        };
        callback(null, lastone);
      }
    }
    callback('not found');
  });
};

module.exports = BTSiteBangumi;