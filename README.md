## 简介
在login-cnblogs https://github.com/Tsqle/login-cnblogs 基础上加上了博客园的文章推荐与取消推荐的功能  


#### 配置方式
1. 在config/passport.json 文件中配置用户登录信息(remember: true 记住密码,remember: false 不记住密码)      
2. 在config/config.js 文件中配置代理参数  

#### 运行方式
1. node app.js 或者 npm start  
2. 访问url  
   推荐:http://127.0.0.1:8000/cnblogs/vote  
   取消推荐:http://127.0.0.1:8000/cnblogs/abandonVote  
