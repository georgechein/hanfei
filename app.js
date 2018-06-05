// try create new branch
// Application Log
var log4js = require('log4js');
var log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(at @name @file:@line:@column)'
});
log4js.configure(__dirname + '/log4js.json');
var logger = log4js.getLogger('bot');
var logger_hanfei = log4js.getLogger('hanfei');

var Jieba = require(__dirname + '/jieba.js');//引入jieba.js
var jieba = new Jieba(logger);//建立jieba物件

var Hanfei = require(__dirname + '/hanfei.js');//引入hanfei.js
var hanfei = new Hanfei(logger_hanfei);//建立hanfei物件

var Lineapi = require(__dirname + '/lineapi.js');//引入lineapi.js
var lineapi = new Lineapi(logger);//建立LINEapi物件

var Qamaker = require(__dirname + '/qamaker.js');//引入qnamaker.js
var qamaker = new Qamaker();//建立qnamaker物件

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var hashtable = require(__dirname + '/hashtable.js');

// Setup Express Server
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');
    next();
});

var config = require('fs').readFileSync(__dirname + '/config.json');
config = JSON.parse(config);

var QnA = require('fs').readFileSync(__dirname + '/QnA.json');
QnA = JSON.parse(QnA);

app.get('/api', function (request, response) {
    response.send('API is running');
});

app.get('/logs', function (request, response) {
    var stream = require('fs').createReadStream('logs/messaging.log');
    stream.pipe(response);
});

app.post('/messages', function (request, response) {
    response.send('');
    logger.info(request.body);
    var results = request.body.events;

    logger.info(JSON.stringify(results));
    logger.info('receive message count: ' + results.length);
    for (var idx = 0; idx < results.length; idx++) {
        var acct = results[idx].source.userId;//發送訊息的使用者ID
        var reply_token = results[idx].replyToken;
        //使用者輸入的文字
        var text_msg = results[idx].message.text;

        logger.info('reply token: ' + results[idx].replyToken);
        logger.info('createdTime: ' + results[idx].timestamp);
        logger.info('from: ' + results[idx].source.userId);
        logger.info('type: ' + results[idx].type);
        if (results[idx].type == 'message') {
            if (results[idx].message.type == 'text') {
                //回傳使用者相同的訊息
                /*SendMessage(acct, results[idx].message.text, 'tstiisacompanyfortatung', reply_token, function (ret) {
                });*/
                //如果句子開頭是Q就呼叫qnamaker               
                if (text_msg.startsWith('Q') == true) {
                    console.log("有判斷到字首為Q");
                    var normal = hanfei.CreateNormal(text_msg);
                    var answer = '';
                    qamaker.GetAnswer(normal.qna, normal.qna, function (qna_answer) {
                        lineapi.SendMessage(acct, qna_answer, 'tstiisacompanyfortatung', reply_token, null);
                    });
                } else {
                    //開頭不是Q的話就回傳jieba斷詞之後的結果
                    var normal = hanfei.CreateNormal(text_msg);
                    lineapi.SendMessage(acct, normal.line, 'tstiisacompanyfortatung', reply_token, null);
                }
            }
        }
    }
});

app.post('/hanfei', function (request, response) {
    logger.info(request.body);
    var results = request.body;
    for (k in results) {
        results = k;
        logger.info("/hanfei post data =" + results);
    }
    if (results) {
        var normal = hanfei.CreateNormal(results);
        logger.info("hanfei result: " + normal.qna);
        qamaker.GetAnswer(normal.qna, normal.qna, function (answer) {
            logger.info("qna result: " + escapeHTML(answer.answer));
            if (escapeHTML(answer.answer) == 'No good match found in KB.' || escapeHTML(answer.answer) == 'error') {
                var undefine = { "type": "undefine", "content": { "text": "請再輸入一次", "question": normal.qna } };
                response.send(JSON.stringify(undefine));
            } else {
                response.send(escapeHTML(answer.answer));
            }
        });
    } else {
        logger.info("error didn't have results");
        response.send("{'type': 'error', 'content': {'text': '您傳送錯的資訊或資訊格式了! 請用JSON格式再送一次'}}");
    }
});

app.get('/QA/flow', function (request, response) {
    var options = {
        host: 'flowbottest-b9ef.azurewebsites.net',
        port: '443',
        path: '/QA/flow',
        method: 'GET',
        headers: {
        }
    };
    var https = require('https');
    var req = https.request(options, function (res) {
        res.setEncoding('utf8');
        var data = "";
        res.on('data', function (chunk) {
            logger.info('Response: ' + chunk);
            data += chunk;
        });
        res.on('end', function () {
            logger.info('QA Flow: ' + data);
            response.send(data);
        });
    });
    req.end();
});

app.post('/refresh/QA', function (request, response) {
    logger.info('/refresh/QA');
    qamaker.GetKnowledgebase(config.QnA_Knowledge_base_ID, config.QnA_subscriptionKey, function (kb) {
        kb = JSON.parse(kb);
        logger.info('QnA Knowledgebase :' + JSON.stringify(kb.qnaDocuments));
        if (QnA != kb.qnaDocuments) {
            require('fs').writeFile(__dirname + '/QnA.json', JSON.stringify(kb.qnaDocuments), function (err) {
                this.res.write(JSON.stringify({ success: true }));
                this.res.end();
            }.bind({ res: response }));
            QnA = kb.qnaDocuments;
            var QA_questions = [];
            QnA.forEach(function (QnA_question) {
                for (var index = 0; index < QnA_question.questions.length; index++) {
                    QA_questions.push(QnA_question.questions[index]);
                }
            });
            UpdateUserDict(QA_questions);
        } else {
            response.send(JSON.stringify({ success: true }));
            response.end();
        }
    });
});

app.get('/QA', function (request, response) {
    logger.info('/QA');
    response.send(QnA);
});

app.post('/QA', function (request, response) {
    var QA = request.body.QA;
    var data = {
        "add": {
            "qnaList": [
                {
                    "id": QA.id,
                    "answer": "",
                    "questions": QA.questions,
                    "source": "Editorial",
                    "metadata": []
                }
            ]
        }
    }
    var answer = {
        "type": "",
        "content": {}
    }
    answer.type = QA.type;
    answer.content = QA.content;
    data.add.qnaList[0].answer = JSON.stringify(answer);
    if (QA.metadata[0].value != "") {
        data.add.qnaList[0].metadata = [];
        data.add.qnaList[0].metadata.push(QA.metadata[0]);
    }
    QnA.push(data.add.qnaList[0]);

    require('fs').writeFile(__dirname + '/QnA.json', JSON.stringify(QnA), function (err) {
    });
    PutUserDict(QA.questions, []);
    qamaker.UpdateKnowledgebase(data, config.QnA_Knowledge_base_ID, config.QnA_subscriptionKey, function (err, result) {
        if (err != 202) {
            logger.info("Update KnowledgeBase error code: " + err + ',error: ' + result);
            response.send(false);
        }
        else {
            logger.info("Update KnowledgeBase: " + result);
            response.send('success');
        }
    });
});

app.put('/QA', function (request, response) {
    var QA = request.body.QA;
    var add_questions = [];
    var delete_questions = [];
    var add_metadatas = [];
    var delete_metadatas = [];
    console.log(QA);
    for (var index = 0; index < QnA.length; index++) {
        if (QnA[index].id == QA.id) {
            QnA[index].questions.forEach(function (question) {
                var delete_question = QA.questions.find(function (QA_question) {
                    return QA_question == question;
                });
                if (delete_question == undefined) delete_questions.push(question);
            });
            QA.questions.forEach(function (question) {
                var add_question = QnA[index].questions.find(function (QA_question) {
                    return QA_question == question;
                });
                if (add_question == undefined) add_questions.push(question);
            });

            logger.info(QnA[index].metadata);
            if (QnA[index].metadata == '') {
                add_metadatas.push(QA.metadata);
            } else {
                QnA[index].metadata.forEach(function (metadata) {
                    logger.info(typeof (metadata));
                    var delete_metadata = QA.metadata.find(function (QA_metadata) {
                        logger.info(typeof (QA_metadata));
                        return QA_metadata.value.toLowerCase() == metadata.value;
                    });
                    if (delete_metadata == undefined) delete_metadatas.push(metadata);
                });
                QA.metadata.forEach(function (metadata) {
                    var add_metadata = QnA[index].metadata.find(function (QA_metadata) {
                        return QA_metadata.value == metadata.value.toLowerCase();
                    });
                    if (add_metadata == undefined) add_metadatas.push(metadata);
                });
            }
            break;
        }
    }
    var data = {
        "update": {
            "name": "hanfei",
            "qnaList": [
                {
                    "id": QA.id,
                    "answer": "",
                    "questions": {
                        "add": add_questions,
                        "delete": delete_questions
                    },
                    "source": "Editorial",
                    "metadata": {
                        "delete": delete_metadatas,
                        "add": add_metadatas
                    }
                }
            ]
        }
    }
    var answer = {
        "type": "",
        "content": {}
    }
    answer.type = QA.type;
    answer.content = QA.content;
    data.update.qnaList[0].answer = JSON.stringify(answer);
    /*if (QA.metadata[0].value != "") {
        data.update.qnaList[0].metadata.add = [];
        data.update.qnaList[0].metadata.add.push(QA.metadata[0]);
    }*/
    logger.info("update: " + data);
    for (var index = 0; index < QnA.length; index++) {
        if (QnA[index].id == data.update.qnaList[0].id) {
            QnA[index].answer = data.update.qnaList[0].answer;
            QnA[index].questions = QA.questions;
            console.log(QnA[index].metadata);
            if (QnA[index].metadata == undefined || QnA[index].metadata == "") {
                QnA[index].metadata = [];
                var Pas = {
                    "name": "PAS",
                    "value": data.update.qnaList[0].metadata.add[0].value
                }
                QnA[index].metadata.push(Pas);
            } else {
                QnA[index].metadata[0].value = QA.metadata[0].value;
            }
            break;
        }
    }
    PutUserDict(add_questions, delete_questions);
    require('fs').writeFile(__dirname + '/QnA.json', JSON.stringify(QnA), function (err) {
    });
    qamaker.UpdateKnowledgebase(data, config.QnA_Knowledge_base_ID, config.QnA_subscriptionKey, function (err, result) {
        if (err != 202) {
            logger.info("Update KnowledgeBase error code: " + err + ',error: ' + result);
            response.send(false);
        }
        else {
            logger.info("Update KnowledgeBase: " + result);
            response.send('success');
        }
    });
});

app.delete('/QA/:id', function (request, response) {
    var QA_id = request.params.id;
    var data = {
        "delete": {
            "ids": []
        }
    }
    data.delete.ids.push(QA_id);
    QnA = QnA.filter(function (word) {
        return word.id != QA_id;
    });
    require('fs').writeFile(__dirname + '/QnA.json', JSON.stringify(QnA), function (err) {
    });
    qamaker.UpdateKnowledgebase(data, config.QnA_Knowledge_base_ID, config.QnA_subscriptionKey, function (err, result) {
        if (err != 202) {
            logger.info("Update KnowledgeBase error code: " + err + ',error: ' + result);
            response.send(false);
        }
        else {
            logger.info("Update KnowledgeBase: " + result);
            response.send('success');
        }
    });
});

app.post('/QA/Publish', function (request, response) {
    qamaker.PublishKnowledgebase(config.QnA_Knowledge_base_ID, config.QnA_subscriptionKey, function (err, result) {
        console.log(err);
        if (err != 204) {
            logger.info("Publish KnowledgeBase error code: " + err + ',error: ' + result);
            response.send(false);
        }
        else {
            logger.info("Publish KnowledgeBase: success");
            response.send('success');
        }
    });
});

app.use(express.static('pages'));
app.get('/pages/QA', function (request, response) {
    logger.info('GET pages/flows request');
    request.header('Content-Type', 'text/html');
    var fs = require('fs');
    fs.readFile(__dirname + '/pages/qamaker.htm', 'utf8', function (err, data) {
        if (err) {
            res.send(err);
        }
        var protocol = 'http://';
        var host = this.req.get('host');
        logger.info('encrypted: ' + this.req.connection.encrypted);
        if (this.req.connection.encrypted) {
            protocol = 'https://';
        }
        data = data +
        '<script type="text/javascript"> var ServiceUrl = "' + protocol + host + '"; </script>';
        this.res.send(data);
    }.bind({ req: request, res: response }));
});

function escapeHTML(text) {
    var replacements = { '&quot;': '"' };
    return text.replace(/&quot;/g, function (character) {
        return replacements[character];
    });
}

function SetUserDict(new_dict_words) {
    require('fs').readFile(__dirname + "/dist/QA.utf8", function (err, data) {
        if (err) logger.info("read UserDict error: " + err);
        else {
            var dict_words = data.toString().split('\r\n');
            var dict_word = [];
            for (var index = 0; index < dict_words.length; index++) {
                var words = dict_words[index].split(' ');
                var word = '';
                for (var j = 0; j < words.length - 2; j++) {
                    if (j != words.length - 3) word += words[j] + ' ';
                    else word += words[j];
                }
                dict_word.push(word);
            }
            new_dict_words.forEach(function (new_dict_word) {
                if (dict_word.find(function (word) { return word == new_dict_word; })) {
                } else {
                    dict_word.push(new_dict_word);
                }
            });
            var new_dict = dict_word.join(' 5 tsti\r\n') + " 5 tsti";
            require('fs').writeFile(__dirname + "/dist/QA.utf8", new_dict, function (err) {
                if (err) logger.info("write UserDict error: " + err);
            });
        }
    });
}

function PutUserDict(add_dict_words, delete_dict_words) {
    require('fs').readFile(__dirname + "/dist/QA.utf8", function (err, data) {
        if (err) logger.info("read UserDict error: " + err);
        else {
            var dict_words = data.toString().split('\r\n');
            var dict_word = [];
            for (var index = 0; index < dict_words.length; index++) {
                var words = dict_words[index].split(' ');
                var word = '';
                for (var j = 0; j < words.length - 2; j++) {
                    if (j != words.length - 3) word += words[j] + ' ';
                    else word += words[j];
                }
                dict_word.push(word);
            }
            add_dict_words.forEach(function (add_dict_word) {
                dict_word.push(add_dict_word);
            });
            delete_dict_words.forEach(function (delete_dict_word) {
                dict_word = dict_word.filter(function (word) { return word != delete_dict_word; });
            });
            var new_dict = dict_word.join(' 5 tsti\r\n') + " 5 tsti";
            require('fs').writeFile(__dirname + "/dist/QA.utf8", new_dict, function (err) {
                if (err) logger.info("write UserDict error: " + err);
            });
        }
    });
}

function UpdateUserDict(new_dict_words) {
    var new_dict = new_dict_words.join(' 5 tsti\r\n') + " 5 tsti";
    require('fs').writeFile(__dirname + "/dist/QA.utf8", new_dict, function (err) {
        if (err) logger.info("write UserDict error: " + err);
    });
}

var http = require('http');
var server = http.Server(app);	// create express server
var options = {
    pingTimeout: 60000,
    pingInterval: 3000
};
var listener = server.listen(process.env.port || process.env.PORT || 3978, function () {
    logger.info('Server listening to ' + listener.address().port);
});

process.on('uncaughtException', function (err) {
    logger.error('uncaughtException occurred: ' + (err.stack ? err.stack : err));
});

// 傳送訊息給 LINE 使用者
function SendMessage(userId, message, password, reply_token, callback) {
    if (password == 'tstiisacompanyfortatung') {
        var data = {
            'to': userId,
            'messages': [
                { 'type': 'text', 'text': message }
            ]
        };
        logger.info('傳送訊息給 ' + userId);
        /*ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (!ret) {
                PostToLINE(data, config.channel_access_token, this.callback);
            } 
        });*/
        ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (ret) {
                this.callback(true);
            } else {
                PostToLINE(data, config.channel_access_token, this.callback);
            }
        }.bind({ callback: callback }));
    } else {
        callback(false);
    }
}

// 傳送[可點選圖片]給 LINE 使用者
function SendImagemap(userId, baseUrl, altText, imagemap, password, reply_token, callback) {
    if (password == 'tstiisacompanyfortatung') {
        var data = {
            'to': userId,
            'messages': [{
                "type": "imagemap",
                "baseUrl": baseUrl,
                "altText": altText,
                "baseSize": {
                    "height": 693,
                    "width": 1040
                },
                "actions": imagemap
            }]
        };
        logger.info('傳送訊息給 ' + userId);
        logger.info('傳送圖片網址: ' + baseUrl);
        /*ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (!ret) {
                PostToLINE(data, config.channel_access_token, this.callback);
            } 
        });*/
        ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (ret) {
                this.callback(true);
            } else {
                PostToLINE(data, config.channel_access_token, this.callback);
            }
        }.bind({ callback: callback }));
    } else {
        callback(false);
    }
}
// 傳送【選單】給 LINE 使用者
function SendButtons(userId, image_url, title, text, buttons, alt_text, password, reply_token, callback) {
    if (password == 'tstiisacompanyfortatung') {
        var data = {
            'to': userId,
            'messages': [{
                'type': 'template',
                'altText': alt_text,
                'template': {
                    'type': 'buttons',
                    'thumbnailImageUrl': image_url,
                    'title': title,
                    'text': text,
                    'actions': buttons
                }
            }]
        };
        logger.info('傳送訊息給 ' + userId);
        ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (ret) {
                this.callback(true);
            } else {
                PostToLINE(data, config.channel_access_token, this.callback);
            }
        }.bind({ callback: callback }));
    } else {
        callback(false);
    }
}

// 傳送【確認】給 LINE 使用者
function SendConfirm(userId, text, buttons, alt_text, password, reply_token, callback) {
    if (password == 'tstiisacompanyfortatung') {
        var data = {
            'to': userId,
            'messages': [{
                'type': 'template',
                'altText': alt_text,
                'template': {
                    'type': 'confirm',
                    'text': text,
                    'actions': buttons
                }
            }]
        };
        logger.info('傳送訊息給 ' + userId);
        ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (ret) {
                this.callback(true);
            } else {
                PostToLINE(data, config.channel_access_token, this.callback);
            }
        }.bind({ callback: callback }));
    } else {
        callback(false);
    }
}

// 傳送【可滾動選單】給 LINE 使用者
function SendCarousel(userId, columns, password, reply_token, callback) {
    if (password == 'tstiisacompanyfortatung') {
        var data = {
            'to': userId,
            'messages': [{
                'type': 'template',
                'altText': '請至行動裝置檢視訊息',
                'template': {
                    'type': 'carousel',
                    'columns': columns
                }
            }]
        };
        logger.info('傳送訊息給 ' + userId);
        ReplyMessage(data, config.channel_access_token, reply_token, function (ret) {
            if (ret) {
                this.callback(true);
            } else {
                PostToLINE(data, config.channel_access_token, this.callback);
            }
        }.bind({ callback: callback }));
    } else {
        callback(false);
    }
}

// 直接回覆訊息給 LINE 使用者
function ReplyMessage(data, channel_access_token, reply_token, callback) {
    data.replyToken = reply_token;
    logger.info(JSON.stringify(data));
    var options = {
        host: 'api.line.me',
        port: '443',
        path: '/v2/bot/message/reply',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Length': Buffer.byteLength(JSON.stringify(data)),
            'Authorization': 'Bearer <' + channel_access_token + '>'
        }
    };
    var https = require('https');
    var req = https.request(options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            logger.info('Response: ' + chunk);
        });
        res.on('end', function () {
        });
        logger.info('Reply message status code: ' + res.statusCode);
        if (res.statusCode == 200) {
            logger.info('Reply message success');
            this.callback(true);
        } else {
            logger.info('Reply message failure');
            this.callback(false);
        }
    }.bind({ callback: callback }));
    req.write(JSON.stringify(data));
    req.end();
}

// 取得 LINE 使用者資訊
function GetProfile(userId, callback) {
    var https = require('https');
    var options = {
        host: 'api.line.me',
        port: '443',
        path: '/v2/bot/profile/' + userId,
        method: 'GET',
        headers: {
            'Authorization': 'Bearer <' + config.channel_access_token + '>'
        }
    };

    var req = https.request(options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            logger.info('Response: ' + chunk);
            if (res.statusCode == 200) {
                var result = JSON.parse(chunk);
                logger.info('displayName: ' + result.displayName);
                logger.info('userId: ' + result.userId);
                logger.info('pictureUrl: ' + result.pictureUrl);
                logger.info('statusMessage: ' + result.statusMessage);
                callback(result);
            } if (res.statusCode == 401) {
                logger.info('IssueAccessToken');
                IssueAccessToken();
            }
        });
    }).end();
}

function PostToLINE(data, channel_access_token, callback) {
    logger.info(JSON.stringify(data));
    var options = {
        host: 'api.line.me',
        port: '443',
        path: '/v2/bot/message/push',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Length': Buffer.byteLength(JSON.stringify(data)),
            'Authorization': 'Bearer <' + channel_access_token + '>'
        }
    };
    var https = require('https');
    var req = https.request(options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            logger.info('Response: ' + chunk);
        });
    });
    req.write(JSON.stringify(data));
    req.end();
    try {
        callback(true);
    } catch (e) { };
}
function IssueAccessToken() {
    var https = require('https');
    var options = {
        host: 'api.line.me',
        port: '443',
        path: '/v2/oauth/accessToken',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    options.form = {};
    options.form.grant_type = 'client_credentials';
    options.form.client_id = config.channel_id;
    options.form.client_secret = config.channel_secret;

    var req = https.request(options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            logger.info('Response: ' + chunk);
            if (res.statusCode == 200) {
                var result = JSON.parse(chunk);
                config.channel_access_token = result.access_token;
                var fs = require('fs');
                fs.writeFile(__dirname + '/config.json', JSON.stringify(config), function (err) {
                    if (err) {
                        logger.error(e);
                    }
                });
            }
        });
    }).end();
}