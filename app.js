/*
	主程序
*/

var Server = require('./server/server');
	http = require('http'),
	Express = require('express'),
	bodyParser = require('body-parser')
	app = new Express(),
	conf = require('./config/passport.json'); //代理配置

//将form data数据转化成json对象
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));

//推荐文章页面
app.use('/cnblogs/vote',function(req,res){
	res.sendFile(__dirname + '/vote.html');
})

//取消推荐文章页面
app.use('/cnblogs/abandonVote',function(req,res){
	res.sendFile(__dirname + '/abandon_vote.html');
})

//得到登录数据
app.get('/getLoginData', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	res.json(conf);
})

//进行推荐
app.post('/doVote', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	var isVote = false; //是否推荐

	if (req.body) {
		Server({
			input1: req.body.ecy_acc,
			input2: req.body.ecy_pwd,
			remember: Boolean(req.body.remember)
		}, res,isVote);
	} else {
		res.json({
			success: false,
			msg: '系统错误!'
		})
	}
})

//取消推荐
app.post('/abandonVote', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	var isVote = true; //是否推荐

	if (req.body) {
		Server({
			input1: req.body.ecy_acc,
			input2: req.body.ecy_pwd,
			remember: Boolean(req.body.remember)
		}, res,isVote);
	} else {
		res.json({
			success: false,
			msg: '系统错误!'
		})
	}
})

http.createServer(app).listen(8000, function(err) {
	if (err) console.log(err)
	else
		console.log('==============> Listening on port is %s', 8000);
})