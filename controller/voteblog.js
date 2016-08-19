/*
	controller层
	推荐文章、取消推荐文章
*/
var cheerio = require('cheerio'),
	async = require('async'),
	superagent = require('superagent'),
	EventProxy = require('eventproxy'),
	Config = require('../config/config'); //代理配置

var ep = new EventProxy(), //eventproxy实例
	indexUrl = 'http://www.cnblogs.com/', //首页地址
	startPgNum = Config.startPgNum, //操作开始页数
	endPgNum = Config.endPgNum, //操作结束页数
	count = 0, //控制并发数
	resQueue = []; //结果队列

//得到博客Url
exports.getBlogUrls = function(parms) {
	[data, server_res] = parms;

	var pageUrls = [], //列表页Url
		articleUrls = []; //文章地址url

	//存放文章列表url
	for (var i = startPgNum; i <= endPgNum; i++) {
		pageUrls.push('http://www.cnblogs.com/?CategoryId=808&CategoryType=%22SiteHome%22&ItemListActionName=%22PostList%22&PageIndex=' + i + '&ParentCategoryId=0');
	}

	server_res.write('<p>推荐文章页码:&nbsp;<span style="color:red">'+ startPgNum +' ~ ' + endPgNum +'</span><br>要推荐的文章数量:<span style="color:red">' + pageUrls.length * 20 + '</span></p><hr>')
	//查询所有文章
	var funArray = formProxyFun(pageUrls, articleUrls);

	return new Promise(function(fullfile, rejected) {
		async.series(funArray, function(err, result) {
			if (err)
				rejected(err)
			else {
				var parms = [result, server_res];
				fullfile(parms);
			}
		})
	})
}

//拼装执行函数队列
function formProxyFun(pageUrls, articleUrls) {
	var funQueue = [];

	pageUrls.forEach(function(pageUrl) {
		var fun = function(callback) {
			superagent
				.get(pageUrl)
				.end(function(err, res) {
					var $ = cheerio.load(res.text),
						blogUrls = $(".titlelnk"),
						curPg_articleUrls = [];

					for (var i = 0; i < blogUrls.length; i++) {
						var articleUrl = blogUrls.eq(i).attr('href');

						curPg_articleUrls.push(articleUrl);
						articleUrls.push(articleUrl);
					}
					callback(null, curPg_articleUrls);
				})
		}

		funQueue.push(fun);
	})

	return funQueue;
}

//解析文章url为推荐数据
exports.formatDiggData = function(articleUrls, isAbandoned) {
	var diggDatas = [];

	articleUrls.forEach(function(urls) {
		urls.forEach(function(url) {

			var diggData = {
				blogApp: url.split('/')[3], //博客名称
				postId: url.split('/')[5].split('.')[0], //博客ID
				isAbandoned: isAbandoned, //是否取消
				voteType: 'Digg', //推荐方式
				url: url
			};

			diggDatas.push(diggData);
		})
	})

	return diggDatas;
}

//推荐文章
exports.diggBlog = function(diggData, callback, server_res, vote_blog, CNBlogs_cookie) {
	//并发量加1
	count++;
	//延迟毫秒数
	var delay = parseInt((Math.random() * 3000000) % 1000);

	server_res.write('<p>现在推荐的博客是&nbsp;<span style="color:red">' + diggData.url + '</span>&nbsp;...</p>');

	//进行推荐
	superagent
		.post(vote_blog)
		.set("Referer", diggData.url)
		.set('Cookie', CNBlogs_cookie)
		.type('json')
		.send(JSON.stringify(diggData))
		.end(function(err, res) {
			if (err) {
				console.log(err)
				server_res.write('<p><span style="color:red">' + diggData.url + '</span>&nbsp;操作失败！</p>');
			} else {
				server_res.write('<p><span style="color:red">' + diggData.url + '</span>&nbsp;' + JSON.parse(res.text).Message + '</p>')

				var resObj = {
					blogApp: diggData.blogApp,
					msg: JSON.parse(res.text).Message
				}

				ep.emit('VoteArticle', resObj);
			}
		})

	setTimeout(function() {
		count--;
		callback(null, diggData.url + '  finished...');
	}, delay);
}

//推荐之后
exports.afterVoteArticle = function(startDate,server_res) {
	ep.after('VoteArticle', (endPgNum - startPgNum + 1) * 20, function(result) {
		//分析推荐结果
		function analyVoteResult(resQueue) {
			var len = resQueue.length,
				resData = {
					successNum: 0,
					alreadyNum: 0,
					failureNum: 0
				}

			for (var i = 0; i < len; i++) {
				var resObj = resQueue.shift(),
					msg = resObj.msg;

				if (msg == '推荐成功') {
					resData.successNum++;
				} else if (msg == '您已经推荐过') {
					resData.alreadyNum++;
				} else {
					resData.failureNum++;
				}
			}

			return resData;
		}

		var data = analyVoteResult(result), //结果数据
			endDate = new Date(); //结束时间

		server_res.write('<hr><h2>统计结果</h2><hr>');
		server_res.write('1、开始时间：' + startDate.toLocaleDateString() + " " + startDate.toLocaleTimeString() + '<br/>');
		server_res.write('2、结束时间：' + endDate.toLocaleDateString() + " " + endDate.toLocaleTimeString() + '<br/>');
		server_res.write('3、耗时：' + (endDate - startDate) + 'ms' + ' --> ' + (Math.round((endDate - startDate) / 1000 / 60 * 100) / 100) + 'min <br/>');
		server_res.write('4、推荐成功的文章数目：' + data.successNum + '<br/>');
		server_res.write('5、您已经推荐过的文章数目：' + data.alreadyNum + '<br/>');
		server_res.write('6、推荐失败的文章数目：' + data.failureNum + '<br/>');
		server_res.write('<hr><p style="text-align:center">Create By liuyh</p>')

	})
}

//取消推荐文章
exports.abonDiggBlog = function(diggData, callback, server_res, vote_blog, CNBlogs_cookie) {
	//并发量加1
	count++;
	//延迟毫秒数
	var delay = parseInt((Math.random() * 3000000) % 1500);

	server_res.write('<p>现在取消推荐的博客是&nbsp;<span style="color:red">' + diggData.url + '</span>&nbsp;...</p>');

	superagent
		.post(vote_blog)
		.set("Referer", diggData.url)
		.set('Cookie', CNBlogs_cookie)
		.type('json')
		.send(JSON.stringify(diggData))
		.end(function(err, res) {
			if (err) {
				console.log(err)
				server_res.write('<p><span style="color:red">' + diggData.url + '</span>&nbsp;操作失败！</p>');
			} else {
				server_res.write('<p><span style="color:red">' + diggData.url + '</span>&nbsp;' + JSON.parse(res.text).Message + '</p>')

				var resObj = {
					blogApp: diggData.blogApp,
					msg: JSON.parse(res.text).Message
				}

				ep.emit('AbonVoteArticle', resObj);
			}
		})

	setTimeout(function() {
		count--;
		callback(null, diggData.url + '  finished...');
	}, delay);
}

//推荐之后
exports.afterAbonVoArticle = function(startDate,server_res) {
	ep.after('AbonVoteArticle', (endPgNum - startPgNum + 1) * 20, function(result) {
		//分析取消推荐结果
		function analyAbonResult(resQueue) {
			var len = resQueue.length,
				resData = {
					successNum: 0,
					alreadyNum: 0,
					noDiggNum: 0,
					failureNum: 0
				}

			for (var i = 0; i < len; i++) {
				var resObj = resQueue.shift(),
					msg = resObj.msg;

				if (msg == '成功取消推荐') {
					resData.successNum++;
				} else if (msg == '您已进行取消操作') {
					resData.alreadyNum++;
				} else if (msg == '未推荐过该内容') {
					resData.noDiggNum++;
				} else {
					resData.failureNum++;
				}
			}

			return resData;
		}

		var data = analyAbonResult(result), //结果数据
			endDate = new Date(); //结束时间

		server_res.write('<hr><h2>统计结果</h2><hr>');
		server_res.write('1、开始时间：' + startDate.toLocaleDateString() + " " + startDate.toLocaleTimeString() + '<br/>');
		server_res.write('2、结束时间：' + endDate.toLocaleDateString() + " " + endDate.toLocaleTimeString() + '<br/>');
		server_res.write('3、耗时：' + (endDate - startDate) + 'ms' + ' --> ' + (Math.round((endDate - startDate) / 1000 / 60 * 100) / 100) + 'min <br/>');
		server_res.write('4、成功取消推荐的文章数目：' + data.successNum + '<br/>');
		server_res.write('5、您已进行取消操作的文章数目：' + data.alreadyNum + '<br/>');
		server_res.write('6、未推荐的文章数目：' + data.noDiggNum + '<br/>');
		server_res.write('7、取消推荐失败的文章数目：' + data.failureNum + '<br/>');
		server_res.write('<hr><p style="text-align:center">Create By liuyh</p>')
	})
}