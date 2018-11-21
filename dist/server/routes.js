module.exports = function(app){
	app.set('view engine', 'ejs');

	app.get('/',function(request,response){
		response.render(__dirname + './../client/index.ejs');
  });
  
};