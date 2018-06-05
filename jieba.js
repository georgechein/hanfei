var nodejieba;
var logger;

// Sentence Type List
const SINGLE = '小型句';
const SIMPLE = '單句';
const MULTI = '多動詞句';
const COMBO = '包孕句';
const BETYPE = '[是]字句';
const BATYPE = '[把]字句';
const EDTYPE = '[被]字句';
const HAVETYPE = '[有]字句';
const COMPLEX = '複句';


const SUBJECT = '主語';
const PBJECT = '賓語';
const ATTRIBUTE = '定語';
const ADVERBIAL = '狀語';
const COMPLEMENT = '補語';
const PREDICATE = '述語';
const BA = '把';
const ED = '被';

const VERB = '動詞短語';      // 動詞短語(述賓、述補)
const NOUN = '名詞短語';      //名詞短語(主謂、偏正、並列)
const PREP = '介詞短語';      // 介詞短語
const NUMER = '量詞短語';     // 量詞短語
const LOCAL = '方位短語';     // 方位短語
const LIKE = '比擬短語';      // 比擬短語
const UJTYPE = '[的]字短語';  // [的]字短語
const SOTYPE = '[所]字短語';  // [所]字短語
const IDIOM = '成語';         // 成語、慣用語、諺語、歇後語
const PRON = '代名詞';        //
const END = '句末語助詞'      //句末語助詞
const ADJ = '形容詞'          //
const CON = '連接詞' //
const ADV = '副詞' //
const TIME = '時間副詞';

//Sentence Function
const STATEMENT = '陳述句';
const QUESTION = '疑問句';
const IMPERATIVE = '感嘆句';
const EXCLAMATION = '祈使句';

//[的]字短語的最小長度
const UJLENGTH = 3;
const PREPLENGTH = 2;

var Jieba = function (log) {
    logger = log;
    nodejieba = require("nodejieba");
}

function Sentence() {
    this.type = '';
    this.be_pos = -1;
    this.v_pos = [];
    this.n_pos = [];
}

function Structure() {
    this.sentence = [];
    this.phrase = [];
}

/*
動詞數量統計與特殊句判斷
*/

function getSentenceInfo(word_group) {
    var sentence = new Sentence();
    for (i = 0; i < word_group.length; i++) {
        var tag = word_group[i].tag;

        if (tag.indexOf('n') != -1) {//統計此句名詞數量
            sentence.n_pos.push(i);
        }

        if (tag.indexOf('v') != -1) {//判斷此句動詞是否特殊動詞
            switch (tag) {
                case 'vb'://是/不是
                    sentence.be_pos = i;
                    sentence.type = BETYPE;
                    break;
                case 'vba'://把/有把
                    sentence.be_pos = i;
                    sentence.type = BATYPE;
                    //特殊處理[有把] = [把]
                    if (i > 0) {
                        if (word_group[i - 1].tag.indexOf('vh') != -1) {
                            sentence.v_pos.pop();
                            word_group[i - 1].tag = 'va';
                        }
                        logger.info('特殊處理[有把] = [把]');
                    }
                    break;

                case 'ved'://被
                    sentence.be_pos = i;
                    sentence.type = EDTYPE;
                    break;

                case 'vh'://有
                    if (sentence.be_pos == -1) {
                        sentence.be_pos = i;
                        sentence.type = HAVETYPE;
                    }
                    break;
                default:

            }
            //兩動詞相連,前一動詞之詞性轉換為助動詞
            if (i > 0 && word_group[i - 1].tag.indexOf('v') != -1) {
                sentence.v_pos.pop();
                word_group[i - 1].tag = 'va';
            }
            if (tag != 'va') sentence.v_pos.push(i);
        }
    }
    
    if (sentence.type == '') {//如果不是以上特殊句型，以動詞數目決定句型
        if (sentence.v_pos.length == 0) {
            sentence.type = SINGLE;
        } else if (sentence.v_pos.length == 1) {
            sentence.type = SIMPLE;
        } else {
            sentence.type = MULTI;
        }
    }

    return sentence;
}

function getVPostPosition(word_group, pos, combo_index) {
    var post_position = pos + 1;
    var tag;
    if (post_position < word_group.length) {

        if (word_group.length > pos + 1) {//有問題
            tag = word_group[pos + 1].tag;
            // V + 句末語助詞
            if (tag == 'ul' || tag == 'ud' || tag == 'uv' || tag == 'ug' || tag == 'uz') post_position = pos + 2;//若助詞則跳過
            // V + ADJ
            if (tag == 'a') post_position = pos + 2;//若形容詞則跳過
            // ?
            //if (combo_index == 'false' && tag.indexOf('v') != -1) post_position = pos + 2;
            //if (combo_index == false && tag.indexOf('v') != -1) {
            //    logger.info('動詞句首特殊處理');
            //    post_position = pos + 2;
            //}
        }

        if (word_group.length > pos + 3) {//若動詞後是的跟了則跳過
            // V + 的 + N
            tag = word_group[pos + 1].tag;
            if (tag == 'uj') post_position = pos + 3;
            // V + ADJ + 了
            tag = word_group[pos + 2].tag;
            if (tag == 'ul') post_position = pos + 3;
        }
    }
    return post_position;
}

function getVPrePosition(word_group, pos) {
    var pre_position = pos;
    if (pre_position > 0) {
        var tag = word_group[pos - 1].tag;
        if (tag.startsWith('d') == true || tag == 'va' || tag.startsWith('a') == true  || tag == 't') pre_position = pos - 1;//如果是副詞 助動詞 形容詞 時間位置往前移
    }
    return pre_position;
}

/*
短語 - 動詞切割
*/

function getPhrase(sentence_info, cut_results) {
    var structure = new Structure();

    var v_pos = sentence_info.v_pos;
    var be_pos = sentence_info.be_pos;
    var sentence_type = sentence_info.type;

    var combo_index = false;
    switch (sentence_type) {
        case SINGLE://無
            break;

        case SIMPLE://單動詞句
            structure.phrase[0] = getVPrePosition(cut_results, v_pos[0]);
            structure.phrase[1] = getVPostPosition(cut_results, v_pos[0], combo_index);
            break;

        case BETYPE:
        case HAVETYPE:
            structure.phrase[0] = getVPrePosition(cut_results, be_pos);
            structure.phrase[1] = be_pos + 1;
            break;

        case BATYPE:
        case EDTYPE:
        case MULTI:
            for (i = 0; i < v_pos.length; i++) {
                // 動詞在短語開端的特殊處理。邏輯不佳，下次改寫
                //logger.info('v_pos @ : '+ cut_results[v_pos[i]].word +' '+ v_pos.toString());
                //if (v_pos[i] == 0) {
                //    combo_index = false
                //} else {
                //    combo_index = true;
                //}
                structure.phrase[2 * i] = getVPrePosition(cut_results, v_pos[i]);
                structure.phrase[2 * i + 1] = getVPostPosition(cut_results, v_pos[i], combo_index);
            }

            if ((v_pos[1] - v_pos[0]) > 1) {
                structure.sentence[0] = v_pos[0] + 1;
            }

            break;
        default:
    }

    //動詞在句首特別處理 V + ...
    if (structure.phrase[0] == 0) {
        structure.phrase.shift();
        structure.phrase.shift();
    }

    //連接詞 + 動詞在句首特別處理 C + V + ...
    if (v_pos[0] == 1 && cut_results[0].tag == 'c') {
        logger.info('動詞句首特殊處理 C');
        var pos = structure.phrase[0];
        structure.phrase.shift();
        structure.phrase.shift();
        structure.phrase.unshift(pos);
    }

    return structure;
}

//找逗點
function getWPosition(word_group) {
    var w_pos = [];
    var i = 0;

    for (i = 0; i < word_group.length; i++) {
        tag = word_group[i].tag;
        if (tag == 'w') {
            w_pos.push(i);
        }
    }

    return w_pos;
}

function PharseObj() {
    this.intend = ''; // message for whole sentence
    this.subject = '';
    this.adverbial = '';
    this.count = 0;
    this.sentence_type = '';
    this.words = []; // array of words for each phrase
    this.tags = [];  // array of tags for each phrase
    this.phrase_type = [];  // type for each phrase
    this.phrase_comp = []; //句子的成分：主語、述語、賓語、定語、狀語、補語
}

/*
短語 - 「的」字、代詞、介詞切割 
*/
function getSentenceStructure(word_group, phrase, sentence) {
    var phrase_obj = new PharseObj();

    var phrase_index = 0;
    var word_index = 0;
    var sentence_index = 0;
    var phrase_msg = '';

    phrase_obj.words[phrase_index] = [];
    phrase_obj.tags[phrase_index] = [];

    var word_count = 0;

    var uj_pos, uj_index;
    var keyword_pos;
    var tags = [];
    var words = [];
    
    for (i = 0; i < word_group.length; i++) {

        logger.info('Phrase :' + phrase_obj.words[phrase_index + word_index].toString() + phrase_obj.tags[phrase_index + word_index].toString());

        if (sentence.length > 0) {
            if (i == sentence[sentence_index]) {
                phrase_msg = phrase_msg + ' % ';
                sentence_index = sentence_index + 1;
            }
        }

        if (i == phrase[phrase_index]) {

            uj_pos = phrase_obj.tags[phrase_index + word_index].indexOf('uj');
            word_index = word_index + getClause(word_count, phrase_index + word_index, phrase_obj);
            
            word_count = 0;
            phrase_msg = phrase_msg + ' + ';
            phrase_index = phrase_index + 1;

            if (uj_index != -1) {
                phrase_obj.words[phrase_index + word_index] = [];
                phrase_obj.tags[phrase_index + word_index] = [];
            }

        }

        phrase_obj.words[phrase_index + word_index].push(word_group[i].word);
        phrase_obj.tags[phrase_index + word_index].push(word_group[i].tag);
        word_count = word_count + 1;
        phrase_msg = phrase_msg + word_group[i].word + word_group[i].tag;

    }

    word_index = word_index + getClause(word_count, phrase_index + word_index, phrase_obj);

    //句末語助詞切割
    word_index = word_index + dividePhraseByEndExpletive(phrase_obj);

    if (sentence.length > 0) phrase_msg = phrase_msg + ' %';

    phrase_obj.msg = phrase_msg;
    phrase_obj.count = phrase_index + word_index + 1;
    for (i = 0; i < phrase_obj.count; i++) {
        tags = phrase_obj.tags[i];
        logger.info(phrase_obj.words[i].toString());
        phrase_obj.phrase_type[i] = getPhraseType(tags);
    }

    return phrase_obj;
}

function getClause(word_count, pos_index, phrase_obj) {
    var tags = [];
    var keyword_pos, w_index;

    w_index = 0;
    //代詞短語處理
    keyword_pos = phrase_obj.tags[pos_index + w_index].indexOf('r');
    tags = phrase_obj.tags[pos_index + w_index];
    if (keyword_pos != -1 && tags.length > 1) {
        if (keyword_pos == 0 || keyword_pos == tags.length - 1) {
            w_index = dividePhraseByPron(keyword_pos, pos_index + w_index, phrase_obj);
        }
    }

    //[的]字短語處理
    uj_pos = phrase_obj.tags[pos_index + w_index].indexOf('uj');
    if (uj_pos != -1) {
        w_index = w_index + dividePhraseByUj(uj_pos, word_count, pos_index + w_index, phrase_obj);
    }

    //介詞短語處理 - 假設不會和[的]字短語、代詞短語同時發生
    keyword_pos = phrase_obj.tags[pos_index + w_index].indexOf('p');
    if (keyword_pos != -1 && keyword_pos != 0) w_index = w_index + dividePhraseByPrep(keyword_pos, word_count, pos_index + w_index, phrase_obj);

    return w_index;
}

/*
短語種類判斷
*/

function getPhraseType(tags) {
    var v_num = 0;
    var n_num = 0;
    var p_num = 0;
    var uj_num = 0;
    var r_num = 0;
    var ul_num = 0;
    var a_num = 0;
    var c_num = 0;
    var d_num = 0;
    var t_num = 0;
    var f_num = 0;
    var i, tag, type;

    for (i = 0; i < tags.length; i++) {
        tag = tags[i];
        if (tag.startsWith('uj') == true) uj_num = uj_num + 1;
        if (tag.startsWith('ul') == true) ul_num = ul_num + 1;
        if (tag.startsWith('v') == true) v_num = v_num + 1;
        if (tag.startsWith('n') == true) n_num = n_num + 1;
        if (tag.startsWith('p') == true) p_num = p_num + 1;
        if (tag.startsWith('f') == true) p_num = f_num + 1;
        if (tag.startsWith('r') == true) r_num = r_num + 1;
        if (tag.startsWith('c') == true) c_num = c_num + 1;
        if (tag.startsWith('t') == true) t_num = t_num + 1;
        if (tag.startsWith('a') == true || tag.indexOf('i') != -1) a_num = a_num + 1;
        if (tag.startsWith('d') == true) d_num = d_num + 1;
    }
    if (uj_num > 0) {
        type = UJTYPE;
    } else if (p_num > 0) {
        type = PREP;
    } else if (v_num > 0 && n_num == 0) {
        type = VERB;
    } else if (r_num == 1 && tags.length == 1) {
        type = PRON;
    } else if (a_num == 1 && n_num == 0) {
        type = ADJ;
    } else if (ul_num == 1 & tags.length == 1) {
        type = END;
    } else if (c_num == 1 & tags.length == 1) {
        type = CON;
    } else if (f_num == 1 & tags.length == 1) {
        type = LOCAL;
    } else if (d_num == tags.length) {
        type = ADV;
    } else if (t_num == tags.length) {
        type = TIME;
    } else {
        type = NOUN;
    }
    return type;
}

/*
代詞短語 = 單獨存在，後面不連接[的]
*/
function dividePhraseByPron(word_pos, index, phrase_obj) {
    var tags = phrase_obj.tags[index];
    var words = phrase_obj.words[index];
    var tag = tags[word_pos];
    var pos = [];

    logger.info('Pron : ' + words.toString());

    var ret = 0;
    if (word_pos == 0) {
        if (tags[1] != 'uj') {
            pos = [0, 1, words.length];
            dividePhrase(pos, words, tags, phrase_obj);
            ret = 1;
        }
        // 用途待確認 ???
        /* else {
            pos = [0, 1];
            dividePhrase(pos, words, tags, phrase_obj);
            ret = 1;
        }*/
    } else {
        pos = [0, word_pos, words.length];
        dividePhrase(pos, words, tags, phrase_obj);
        ret = 1;
    }
    return ret;
}

/*
短語處理
*/
function dividePhrase(pos, words, tags, phrase_obj) {
    var i;
    var pre, pro;

    phrase_obj.words.pop();
    phrase_obj.tags.pop();
    for (i = 0; i < pos.length - 1; i++) {
        pre = pos[i];
        pro = pos[i + 1];
        phrase_obj.words.push(words.slice(pre, pro));
        phrase_obj.tags.push(tags.slice(pre, pro));
    }
}

/*
介詞短語 = 單獨存在
*/
function dividePhraseByPrep(prep_pos, word_count, phrase_index, phrase_obj) {
    var index = 0;

    var tags = phrase_obj.tags[phrase_index];
    var words = phrase_obj.words[phrase_index];
    var pos = [];

    if (word_count > PREPLENGTH) {
        pos = [0, prep_pos, words.length];
        dividePhrase(pos, words, tags, phrase_obj);
        index = index + 1;
    }
    return index;
}

/*
句末語助詞
*/
function dividePhraseByEndExpletive(phrase_obj) {
    var phrase_end = phrase_obj.tags.length - 1;
    var tags = phrase_obj.tags[phrase_end];
    var words = phrase_obj.words[phrase_end];
    var tag_end = tags.length - 1;
    var tag = tags[tag_end];
    var pos = [];

    var ret = 0;
    if (tag == 'ul' && tags.length > 1) {
        pos = [0, tag_end, words.length];
        dividePhrase(pos, words, tags, phrase_obj);
        ret = 1;
    }
    return ret;
}

/*
[的]字短語
*/

function dividePhraseByUj(uj_pos, word_count, phrase_index, phrase_obj) {
    var index = 0;

    var tags = phrase_obj.tags[phrase_index];
    var words = phrase_obj.words[phrase_index];
    var tag;
    var pos = [];

    // V + 的 + O - 謂語
    if (uj_pos == 0) {
        phrase_obj.words[phrase_index] = [];
        phrase_obj.tags[phrase_index] = [];
        for (var j = 0; j < words.length; j++) {
            phrase_obj.words[phrase_index - 1].push(words[j]);
            phrase_obj.tags[phrase_index - 1].push(tags[j]);
        }
        index = index - 1;
    } else if (word_count > UJLENGTH) {

        if (uj_pos + 2 < words.length && uj_pos - 1 > 0) {
            // ADJ + N + 的 + N
            if (uj_pos == 2 && tags[0].indexOf('a') != -1) {
                pos = [0, uj_pos + 2, words.length];
            }
            // N + N + 的 + N
            else {
                pos = [0, uj_pos - 1, uj_pos + 2, words.length];
            }
            // N + 的 + N 短語末端
        } else if (uj_pos + 2 >= words.length) {
            pos = [0, uj_pos - 1, words.length];
            // N + 的 + N 短語開端
        } else {
            pos = [0, uj_pos + 2, words.length];
        }

        dividePhrase(pos, words, tags, phrase_obj);
        index = index + pos.length - 2;
    }
    return index;
}

function getPhraseMsg(word_group) {
    var sentence = [];
    var phrase = [];
    var structure;
    var sentence_info;
    var phrase_obj = new PharseObj();
    var v1_pos, v2_pos;

    sentence_info = getSentenceInfo(word_group);
    structure = getPhrase(sentence_info, word_group);
    phrase = structure.phrase;
    sentence = structure.sentence;
    phrase_obj = getSentenceStructure(word_group, phrase, sentence);

    phrase_obj.sentence_type = sentence_info.type;

    //單句處理
    if (phrase_obj.sentence_type == SIMPLE || phrase_obj.sentence_type == MULTI) {
        if (phrase_obj.phrase_type.indexOf(VERB) == -1) phrase_obj.sentence_type = SINGLE;
    }

    //多動詞處理
    if (phrase_obj.sentence_type == MULTI) {
        v1_pos = phrase_obj.phrase_type.indexOf(VERB);
        v2_pos = phrase_obj.phrase_type.lastIndexOf(VERB);
        if (v1_pos == v2_pos) {
            //動詞數量減少為1，句型修正為單句
            phrase_obj.sentence_type = SIMPLE;
        } else if (v2_pos - v1_pos > 1) {
            //包孕句 - S1 + V1 + % S2 + V2 + O + C %
            if (phrase_obj.phrase_type[v1_pos + 1] == NOUN || phrase_obj.phrase_type[v1_pos + 1] == PRON) {
                if (phrase_obj.phrase_type[v1_pos - 1] == NOUN || phrase_obj.phrase_type[v1_pos - 1] == PRON) {
                    phrase_obj.sentence_type = COMBO;
                }
            }
        } else if (v2_pos - v1_pos == 1) {
            // S + V + V 轉換為 S + V + N
            phrase_obj.sentence_type = SIMPLE;
            phrase_obj.phrase_type[v2_pos] = NOUN; //動名詞型別轉換
        }
    }
    if (phrase_obj.words.length < 2) phrase_obj.sentence_type = SINGLE;

    return phrase_obj;

}

function getShowMessage(phrase_array) {
    var phrase_obj = new PharseObj();
    var i, j;
    var phrase_msg, sentence_type, phrase_comp, phrase_type;
    var subject = '';

    sentence_type = '%';
    phrase_comp = '<';
    phrase_type = '';

    for (i = 0; i < phrase_array.length; i++) {
        phrase_obj = phrase_array[i];
        if (i == 0) subject = phrase_obj.subject;
        sentence_type = sentence_type + phrase_obj.sentence_type + ',';

        for (j = 0; j < phrase_obj.words.length; j++) {
            phrase_comp = phrase_comp + phrase_obj.phrase_comp[j] + '+';
        }
        phrase_comp = phrase_comp.substr(0, phrase_comp.length - 1) + ' & ';

        for (j = 0; j < phrase_obj.words.length; j++) {
            for (k = 0; k < phrase_obj.words[j].length; k++) {
                phrase_type = phrase_type + phrase_obj.words[j][k] + phrase_obj.tags[j][k];
            }
            phrase_type = phrase_type + '(' + phrase_obj.phrase_type[j] + ')';
            phrase_type = phrase_type + '+';
        }
        phrase_type = phrase_type.substr(0, phrase_type.length - 1) + ' ,\n';
    }
    sentence_type = sentence_type.substr(0, sentence_type.length - 1) + '%';
    phrase_comp = phrase_comp.substr(0, phrase_comp.length - 3) + '>';
    phrase_type = phrase_type.substr(0, phrase_type.length - 3);

    if (phrase_obj.subject == '' && subject != '') {
        phrase_msg = sentence_type + ' ' + phrase_comp + '\n\n' + phrase_type + '\n\n' + subject + phrase_obj.intend;
    } else {
        phrase_msg = sentence_type + ' ' + phrase_comp + '\n\n' + phrase_type + '\n\n' + phrase_obj.intend;
    }

    return phrase_msg;
}

//程式進入點
Jieba.prototype.CreateNormal = function (text_msg) {

    text_msg = text_msg.replace('?', '');
    text_msg = text_msg.replace('？', '');

    //logger.info(nodejieba.extract(text_msg,3));
    var cut_results = nodejieba.tag(text_msg);

    var tag, i, j;

    var phrase_msg = '';
    var pre_phrase_msg = '';
    var pre_phrase_comp = '';
    var phrase_array = []; //複句
    var phrase_obj = new PharseObj();

    var w_pos = [];
    w_pos = getWPosition(cut_results);
    if (w_pos.length == 0) {
        var start = [0];
        var stop = [cut_results.length];
    } else {
        var start = [];
        var stop = [];
        start.push(0);
        for (i = 0; i < w_pos.length; i++) {
            start.push(w_pos[i] + 1);
            stop.push(w_pos[i]);
        }
        stop.push(cut_results.length);
    }
    var sub_results;
    var index = 0;

    for (index = 0; index < start.length; index++) {
        sub_results = [];
        for (i = start[index]; i < stop[index]; i++) {
            sub_results.push(cut_results[i]);
        }
        phrase_obj = getPhraseMsg(sub_results);
        ret_msg = getIntendByGrammar(phrase_obj, sub_results);
        phrase_array.push(phrase_obj);
    }
    phrase_msg = getShowMessage(phrase_array);

    return phrase_msg;
}

function getIntendByGrammar(phrase_obj, cut_results) {
    var intend;
    var i, j;

    for (i = 0; i < phrase_obj.phrase_type.length; i++) {
        phrase_obj.phrase_comp.push(phrase_obj.phrase_type[i]);
    }

    switch (phrase_obj.sentence_type) {
        //[被]字句 - O + 被 + (S) + V + (C)
        case EDTYPE:
            intend = getIntendForEdType(phrase_obj);
            break;
        case BATYPE:
            intend = getIntendForBaType(phrase_obj);
            break;
        case HAVETYPE:
        //intend = getIntendForHaveType(phrase_obj);
        //break;
        case SIMPLE:
        case BETYPE:
            intend = getIntendForSimple(phrase_obj);
            break;
        case COMBO:
            intend = getIntendForComboType(phrase_obj);
            break;
        case SINGLE:
            intend = getIntendForSingleType(phrase_obj);
            break;
        case MULTI:

        default:
            intend = getCommonIntend(cut_results);
    }
    phrase_obj.intend = intend;

    return intend;
}

function getIntendForSingleType(phrase_obj) {
    var intend;

    var sequence = [0];
    intend = getIntend(sequence, phrase_obj);

    return intend;
}


//包孕句 S1 + V1 + % S2 + V2 + O %
function getIntendForComboType(phrase_obj) {
    var intend;

    var sequence = [2, 3];
    intend = getIntend(sequence, phrase_obj);

    return intend;
}

//[有]字句 S + 有 + O
function getIntendForHaveType(phrase_obj) {
    var intend;

    var sequence = [1, 2];
    intend = getIntend(sequence, phrase_obj);

    return intend;
}

function getIntendForSimple(phrase_obj) {
    var intend;
    var sequence;
    var types = [];
    var i, v_pos;
    var c_pos = 0;

    types = phrase_obj.phrase_type;
    v_pos = types.indexOf(VERB);

    for (i = 0; i < v_pos; i++) {
        if ( types[i] == PRON) {
            phrase_obj.phrase_comp[i] = SUBJECT;
            phrase_obj.subject = phrase_obj.words[i];
        } else if (types[i] == NOUN || types[i] == UJTYPE ) {
            if(phrase_obj.phrase_comp.indexOf(SUBJECT) == -1){
                phrase_obj.phrase_comp[i] = SUBJECT;
                phrase_obj.subject = phrase_obj.words[i];
            }else{
                phrase_obj.phrase_comp[i] = COMPLEMENT;      
            }
        }else if (types[i] == CON) {
            phrase_obj.phrase_comp[i] = CON;
            if (i == 0) c_pos = 1;
        } else if (types[i] == ADV || types[i] == PREP) {
            phrase_obj.phrase_comp[i] = ADVERBIAL;
        } else {
            phrase_obj.phrase_comp[i] = ATTRIBUTE;
        }
    }

    phrase_obj.phrase_comp[v_pos] = PREDICATE;

    for (i = v_pos + 1; i < types.length; i++) {
        if (types[i] == NOUN || types[i] == UJTYPE) {
            if (phrase_obj.phrase_comp.indexOf(PBJECT) != -1) {
                phrase_obj.phrase_comp[i] = COMPLEMENT;
            } else {
                phrase_obj.phrase_comp[i] = PBJECT;
            }
        } else if (types[i] == PREP) {
            phrase_obj.phrase_comp[i] = COMPLEMENT;
        } else if (types[i] == END) {
            phrase_obj.phrase_comp[i] = END;
        }
        else {
            phrase_obj.phrase_comp[i] = ATTRIBUTE;
        }
    }

    sequence = [c_pos, v_pos];
    if (v_pos == 0) sequence = [v_pos];
    if (v_pos < 0) {
        logger.info('Error : ' + types.toString());
        sequence = [0];
    }

    intend = getIntend(sequence, phrase_obj);

    return intend;
}

//[把]字句 - (S) + 把 + O + V + (C)
function getIntendForBaType(phrase_obj) {
    var i, j, pos;
    var words, tags, types;
    var intend = '';
    var sequence = '';
    var key_pos = 0;

    types = phrase_obj.phrase_type;
    switch (types[key_pos]) {
        // 把 + O + V + (C)
        case VERB:
            phrase_obj.phrase_comp[0] = BA;
            phrase_obj.phrase_comp[1] = PBJECT;
            phrase_obj.phrase_comp[2] = PREDICATE;
            if (types.length > 2) {
                phrase_obj.phrase_comp[3] = COMPLEMENT;
                sequence = [2, 1, 3];
            } else {
                sequence = [2, 1];
            }
            break;
        // S + 把 + O + V + (C)
        case NOUN:
        case PRON:
            phrase_obj.phrase_comp[0] = SUBJECT;
            phrase_obj.phrase_comp[1] = BA;
            phrase_obj.phrase_comp[2] = PBJECT;
            phrase_obj.phrase_comp[3] = PREDICATE;
            if (types.length > 4) {
                if (types[4] == NOUN) {
                    phrase_obj.phrase_comp[4] = COMPLEMENT;
                    sequence = [0, 3, 4, 2];
                } else {
                    phrase_obj.phrase_comp[4] = phrase_obj.phrase_type[4];
                    sequence = [0, 3, 2, 4];
                }
            } else {
                sequence = [0, 3, 2];
            }
            break;
        default:
            sequence = [2, 1];
    }
    intend = getIntend(sequence, phrase_obj);

    return intend;
}

//[被]字句 - O + 被 + (S) + V + (C)
function getIntendForEdType(phrase_obj) {
    var i, j, pos;
    var words, tags, types;
    var intend = '';
    var sequence = '';
    var ed_next = 2;

    types = phrase_obj.phrase_type;
    switch (types[ed_next]) {
        // O + 被 + V + (C)
        case VERB:
            phrase_obj.phrase_comp[0] = PBJECT;
            phrase_obj.phrase_comp[1] = ED;
            phrase_obj.phrase_comp[2] = PREDICATE;
            if (types.length > 3) {
                phrase_obj.phrase_comp[3] = COMPLEMENT;
                sequence = [2, 0, 3];
            } else {
                sequence = [2, 0];
            }
            break;
        //[被]字句 - O + 被 + (S) + V + (C)
        case NOUN:
        case PRON:
            phrase_obj.phrase_comp[0] = PBJECT;
            phrase_obj.phrase_comp[1] = ED;
            phrase_obj.phrase_comp[2] = SUBJECT;
            phrase_obj.phrase_comp[3] = PREDICATE;
            if (types.length > 4) {
                if (phrase_obj.phrase_type[4] != END) phrase_obj.phrase_comp[4] = COMPLEMENT;
                sequence = [2, 3, 0, 4];
            } else {
                sequence = [2, 3, 0];
            }
            break;
        default:
            sequence = [2, 0];
    }
    intend = getIntend(sequence, phrase_obj);

    return intend;

}

function getIntend(sequence, phrase_obj) {
    var intend = '';
    var i, max;
    var tags = [];
    var words = [];

    max = 0;
    logger.info('Sequence : ' + sequence.toString());
    for (i = 0; i < sequence.length; i++) {
        pos = sequence[i];
        if (pos > max) max = pos;
        words = phrase_obj.words[pos];
        tags = phrase_obj.tags[pos];
        for (j = 0; j < words.length; j++) {
            //if (tags[j].indexOf('v') != -1 || tags[j].indexOf('n') != -1 || tags[j].indexOf('r') != -1)　
            intend = intend + words[j];
        }
    }

    for (i = max + 1; i < phrase_obj.words.length; i++) {
        words = phrase_obj.words[i];
        tags = phrase_obj.tags[i];
        for (j = 0; j < words.length; j++) {
            //if (tags[j].indexOf('v') != -1 || tags[j].indexOf('n') != -1 || tags[j].indexOf('r') != -1) 
            intend = intend + words[j];
        }
    }
    return intend;
}

function getCommonIntend(cut_results) {
    var i = 0;
    var v_msg = '';
    var n_msgs = '';
    var tag_msg = '';
    var ret_msg = '';

    for (i = 0; i < cut_results.length; i++) {
        tag_msg = tag_msg + cut_results[i].word + cut_results[i].tag + '-';
        switch (cut_results[i].tag) {
            case 'v':
            // 特殊動詞 : 把
            case 'vba':
                v_msg = cut_results[i].word;
                break;
            case 'n':
            case 'nb':
            case 'nr':
            case 'nt':
            case 'nrfg':
            case 'nrt':
            case 'ns':
            case 'nz':
                n_msgs = n_msgs + cut_results[i].word;
                break;
            //uj *,助詞,結構助詞: 的,只有一個。,的
            //p,介詞,介詞,取英語介詞prepositional的第1個字母。,"在, 為, 對"
            case 'uj':
            case 'c':
            case 'r':
            //y,助詞,語氣詞(語氣助詞),取漢字“語”的聲母。,"呢, 吧, 嗎"
            case 'y':
            case 'p':
            //連接詞 
            case 'l':
            //副詞 
            case 'd':
            case 'ul':
            case 'zg':
            //Be動詞：是
            case 'vb':
            //使役動詞：要
            case 'vc':
            // 被動詞：被
            case 'ved':
            // 助動詞:
            case 'va':
                break;
            default:
                n_msgs = n_msgs + cut_results[i].word;
        }
        logger.info('分詞結果 : ' + JSON.stringify(cut_results[i]));
    }
    ret_msg = v_msg + n_msgs;
    ret_msg = ret_msg.replace(',', '');
    ret_msg = ret_msg.replace('，', '');

    return ret_msg;
}
module.exports = Jieba;