var http = require('http');
var fs = require('fs');
var finalHandler = require('finalhandler');
var queryString = require('querystring');
var Router = require('router');
var bodyParser   = require('body-parser');
var uid = require('rand-token').uid;
const PORT = 3001;
const TOKEN_VALIDITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
var failedLoginAttempts = {};


// State holding variables
var brands = [];
var users = [];
var accessTokens = [];
var products = {};

//function so the cart can be empty after every test
const resetCart = function(){
   users.forEach(function(user){
       return user.cart = []
   })
}


// Setup router
var myRouter = Router();
myRouter.use(bodyParser.json());

let server = http.createServer(function (request, response) {
    myRouter(request, response, finalHandler(request, response))
}).listen(PORT, (error) => {
    if (error) {
      return console.log('Error on Server Startup: ', error)
    }

    //Reads the products.JSON file
    fs.readFile('initial-data/products.json', 'utf8', function (error, data) {
        if (error) throw error;
        products = JSON.parse(data);
        console.log(`Server setup: ${products.length} products loaded`);
    });

    //Reads the brands.JSON file
    fs.readFile('initial-data/brands.json', 'utf8', function (error, data) {
      if (error) throw error;
      brands = JSON.parse(data);
      console.log(`Server setup: ${brands.length} brands loaded`);
    });

    //Reads the users.JSON file
    fs.readFile('initial-data/users.json', 'utf8', function (error, data) {
      if (error) throw error;
      users = JSON.parse(data);
      console.log(`Server setup: ${users.length} users loaded`);
      module.exports = users
    });
    
    //console log so I know server is up and running
    console.log(`Server is listening on ${PORT}`);
  });  


// First route to the brands. Should return all brand names of sunglasses
myRouter.get('/api/brands', function(request,response) {
    response.writeHead(200, { "Content-Type": "application/json" });
	return response.end(JSON.stringify(brands))
});

// Routes to products in specific brand. Should return all products with the brand name the user requested of sunglasses
myRouter.get('/api/brands/:id/products', function(request,response) {

    //finds the correct brand id requested
    const productsWithSearchedBrand = products.filter((product=>product.categoryId == request.params.id))

    //if array is empty the id did not exist
    if (productsWithSearchedBrand.length === 0) {
        // If there isn't a store with that id, then return a 404
        response.writeHead(404, "Brand ID could not be found");
        return response.end();
    }

    response.writeHead(200, { "Content-Type": "application/json" });
	// Return all products of specific brand
	return response.end(JSON.stringify(productsWithSearchedBrand))
});


// Return all productsin the db
myRouter.get('/api/products', function(request,response) {

    //parsing URL to find keyword searched
    let parsedUrl = require('url').parse(request.url,true)
    let keyword = parsedUrl.query.keyword

    //if no keyword then it will return all the products
    if (!keyword){
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify(products)) 
    }

    //makes key word all caps so it will match when searched
    keyword = keyword.toUpperCase()

    //check to see if they searched a brand name
    const isTheKeyWordABrand = brands.filter(function(brand){
        const brandName = brand.name.toUpperCase()
        return brandName.includes(keyword)
    })

    //if it matches a brand then it will return only products with that brand name
    if (isTheKeyWordABrand.length !== 0){
        const productsWithSearchedBrand = products.filter((product=>product.categoryId == isTheKeyWordABrand[0].id))
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify(productsWithSearchedBrand))
    }

    //combines all the strings in the product together and makes uppercase so it can match with keyword
    const productsWithKeyword = products.filter(function(product){
        let combinedDescription = product.name + ' ' + product.description + ' ' + product.price + ' ' + product.imageUrls
        combinedDescriptionInCaps = combinedDescription.toUpperCase()
        return combinedDescriptionInCaps.includes(keyword)
    })

    //returns array of products that include keyword
    if (productsWithKeyword.length !== 0){ 
        response.writeHead(200, { "Content-Type": "application/json" });
	    return response.end(JSON.stringify(productsWithKeyword))
    }

    //if brands or products do not match search, sends error message
    response.writeHead(404, "Product that match that search word could not be found");
    return response.end(JSON.stringify(productsWithKeyword))

});

// Helpers to get/set our number of failed requests per username
var getNumberOfFailedLoginRequestsForUsername = function(username) {
    let currentNumberOfFailedRequests = failedLoginAttempts[username];
    if (currentNumberOfFailedRequests) {
      return currentNumberOfFailedRequests;
    } else {
      return 0;
    }
}
  
var setNumberOfFailedLoginRequestsForUsername = function(username,numFails) {
    failedLoginAttempts[username] = numFails;
}

// Posts login and returns access Token
myRouter.post('/api/login', function(request,response) {

    //Check if both username and password were entered
    if (request.body.username && request.body.password && getNumberOfFailedLoginRequestsForUsername(request.body.username) < 3) {
        
        //search to see if username and password match
        let user = users.find((user)=>{
        return user.login.username == request.body.username && user.login.password == request.body.password;
        });

        //if user is found. We need to return current token or create new token
        if (user){

            // If we found a user, reset our counter of failed logins
            setNumberOfFailedLoginRequestsForUsername(request.body.username,0);
            
            //user successfully logged status
            response.writeHead(200, { "Content-Type": "application/json" });

            // We have a successful login, if we already have an existing access token, use that
            let currentAccessToken = accessTokens.find((tokenObject) => {
            return tokenObject.username == user.login.username;
            });

            // Update the last updated value so we get another time period
            if (currentAccessToken) {
                currentAccessToken.lastUpdated = new Date();
                return response.end(JSON.stringify(currentAccessToken.token));

            }else{

                //creates new access token when login is successful
                let newAccessToken = {
                    username: user.login.username,
                    lastUpdated: new Date(),
                    token: uid(16)
                }

                //pushes token to accessToken array to store current tokens
                accessTokens.push(newAccessToken);
                return response.end(JSON.stringify(newAccessToken.token));
            }

        }else {
            // Update the number of failed login attempts
            let numFailedForUser = getNumberOfFailedLoginRequestsForUsername(request.body.username);
            setNumberOfFailedLoginRequestsForUsername(request.body.username,++numFailedForUser);

            // When incorrect username or password is entered
            response.writeHead(401, "Invalid username or password");
            return response.end();
        }

    }else {
        //when no username or password is entered
        response.writeHead(404, "Incorrectly formatted username or password");
        return response.end();
        }
});


var getValidTokenFromRequest = function(request) {
    var parsedUrl = require('url').parse(request.url,true)
    if (parsedUrl.query.accessToken) {
      // Verify the access token to make sure its valid and not expired
      let currentAccessToken = accessTokens.find((accessToken) => {
        return accessToken.token == parsedUrl.query.accessToken && ((new Date) - accessToken.lastUpdated) < TOKEN_VALIDITY_TIMEOUT;
      });
      if (currentAccessToken) {
        return currentAccessToken;
      } else {
        return null;
      }
    } else {
      return null;
    }
  };

// Return all products in a logins cart
myRouter.get('/api/me/cart', function(request,response) {
    //verifying token
    let currentAccessToken = getValidTokenFromRequest(request);
    //must login in to get cart
    if (!currentAccessToken) {
        // If there isn't an access token in the request, we know that the user isn't logged in, so don't continue
        response.writeHead(401, "You need to log in to recieve cart information");
        return response.end();
    }else{
        //search to see if username and password match
        let user = users.find((user)=>{
        return user.login.username == currentAccessToken.username
    });
    
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(user.cart))
   }
});

// adds item to cart
myRouter.post('/api/me/cart', function(request,response) {
    //verifying token
    let currentAccessToken = getValidTokenFromRequest(request);
    //must login in to get cart
    if (!currentAccessToken) {
        // If there isn't an access token in the request, we know that the user isn't logged in, so don't continue
        response.writeHead(401, "You need to log in to add item to cart");
        return response.end();
    }else{
        //Check if the product and the quanity are both in the request with correct properties
        if (!request.body.quanity || !request.body.product || !request.body || typeof request.body !== 'object' || !request.body.product.name || !request.body.product.price || !request.body.product.id) {
            response.writeHead(400, "Cannot add without object containing both the product and the quanity");	
            return response.end();
        }

        //if no value or a negative value or a decimal passed it should return an error
        const quanity = request.body.quanity
        if (isNaN(quanity) || quanity <= 0 || request.body.quanity % 1 !== 0){
            // If there isn't an new quanity in the parameter, we can not edit the quanity
            response.writeHead(404, "Invalid quanity amount was given. Quanity must be a number");
            return response.end(); 
        }

        //Search to find the correct user cart
        let user = users.find((user)=>{
            return user.login.username == currentAccessToken.username
        })

        //Search to see if the product they want to add is already in the cart
        let isProductAlreadyInTheCart = user.cart.find((item)=>{
            return item.product.id === request.body.product.id
        })

        if (isProductAlreadyInTheCart ){
            //if the product is in the cart, its should send error message
            response.writeHead(405, "Cannot add, product is aleady in cart");	
            return response.end();
        }

        //if the product is not already in the cart it pushes the product sent into the cart array
        user.cart.push(request.body)

        //Gives user success status and sends back the new user cart
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify(user.cart))
    };
});

myRouter.delete('/api/me/cart/:productId', function(request,response) {
    //verifying token
    let currentAccessToken = getValidTokenFromRequest(request);
    //must login in to get cart
    if (!currentAccessToken) {
        // If there isn't an access token in the request, we know that the user isn't logged in, so don't continue
        response.writeHead(401, "You need to log in to delete an item from cart");
        return response.end();
    }else{

        //Search to find the correct user cart
        let user = users.find((user)=>{
            return user.login.username == currentAccessToken.username
        })

        // Verify that the product exists to know if we should continue processing
        let product = user.cart.find((item) => {
            return item.product.id == request.params.productId;
        });

        if (!product) {
            // If there isn't a product with that id, then return a 404
            response.writeHead(404, "That product cannot be found");
            return response.end();
        }

        //Search cart to find product wanting to be deleted 
        user.cart = user.cart.filter((item)=>{
            return item.product.id !== request.params.productId
        })

        //Gives user success status and sends back the new user cart
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify(user.cart))

    }
})

//edit quanities in cart
myRouter.post('/api/me/cart/:productId', function(request,response) {
    //verifying token
    let currentAccessToken = getValidTokenFromRequest(request);
    //must login in to get cart
    if (!currentAccessToken) {
        // If there isn't an access token in the request, we know that the user isn't logged in, so don't continue
        response.writeHead(401, "You need to log in to edit an item's quanity in cart");
        return response.end();
    }else{
        //Search to find the correct user cart
        let user = users.find((user)=>{
            return user.login.username == currentAccessToken.username
        })
        //parsing URL to find new Quanity and converting it to a number 
        var parsedUrl = require('url').parse(request.url,true)
        const quanity = parseInt(parsedUrl.query.quanity)

        //if no value or a negative value or a decimal passed it should return an error
        if (!quanity || isNaN(quanity) || quanity <= 0 || parsedUrl.query.quanity % 1 !== 0){
            // If there isn't an new quanity in the parameter, we can not edit the quanity
            response.writeHead(404, "Invalid quanity. Quanity must be a number");
            return response.end(); 
        }else{
        //Search cart to find product wanting to be deleted 
        let itemToEdit = user.cart.find((item)=>{
            return item.product.id === request.params.productId
        })
        
        //Sets the quanity to the new value
        itemToEdit.quanity = quanity

        //Gives user success status and sends back the new user cart
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify(user.cart))
        }
    }
})



module.exports = { server, resetCart, setNumberOfFailedLoginRequestsForUsername}





