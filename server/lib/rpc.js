"use strict";

const chalk = require('chalk');

class Rpc {
	constructor( opts ) {
		this._opts = Object.assign({
			strict: true,
			auth: null,
			identity: ""
		}, opts);
		
		this._methods = {};
		
		this.errors = {
			parse:          { code: -32700, message: "Parse error"           }, // As defined in JSON-RPC 2.0
			invalid:        { code: -32600, message: "Invalid Request"       }, // As defined in JSON-RPC 2.0
			method:         { code: -32601, message: "Method not found"      }, // As defined in JSON-RPC 2.0
			parameters:     { code: -32602, message: "Invalid params"        }, // As defined in JSON-RPC 2.0
			internal:       { code: -32603, message: "Internal error"        }, // As defined in JSON-RPC 2.0
			server:         { code: -32000, message: "Server error"          }, // Custom
			permission:     { code: -32001, message: "Access denied"         }, // Custom
			user:           { code: -32002                                   }  // Custom
		};
	}
	
	listMethods() {
		var methods = [];
		for (var i in this._methods) {
			var method = {name: i};
			if (typeof this._methods[i].parameters !== "undefined") {
				method.parameters = this._methods[i].parameters;
			}
			methods.push(method);
		}
		return methods;
	}
	
	addMethod(name, callback, parameters=null) {
		// Sanity checks for developers adding new methods
		if (typeof name !== "string") {
			throw "Expected the method name to be a string.";
		}
		if (typeof callback !== "function") {
			throw "Expected the callback for "+name+" to be a function.";
		}
		if (callback.length !== 2) {
			throw "The callback function for "+name+" has an invalid amount of arguments.";
		}
		if (parameters === null) {
			console.log(chalk.white.bold.inverse(" RPC ")+" Warning: method "+chalk.blue(name)+" lacks a parameter specification.");
			this._methods[name] = {callback: callback};
		} else {
			if (typeof parameters !== "object") {
				throw "Expected the parameter specification for "+name+" to be either an object or an array of objects";
			}
			if (!Array.isArray(parameters)) {
				parameters = [parameters]; // Encapsulate parameter specifications in an array to allow for supplying multiple specifications
			}
			for (var i = 0; i < parameters.length; i++) {
				if (typeof parameters[i].type !== "string") {
					throw "Expected each parameter specification for "+name+" to contain a type declaration.";
				}
			}
			
			this._methods[name] = {callback: callback, parameters: parameters};
		}
		//console.log(chalk.white.bold.inverse(" RPC ")+" Registered method "+chalk.blue(name));
	}
	
	deleteMethod(name) {
		if (this._methods[name]) {
			delete this._methods[name];
			return true;
		}
		return false;
	}
	
	_checkParameters(parameters, constraints) {
		let accepted = false;
		// 1) When no parameters are supplied
		if ((parameters === null) && (constraints.type === "none")) {
			//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function accepts having no argument.");
			accepted = true;
		}
		// 2) When the function accepts a string argument
		else if ((typeof parameters === "string") && (constraints.type === "string")) {
			//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function accepts having string argument.");
			accepted = true;
		}
		// 3) When the function accepts a number argument
		else if ((typeof parameters === "number") && (constraints.type === "number")) {
			//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function accepts having number argument.");
			accepted = true;
		}
		// 4) When the function accepts a boolean argument
		else if ((typeof parameters === "boolean") && (constraints.type === "boolean")) {
			//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function accepts having boolean argument.");
			accepted = true;
		}
		// 5) When the function accepts an array
		else if ((typeof parameters === "object") && (Array.isArray(parameters)) && (constraints.type === "array")) {
			//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function accepts having array argument.");
			if (typeof constraints.contains === "string") {
				for (var i = 0; i < parameters.length; i++) {
					if (typeof parameters[i] !== constraints.contains) {
						console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Array contains item of invalid type");
						break;
					}
				}
				accepted = true;
			}
		}
		// 6) When the function accepts an object
		else if ((typeof parameters === "object") && (constraints.type === "object")) {
			//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function accepts having object argument.");
			// When the object has no constraints
			if ((typeof constraints.required === "undefined") && (typeof constraints.optional === "undefined")) {
				console.log(chalk.bgBlue.white.bold(" DEBUG ")+" No constraints set for object argument.");
				accepted = true;
			} else {
				accepted = true;
				// When the object has required parameters
				if (typeof constraints.required !== "undefined") {
					for (let item in constraints.required) {
						if (typeof parameters[item] === "undefined") {
							// And a required parameter is missing
							console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Required parameter "+item+" is missing.");
							accepted = false;
							break;
						}
						if (typeof constraints.required[item].type !== "undefined") {
							// If constraints are set for the content of the required parameter
							if (!this._checkParameters(parameters[item], constraints.required[item])) {
								// The constraints of the parameter were not met
								console.log(chalk.bgBlue.white.bold(" DEBUG ")+" The constraints of required parameter "+item+" were not met.");
								accepted = false;
								break;
							}
						}
					}
				}
				
				// Check that the object does not contain stray parameters
				for (let item in parameters) {
					if ((typeof constraints.required !== "undefined") && (item in constraints.required)) {
						// The parameter is a required parameter
						continue;
					} else if ((typeof constraints.optional !== "undefined") && (item in constraints.optional)) {
						// The parameter is an optinoal parameter
						if (typeof constraints.optional[item].type !== "undefined") {
							// If constraints are set for the content of the optional parameter
							if (!this._checkParameters(parameters[item], constraints.optional[item])) {
								// The constraints of the parameter were not met
								console.log(chalk.bgBlue.white.bold(" DEBUG ")+" The constraints of optional parameter "+item+" were not met.");
								accepted = false;
								break;
							}
						}
					} else {
						// The parameter is neither a required or an optional parameter
						console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Parameter "+item+" was not recognized as either a required or an optional parameter.");
						accepted = false;
						break;
					}
				}
			}
		}		
		//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Result:",accepted);
		return accepted;
	}
	
	
	
	async _handleRequest(request, connection=null) {		
		var response = {
			jsonrpc: "2.0"
		};
		
		if (request.id) {
			response.id = request.id;
		}

		if (
			(this._opts.strict && ((request.jsonrpc !== "2.0") || (!request.id))) ||
			(typeof request.method !== 'string')
		) {
			response.error = this.errors.invalid;
			throw response;
		}
			
		if (typeof request.params === 'undefined') {
			request.params = null;
		}
		
		var havePermission = this._opts.auth ? this._opts.auth.checkAlwaysAllow(request.method) : true;
		
		var session = null;
		if ((typeof request.token === 'string') && (this._opts.auth)) {
			session = this._opts.auth.getSession(request.token);
			if (session) {
				if (connection) {
					session.setConnection(connection);
				}
				if (!havePermission) {
					havePermission = session.checkPermissionSync(request.method);
				}
			}
		}
		
		if (!havePermission) {
			response.error = this.errors.permission;
			throw response;
		}
		
		if (typeof this._methods[request.method] !== 'object') {
			response.error = this.errors.method;
			throw response;
		}
		
		if (typeof this._methods[request.method].parameters !== "undefined") {
			//console.log(chalk.white.bold.inverse(" RPC ")+" Checking parameters for "+chalk.blue(request.method));
			
			let accepted = false;
			for (var i = 0; i < this._methods[request.method].parameters.length; i++) {
				let constraint = this._methods[request.method].parameters[i];
				if (this._checkParameters(request.params, constraint)) {
					accepted = true;
					break;
				}
			}
			if (!accepted) {
				response.error = this.errors.parameters;
				throw response;
			}
		}

		try {
			var result = await this._methods[request.method].callback(session, request.params);
			response.result = result;
		} catch (error) {
			if (typeof error==="string") {
				response.error = Object.assign({ message: error }, this.errors.user);
			} else {
				response.error = Object.assign({ raw: error }, this.errors.internal);
			}
			throw response;
		}
		return response;
	}
	
	async handle(data, connection=null) {
		var requests = null;

		if (data == "") { //Index / empty request
			let index = {
				code: 0,
				message: "Empty request received",
				service: this._opts.identity,
				methods: this.listMethods()
			};
			return JSON.stringify(index);
		}
		
		try {
			requests = JSON.parse(data);
		} catch (error) {
			console.log(chalk.bgBlue.white.bold(" DEBUG ")+"Parse error", data);
			throw JSON.stringify(this.errors.parse);
		}
		
		var singleResult = false;
		if (!Array.isArray(requests)) {
			requests = [requests];
			singleResult = true;
		}
		
		if (requests.length < 1) {
			throw JSON.stringify(this.errors.invalid);
		}
		
		var results = [];

		try {
			for (let index = 0; index<requests.length; index++) {
				var result = await this._handleRequest(requests[index], connection);
				results.push(result);
			}
		} catch (error) {
			console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function error", error);
			throw JSON.stringify(error);
		}
		
		//console.log(chalk.bgBlue.white.bold(" DEBUG ")+" Function result", results);
		return JSON.stringify( singleResult ? results[0] : results );
	}
}

module.exports = Rpc;
