"use strict";

const mime = require('mime-types');

class Persons {
	constructor(opts) {
		this._opts = Object.assign({
			database: null,
			table: 'persons',
			table_address: 'person_address',
			table_bankaccount: 'person_bankaccount',
			table_email: 'person_email',
			table_phone: 'person_phone',
			table_group_mapping: 'person_group_mapping',
			table_group: 'person_group',
			files: null
		}, opts);
		if (this._opts.database == null) {
			print("The persons module can not be started without a database!");
			process.exit(1);
		}
		this._table               = this._opts.database.table(this._opts.table);
		this._table_address       = this._opts.database.table(this._opts.table_address);
		this._table_bankaccount   = this._opts.database.table(this._opts.table_bankaccount);
		this._table_email         = this._opts.database.table(this._opts.table_email);
		this._table_phone         = this._opts.database.table(this._opts.table_phone);
		this._table_group_mapping = this._opts.database.table(this._opts.table_group_mapping);
		this._table_group         = this._opts.database.table(this._opts.table_group);
	}
	
	list(session, params={}) {
		return this._table.list(params).then((result) => {
			var promises = [];
			for (var i in result) {
				promises.push(this._getFile(result[i].avatar_id));
			}
			return Promise.all(promises).then((resultArray) => {
				for (var i in resultArray) {
					result[i].avatar = null;
					if (resultArray[i].file !== null) {
						result[i].avatar = {
							data: resultArray[i].file.toString('base64'),
							mime: mime.lookup(resultArray[i].filename.split('.').pop())
						};
					}
				}
				return Promise.resolve(result);
			});
		});
	}
	
	_getFile(id) {
		if (this._opts.files === null) {
			return new Promise((resolve, reject) => {
				return resolve(null);
			});
		}
		return this._opts.files.getFile(id);
	}

	details(session, id) {
		return new Promise((resolve, reject) => {
			if(typeof id !== 'number') return reject("Invalid parameter: please provide the id of a person");
			return this._table.selectRecords({"id":parseInt(id)}).then((records) => {
				if (records.length > 1) return reject("Duplicate id error!");
				var result = records[0].getFields();
				return this._getFile(result.avatar_id).then((avatar_res) => {
					if (avatar_res.file !== null) {
						result.avatar = {
								data: avatar_res.file.toString('base64'),
								mime: mime.lookup(avatar_res.filename.split('.').pop())
							};
					}
					return this._table_address.selectRecords({'person_id':id}).then((address_res) => {
						var addresses = [];
						for (var i in address_res) {
							addresses.push(address_res[i].getFields());
						}
						result.address = addresses;
						return this._table_bankaccount.selectRecords({'person_id':id}).then((bankaccount_res) => {
							var bankaccounts = [];
							for (var i in bankaccount_res) {
								bankaccounts.push(bankaccount_res[i].getFields());
							}
							result.bankaccount = bankaccounts;
							return this._table_email.selectRecords({'person_id':id}).then((email_res) => {
								var email = [];
								for (var i in email_res) {
									email.push(email_res[i].getFields());
								}
								result.email = email;
								return this._table_phone.selectRecords({'person_id':id}).then((phone_res) => {
									var phone = [];
									for (var i in phone_res) {
										phone.push(phone_res[i].getFields());
									}
									result.phone = phone;
									return this._table_group_mapping.selectRecords({'person_id':id}).then((group_res) => {
										console.log("GROUP_MAP", group_res);
										result.group = [];
										if (group_res.length < 1 ) {
											console.log("NOGRP", result);
											return resolve(result);
										}
										var promises = [];
										for (var i in group_res) {
											promises.push(this._table_group.selectRecords({'id':group_res[i].getField('person_group_id')}));
										}
										return Promise.all(promises).then((results) => {
											for (var i in results) {
												for (var j in results[i]) {
													result.group.push(results[i][j].getFields());
												}
											}
											return resolve(result);
										});
									});
								});
							});
						});
					});
				});
			});
		});
	}
	
	getAddress(id) {
		return new Promise((resolve, reject) => {
			if (typeof id !== 'number') return reject("Invalid parameter");
			this._table_address.selectRecords({'id':id}).then((address_res) => {
				if (address_res.length<1) return reject("Not found");
				return resolve(address_res[0].getFields());
			});
		});
	}
	
	/*add(session, params) {
		return new Promise((resolve, reject) => {
			if((params.length > 2) || (params.length < 1)) return reject("invalid parameter count");
			var nick_name = params[0];
			var member = false;
			if ((params.length == 2) && params[1]) member = true;
			if (typeof nick_name != "string") return reject("Param 1 (nick_name) should be string.");
			
			this.find([nick_name]).then((existing_persons) => {
				if (existing_persons.length>0) {
					return reject("The nickname '"+nick_name+"' has already been registered. Please pick another nickname.");
				} else {
					var record = this._table.createRecord();
					record.setField('nick_name', nick_name);
					record.setField('first_name', '');
					record.setField('last_name', '');					
					resolve(record.flush());
				}
			}).catch((error) => { reject(error); });
		});
	}*/
	
	registerRpcMethods(rpc, prefix="person") {
		if (prefix!="") prefix = prefix + "/";
		rpc.addMethod(prefix+"list", this.list.bind(this));
		rpc.addMethod(prefix+"details", this.details.bind(this));
		rpc.addMethod(prefix+"address/get", this.getAddress.bind(this));
		//rpc.addMethod(prefix+"add", this.add.bind(this));
	}
}

module.exports = Persons;
