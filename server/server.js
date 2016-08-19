/*
	server层
	博客推荐
*/

//引入依赖
var cheerio = require('cheerio'),
	superagent = require('superagent'),
	VoteBlogServer = require('../controller/voteblog'),
	async = require('async'),
	Config = require('../config/config'); //配置文件

//请求头
var base_headers = {
		Accept: 'application/json, text/javascript, */*; q=0.01',
		'Accept-Encoding': 'gzip, deflate, br',
		'Accept-Language': 'zh-CN,zh;q=0.8',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
		'Content-Type': 'application/json; charset=UTF-8',
		Host: 'passport.cnblogs.com',
		Origin: 'https://passport.cnblogs.com',
		Pragma: 'no-cache',
		Referer: 'https://passport.cnblogs.com/user/signin?ReturnUrl=http%3A%2F%2Fwww.cnblogs.com%2F',
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36',
		'X-Requested-With': 'XMLHttpRequest'
	},
	origin = 'http://www.cnblogs.com', //主网站url
	passport = 'https://passport.cnblogs.com', //用户管理url
	urls = {
		origin: 'http://www.cnblogs.com/', //主网站
		do_signin: passport + '/user/signin', //进行登录url
		init_sigPage: passport + '/user/signin', //登录界面url
		vote_blog: origin + '/mvc/vote/VoteBlogPost.aspx' //博客推荐url 
	},
	CNBlogs_cookie = '', //通过登录验证之后服务器返回的cookie
	isSignined = false, //是否登录
	is_vote = false, //是否推荐
	login_data = {}, //登陆数据
	startDate = ''; //爬虫开始时间

//访问登录页
function visitSigninPage(server_res) {
	startDate = new Date(); //开始时间

	return new Promise(function(fullfile, rejected) {
		superagent
			.get(urls.init_sigPage)
			.end(function(err, res) {
				if (err) rejected(err);
				else {
					var parms = [res, server_res];
					fullfile(parms)
				}
			})
	})
}

//得到token
function get_Token(text) {
	var verification_token = text.match(/'VerificationToken': \'([^\"]*)\'/)[0] //token
		.split(/'VerificationToken':/g)[1]
		.split(/},/g)[0].split(/\'/)[1];

	return verification_token;
}

//登录
function doSignin(parms) {
	[response, server_res] = parms;
	var data = null;

	server_res.write('<p>登录中...</p>')
		//判断是否登录
	if (isSignined) {
		return new Promise(function(fullfile, rejected) {
			var data = {
					text: '{success:"true",message:"你已经登录!"}'
				},
				parms = [data, server_res];

			server_res.write(data.text + '<hr>');

			fullfile(parms);
		})
	}

	var text = response.text,
		verification_token = get_Token(text), //token
		post_data = JSON.stringify(login_data).replace(/\s+/g, '+'); //登录数据

	return new Promise(function(fullfile, rejected) {
		superagent
			.post(urls.do_signin)
			.set(base_headers) //不写会返回{"success":false,"message":"系统检测到异常，暂不允许登录"}
			.set('Cookie', 'AspxAutoDetectCookieSupport=1') //不写会出现302 redirect 错误 
			.set('VerificationToken', verification_token) //凭证
			.set('Content-Length', Buffer.byteLength(post_data))
			.type('json') //json格式传输
			.send(post_data)
			.redirects(0) //防止页面重定向
			.end(function(err, res) {
				if (err) {
					rejected(err);
				} else {
					var isSuccess = JSON.parse(res.text).success;

					if (isSuccess) {
						server_res.write(res.text + '<hr>');

						isSignined = isSignined || true;

						//通过登录验证之后服务器返回的cookie
						CNBlogs_cookie = CNBlogs_cookie || res.headers['set-cookie'].join().match(/(.CNBlogsCookie=.+?);/)[0];

						var parms = [data, server_res];
						fullfile(parms);
					} else rejected(res);
				}
			})
	})
}

//博客推荐
function diggBlog(parms) {
	if (is_vote) {
		return new Promise(function(fullfile, rejected) {
			fullfile(parms);
		})
	}

	[articleUrls, server_res] = parms;

	var diggDatas = VoteBlogServer.formatDiggData(articleUrls, is_vote);

	return new Promise(function(fullfile, rejected) {

		//并发推荐之后进行处理
		VoteBlogServer.afterVoteArticle(startDate, server_res);

		//使用async控制并发量 2
		//每次只投5票
		async.mapLimit(diggDatas, Config.curCount, function(diggData, callback) {
			VoteBlogServer.diggBlog(diggData, callback, server_res, urls.vote_blog, CNBlogs_cookie);
		}, function(err, result) {
			fullfile(server_res);
		})
	})
}

//博客取消推荐
function removeVote(parms) {
	if (!is_vote) {
		return new Promise(function(fullfile, rejected) {
			fullfile(parms);
		})
	}

	[articleUrls, server_res] = parms;

	var diggDatas = VoteBlogServer.formatDiggData(articleUrls, is_vote);

	return new Promise(function(fullfile, rejected) {

		//并发取消推荐之后进行处理
		VoteBlogServer.afterAbonVoArticle(startDate, server_res);

		//使用async控制并发量 Config.curCount
		//每次只投 Cofig.curCount 票
		async.mapLimit(diggDatas, Config.curCount, function(diggData, callback) {
			VoteBlogServer.abonDiggBlog(diggData, callback, server_res, urls.vote_blog, CNBlogs_cookie);
		}, function(err, result) {
			fullfile(server_res);
		})
	})
}


module.exports = function(parms, server_res, isVote) {
	//登录数据赋值
	login_data = parms,
		is_vote = isVote;

	visitSigninPage(server_res)
		.then(doSignin) //登陆
		.then(VoteBlogServer.getBlogUrls) //得到要推荐的文章
		.then(diggBlog) //推荐
		.then(removeVote) //取消推荐
		.then(function(server_res) {
			console.log('end')
		})
		.catch(function(err) {
			if (err.text) {
				server_res.write(err.text)
				server_res.end("<hr>")
			}
			server_res.write(err)
		})
}