/**
 * Tiny.cc REST API v3 client
 * 
 * This client works with tiny.cc URL shortening services using API v3.
 * 
 * Require jQuery at least v1.8 for deferred object functionality.
 * 
 * @copyright	2015 Tiny.cc
 * @author		Alexey Gorshunov <ag@blazing.pro>
 * @license		MIT
 * @package		tinycc_client
 */
 
/**
 * Constructor
 */
function tinycc_client(config)
{
	if(!config){
		throw "Missing required params";
	}
	
	if(!config.api_root_url){
		throw "Missing api_root_url";
	}
	config.api_root_url = config.api_root_url.replace(/\/$/,'');

	if(!config.username){
		throw "Missing username";
	}

	if(!config.api_key){
		throw "Missing api_key";
	}

	for(var i in config){
		if(config.hasOwnProperty(i)){
			this.config[i] = config[i];
		}
	}
	
	this.config.ajax_options.headers = {
		"Authorization": "Basic " + btoa(config.username + ":" + config.api_key)
	}
};


tinycc_client.prototype = {
	config: {
		batch_operations_limit: 30,
		parallel_streams: 4,
		ajax_options:{
			dataType:"json",
			processData: false,
			cache: false
		},
		version: "3.1"
	},
	
	current_selection:{type:null,arg:null},
	working_domain:null,
	
/**
 * Change working domain (if not used, all operations performed for default domain)
 * @param	string 	domain
 * @return	void
 */	
	set_working_domain: function(domain)
	{
		this.working_domain = domain;
	},
	
	account_info: function()
	{
		return this._simple_api_call("GET","account");
	},	
	
	shorten: function(long_url, data)
	{
		var new_data = jQuery.extend(true, {long_url:long_url}, data);
		return this._simple_api_call("POST","urls",null,{"urls":[new_data]});
	},
	
	read_page: function(params)
	{
		var self = this;
		var start_time = Date.now();
		
		if(!params)params = {};
		params.limit = params.limit ? params.limit : this.config.batch_operations_limit;
		params.offset = params.offset ? params.offset : 0;
		
		var calls = params.limit/this.config.batch_operations_limit;
		var urls = [], results_count = 0;
	
		var promises = [];
		var queue = $.when();
		for(var i=0;i<calls;i++){
			var call_params = jQuery.extend(true, jQuery.extend(true, {},params) , {
					offset: params.offset + i*this.config.batch_operations_limit,
					limit: Math.min(this.config.batch_operations_limit, params.limit-i*this.config.batch_operations_limit)
				});
			promises.push(this._simple_api_call("GET","urls",call_params));
		}
		
		var response = {
			urls: urls,
			page: {
				results_count: 0,
				total_count: 0,
				offset: params.offset
			}
		};
		
		return $.when.apply($, promises).then(function(){
			
			var call_results;
			var args_array = calls<=1 ? [arguments] : arguments;
			for(var j=0;j<args_array.length;j++){
				var result = args_array[j][0];
				
				if(result['version'] != self.config.version){
					var message = "Version of client ("+self.config.version+") doesn't match version of API ("+result['version']+")";
					return $.Deferred().reject({error:{message:message}}).promise();
				}

				call_results = result['urls'];
				for(u in call_results){
					response.urls.push(call_results[u]);
				}
				response.page.total_count = result['page'].total_count;
				response.page.results_count += call_results.length;
			}

			response['meta'] = {'request_time': (Date.now() - start_time)/1000};
			return response;		
			
		},function(result){
			var response = result.responseJSON;
			response['meta'] = {'request_time': (Date.now() - start_time)/1000};
			return response;
		});

	},	
	
	mass_shorten: function(long_urls, data)
	{
		var self = this;
		var callback = function(portion){
			var urls = [];
			var new_data;
			for(var i=0;i<portion.length;i++){
				urls.push(jQuery.extend(true, {long_url:portion[i]}, data));
			};
			return self._simple_api_call("POST","urls",null,{"urls":urls});
		};
		return this._mass_api_call(long_urls, callback, "urls");
	},	
	
	tags: function()
	{
		return this._simple_api_call("GET","tags");
	},

	domains: function()
	{
		return this._simple_api_call("GET","domains");
	},
	
	create_tag: function(label)
	{
		return this._simple_api_call("POST","tags",{},{label:label});
	},

	delete_tag: function(label)
	{
		return this._simple_api_call("DELETE","tags/"+label);
	},
	
	select_with_hashes: function(hashes)
	{
		this.current_selection.type="hashes";
		this.current_selection.arg=hashes;
		return this;
	},
	
	select_with_tags: function(tags)
	{
		this.current_selection.type="tags";
		this.current_selection.arg=tags;
		return this;
	},
	
	read: function(params)
	{
		if(!this.current_selection.type || !this.current_selection.arg){
			throw "URLs not selected";
		}
		
		if(!params){
			params = {};
		}
		
		if(this.current_selection.type == 'hashes'){
			if(this.current_selection.arg.length == 1){
				return this._simple_api_call("GET","urls",{hashes:this.current_selection.arg[0]});
			}else{
				var self = this;
				var callback = function(portion){
					return self._simple_api_call("GET","urls",{hashes:portion.join(",")});
				};
				return this._mass_api_call(this.current_selection.arg, callback, "urls");
			}
		}else if(this.current_selection.type == 'tags'){
			params.tags = this.current_selection.arg;
			return this.read_page(params);
		}
	},
	
	edit: function(data)
	{
		if(!this.current_selection.type || !this.current_selection.arg){
			throw "URLs not selected";
		}

		if(this.current_selection.type == 'hashes'){
			if(this.current_selection.arg.length == 1){
				return this._simple_api_call("PATCH","urls",{hashes:this.current_selection.arg[0]},{"urls":[data]});
			}else{
				var self = this;
				var callback = function(portion){
					return self._simple_api_call("PATCH","urls",{hashes:portion.join(",")},{"urls":[data]});
				};
				return this._mass_api_call(this.current_selection.arg, callback, "urls");
			}
		}else if(this.current_selection.type == 'tags'){
			return this._simple_api_call("PATCH","urls",{tags:this.current_selection.arg},{"urls":[data]});
		}
	},
	
	delete: function()
	{
		if(!this.current_selection.type || !this.current_selection.arg){
			throw "URLs not selected";
		}

		if(this.current_selection.type == 'hashes'){
			if(this.current_selection.arg.length == 1){
				return this._simple_api_call("DELETE","urls",{hashes:this.current_selection.arg[0]});
			}else{
				var self = this;
				var callback = function(portion){
					return self._simple_api_call("DELETE","urls",{hashes:portion.join(",")});
				};
				return this._mass_api_call(this.current_selection.arg, callback);
			}
		}else if(this.current_selection.type == 'tags'){
			return this._simple_api_call("DELETE","urls",{tags:this.current_selection.arg});
		}

		
	},
	
	reset_stats: function()
	{
		if(!this.current_selection.type || !this.current_selection.arg){
			throw "URLs not selected";
		}

		if(this.current_selection.type == 'hashes'){
			if(this.current_selection.arg.length == 1){
				return this._simple_api_call("DELETE","stats",{hashes:this.current_selection.arg[0]});
			}else{
				var self = this;
				var callback = function(portion){
					return self._simple_api_call("DELETE","stats",{hashes:portion.join(",")});
				};
				return this._mass_api_call(this.current_selection.arg, callback);
			}
		}else if(this.current_selection.type == 'tags'){
			return this._simple_api_call("DELETE","stats",{tags:this.current_selection.arg});
		}		
		
		
	},
	
	_simple_api_call: function(method, resource, getparams, postparams)
	{
		var url = this.config.api_root_url+"/"+resource; 
		var request = this.config.ajax_options;
		request.type = method;
		
		if(this.working_domain){
			if(getparams){
				getparams.domain = this.working_domain;
			}else{
				getparams = {domain:this.working_domain};
			}
		}
		
		if(getparams){
			url += "?";
			var args=[];
			for(var i in getparams){
				args.push(encodeURI(i)+"="+encodeURI(getparams[i]));
			}
			url += args.join("&");
		};
		request.url = url;
		
		if(postparams){
			request.data = JSON.stringify(postparams);
			request.contentType = "application/json";
		};
		
		return $.ajax(request);
	},
	
/**
 * Promice returned by this method do not support "progress" indication!
 */	
	_mass_api_call: function(items, callback, sort_results_by, is_recursion)
	{
		var start_time = Date.now();
		var self = this;
		var portion;
		var next_promise = $.when();
		var portion_promises = [];
		var portions;
		var item_index=0;
		
		portions = [];
		for(var u=0;u<self.config.parallel_streams && item_index<items.length;u++){
			portion = [];
			for(var i=0;i<self.config.batch_operations_limit && item_index<items.length;i++,item_index++){
				portion.push(items[item_index]);
			}
			
			portions.push(callback.call(self, portion)); // pushes Ajax deferred object for batch call
		}
		
		return $.when.apply($, portions).then(function(){
			var arg1 = [];
		
			if(typeof arguments[0] == 'object' 
					&& !(arguments[0] instanceof Array)){
				var t=[]
				for(var i in arguments){
					t.push(arguments[i]);
				}
				arg1.push(t);
			}else{
				for(var i in arguments){
					arg1.push(arguments[i]);
				}
			}
			
			if(arg1[0][0]['version'] != self.config.version){
				var message = "Version of client ("+self.config.version+") doesn't match version of API ("+arg1[0][0]['version']+")";
				return $.Deferred().reject({error:{message:message}}).promise();
			}
			
			if(item_index<items.length){
				return self._mass_api_call(items.slice(item_index),callback, sort_results_by, true)
					.then(function(){
						var res = arg1;
						
						if(arguments.length == 1	
							&& typeof arguments[0] == 'object' 
							&& arguments[0] instanceof Array
							&& typeof arguments[0][0] == 'object' 
							&& arguments[0][0] instanceof Array){
							for(var i in arguments[0]){
								res.push(arguments[0][i]);
							}
						}else{
							for(var i in arguments){
								res.push(arguments[i]);
							}
						}
						
						return res;
				});
			}else{
				return arg1;
			}
		})
		.then(function(results){
			if(is_recursion){
				return results;
			}
			
			var response = {
				error: self.empty_error(),
				meta: {'request_time': (Date.now() - start_time)/1000}
			};
			
			if(sort_results_by){
				var sorted = [];
				try{
					for(var i in results){
						for(var u in results[i][0][sort_results_by]){
							sorted.push(results[i][0][sort_results_by][u]);
						}
					}
				}catch(ex){
					// ignore
				}
			}
			
			response[sort_results_by] = sorted;
			
			return response;
		})
		.fail(function(result){
			return result.responseJSON
		});
	},
	
	empty_error: function()
	{
		return {'code':0,'message':'','details':''};
	}
	
};
