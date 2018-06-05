var request = require('request');
//var Bingsearch = require(__dirname+'/bingsearch.js');
//var bing_search;

var config = require('fs').readFileSync(__dirname + '/config.json');
config = JSON.parse(config);

var Qamaker = function () {
    //若是分數太低時則用到bingsearch，暫時註解
    //bing_search = new Bingsearch();
}

Qamaker.prototype.GetAnswer = function (normal, question, callback) {

    var host = 'https://westus.api.cognitive.microsoft.com';
    var endpoint = '/qnamaker/v4.0/endpointkeys/';
    var subscriptionKey = config.QnA_subscriptionKey;
    var path = endpoint;
    var kbId = config.QnA_Knowledge_base_ID;

    //getEndpoint(host, path, subscriptionKey, function (_endpointkey) {
    var _endpointkey = config.QnA_endpointkey;
    console.log("_endpointkey: " + _endpointkey);
    host = config.QnA_hostname;
    path = '/qnamaker/knowledgebases/' + kbId + '/generateAnswer';
    var endpointkey = _endpointkey;
    var q = normal;
    q = q.trim();
    var data = {
        'question': q
    };
    console.log(JSON.stringify(data));
    getQnaAnswer(JSON.stringify(data), host, path, endpointkey, function (qna_answer) {
        if (qna_answer != 'error') {
            var answer = JSON.parse(qna_answer);
            var ansObj = GetAnswerString(answer, q);
            callback(ansObj);
        } else {
            callback('error');
        }
    });
    //});

    function GetAnswerString(ret, q) {
        console.log(ret);
        var score = ret.answers[0].score;
        var ans_string = ret.answers[0].answer;
        var clear_ans = [];
        var retObj = {
            score: '',
            answer: ''
        };
        for (var i = 1; i < ret.answers.length; i++) {
            if (ret.answers[i].score > score) {
                score = ret.answers[i].score;
                ans_string = ret.answers[i].answer;
            }
        }
        for (var i = 0; i < ret.answers.length; i++) {
            if (ret.answers[i].score == 100) {
                if (ret.answers[i].metadata != '') {
                    var clear_obj = {
                        "question": q,
                        "pas": ret.answers[i].metadata[0].value,
                        "title": ret.answers[i].questions[0]
                    }
                    clear_ans.push(clear_obj);
                }
            }
        }

        console.log("clear_ans: " + clear_ans)
        if (clear_ans.length > 1) {
            var more_ans_string = '';
            var ans_strings = '';
            for (var i = 0; i < clear_ans.length; i++) {
                ans_strings += '<br>【' + clear_ans[i].pas + '】 ' + clear_ans[i].title;
            }
            more_ans_string = '{"type":"text","content":{"text":"以下為查詢結果' + ans_strings + '<br>請輸入問題編號' + '"}}';
            retObj.score = score;
            retObj.answer = more_ans_string;
        } else {
            retObj.score = score;
            retObj.answer = ans_string;
        }
        return retObj;
    }

}

function getQnaAnswer(data, host, path, endpointkey, callback) {
    var http;
    http = require('https');

    var options = {
        host: host,
        path: path,
        port: 443,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'EndpointKey ' + endpointkey,
        },
        method: 'POST'
    };
    var body = data;
    options.headers['Content-Length'] = new Buffer(body).length;

    var req = http.request(options, function (res) {
        res.body = '';
        res.on('data', function (chunk) {
            console.log('BODY: ' + chunk);
            res.body = res.body + chunk;
        });
        res.on('end', function () {
            if (res.statusCode == 200) {
                callback(res.body);
            }
            else {
                callback("error");
            }
        });
    });
    req.write(body);
    req.end();
}

function getEndpoint(host, path, subscriptionKey, callback) {
    var request_params = {
        uri: host + path,
        headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey,
        }
    };

    // Pass the callback function to the response handler.
    request.get(request_params, function (error, response, body) {
        var keys = JSON.parse(body);
        callback(keys.primaryEndpointKey);
    });
}

Qamaker.prototype.GetKnowledgebase = function getKnowledgebase(kbId, subscriptionKey, callback) {
    var host = 'westus.api.cognitive.microsoft.com';
    var path = '/qnamaker/v4.0/knowledgebases/' + kbId + '/Test/qna';
    var request_params = {
        uri: 'https://' + host + path,
        headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey,
        }
    }
    request.get(request_params, function (error, response, body) {
        if (error) {
            console.log("Download QA knowledgebase error: " + error);
        } else {
            callback(body);
        }
    });
}

Qamaker.prototype.UpdateKnowledgebase = function patchKnowledgebase(data, kbId, subscriptionKey, callback) {
    var host = 'westus.api.cognitive.microsoft.com';
    var path = '/qnamaker/v4.0/knowledgebases/' + kbId;
    var http;
    http = require('https');

    var options = {
        host: host,
        path: path,
        port: 443,
        headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': subscriptionKey,
        },
        method: 'PATCH'
    };
    var body = JSON.stringify(data);
    options.headers['Content-Length'] = new Buffer(body).length;

    var req = http.request(options, function (res) {
        res.body = '';
        res.on('data', function (chunk) {
            res.body = res.body + chunk;
        });
        res.on('end', function () {
            callback(res.statusCode, res.body);
        });
    });
    req.write(body);
    req.end();
}

Qamaker.prototype.PublishKnowledgebase = function publishKnowledgebase(kbId, subscriptionKey, callback) {
    var host = 'westus.api.cognitive.microsoft.com';
    var path = '/qnamaker/v4.0/knowledgebases/' + kbId;
    var http;
    http = require('https');

    var options = {
        host: host,
        path: path,
        port: 443,
        headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey
        },
        method: 'POST'
    };

    var req = http.request(options, function (res) {
        res.body = '';
        res.on('data', function (chunk) {
            res.body = res.body + chunk;
        });
        res.on('end', function () {
            callback(res.statusCode, res.body);
        });
    });
    req.write(' ');
    req.end();
}

module.exports = Qamaker;