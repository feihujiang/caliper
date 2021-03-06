/**
* Copyright 2017 HUAWEI All Rights Reserved.
*
* SPDX-License-Identifier: Apache-2.0
*
* @file, definition of the Sawtooth class, which implements the caliper's NBI for hyperledger sawtooth lake
*/


'use strict'

class Sawtooth {
	constructor(config_path) {
		this._config_path = config_path;
	}

	gettype() {
		return 'sawtooth';
	}

	init() {
		// todo: sawtooth
		return Promise.resolve();
	}

	installSmartContract() {
		// todo:        
	}

	getContext() {
		return Promise.resolve();

	}

	releaseContext(context) {

	}

	invokeSmartContract(context, contractID, contractVer, args, timeout) {
		const address = calculateAddresses(contractID, args)
		const batchBytes = createBatch(contractID, contractVer, address, args)
		return submitBatches(batchBytes)
	}

	queryState(context, contractID, contractVer, queryName) {		
		return querybycontext(context, contractID, contractVer, queryName)
	}

	getDefaultTxStats(results) {

	}
}

module.exports = Sawtooth;

const restApiUrl = 'http://127.0.0.1:8080'

function querybycontext(context, contractID, contractVer, name) {
	const address = calculateAddress(contractID, name)
	console.log('getState address:' + address)
	return getState(address)
}

function getState(address) {
	var invoke_status = {
			status       : 'created',
			time_create  : process.uptime(),
			time_valid   : 0,
			result       : null
	};

	const stateLink = restApiUrl + '/state?address=' + address
	var options = {
			uri: stateLink
	}
	return request(options)
	.then(function(body) {
		console.log('getState request response:')
		console.log(body)
		let stateData = (JSON.parse(body))["data"][0]["data"]
		console.log('stateData: ' + stateData)
		if(body.length > 0) {
			invoke_status.time_valid = process.uptime();
			invoke_status.result     = stateData;
			invoke_status.status     = 'success';
			return Promise.resolve(invoke_status);
		}
		else {
			throw new Error('no query responses');
		}
	})
	.catch(function (err) {
		console.log('Query failed, ' + (err.stack?err.stack:err));
		return Promise.resolve(invoke_status);
	})
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function submitBatches(batchBytes) {
	console.log('in submitBatches')

	var invoke_status = {
		id           : 0,
		status       : 'created',
		time_create  : process.uptime(),
		time_valid   : 0,
		time_endorse : 0,
		time_order   : 0,
		result       : null
	};
	const request = require('request-promise')
	var options = {
		method: 'POST',
		url: restApiUrl + '/batches',
		body: batchBytes,
		headers: {'Content-Type': 'application/octet-stream'}
	}
	return request(options)	
	.then(function (body) {
		console.log(body)
		let link = JSON.parse(body).link
		return getBatchStatus(link, invoke_status)
//		console.log('invoke_status: ' + JSON.stringify(invoke_status))
	})
	.catch(function (err) {
		console.log('Submit batches failed, ' + (err.stack?err.stack:err))
		return Promise.resolve(invoke_status);
	})
}

var getIndex = 0
function getBatchStatus(link, invoke_status) {
	getIndex++
	let statusLink = link
	console.log('getBatchStatus: ' + getIndex)
	var intervalID = 0
	var timeoutID = 0

	var repeat = (ms, invoke_status) => {
		return new Promise((resolve) => {
			intervalID = setInterval(function(){					
				return getBatchStatusByRequest(resolve, statusLink, invoke_status, intervalID, timeoutID)
			}, ms)

		})
	}

	var timeout = (ms, invoke_status) => {
		return new Promise((resolve) => {
			timeoutID = setTimeout(function(){
				console.log('timeout')
				clearInterval(intervalID )
				console.log('setTimeout invoke_status: ' + JSON.stringify(invoke_status))
				return resolve(invoke_status);
			}, ms)
		})
	}


	return  Promise.race([repeat(500, invoke_status), timeout(30000, invoke_status)])
	.then(function () {
		console.log('repeat end or timeout')
		return Promise.resolve(invoke_status);
	})
	.catch(function(error) {
//		console.log('getBatchStatus error: ' + error)
		return Promise.resolve(invoke_status);
	})
}

var timeoutID = 0
const request = require('request-promise')
var requestIndex = 0

function getBatchStatusByRequest(resolve, statusLink, invoke_status, intervalID, timeoutID) {
	requestIndex++
	console.log('getBatchStatusByRequest: ' + requestIndex)
	var options = {
		uri: statusLink
	}
	return request(options)
	.then(function(body) {
		console.log('request response')
		let batchStatuses = JSON.parse(body).data
		let hasPending = false
		for (let index in batchStatuses){
			let batchStatus = batchStatuses[index].status
			console.log('batchStatus: ' + batchStatus)
			if (batchStatus == 'PENDING'){
				hasPending = true
				break
			}
		}
		if (hasPending != true){
			console.log('invoke_status.status success')
			invoke_status.status = 'success';
			invoke_status.time_valid = process.uptime();
			clearInterval(intervalID)
			clearTimeout(timeoutID)
			return resolve(invoke_status);
		}
	})
	.catch(function (err) {
//		console.log(err)
		return resolve(invoke_status);
	})
}

function calculateAddress(family, name) {

	const crypto = require('crypto')

	const _hash = (x) =>
	crypto.createHash('sha512').update(x).digest('hex').toLowerCase()

	const INT_KEY_NAMESPACE = _hash(family).substring(0, 6)
	let address = INT_KEY_NAMESPACE + _hash(name).slice(-64)
	return address
}

function calculateAddresses(family, args) {
	const crypto = require('crypto')

	const _hash = (x) =>
	crypto.createHash('sha512').update(x).digest('hex').toLowerCase()

	const INT_KEY_NAMESPACE = _hash(family).substring(0, 6)
	let addresses = []

	for (let index in args){
		let arg = args[index]
		for(let key in arg) {
			console.log('key: ' + key)
			console.log('arg[key]: ' + arg[key])
			let address = INT_KEY_NAMESPACE + _hash(arg[key]).slice(-64)
			addresses.push(address)        	
		}
	}
	return addresses
}

function createBatch(contractID, contractVer, addresses, args) {
	const cbor =  require('cbor')
	const {signer} = require('sawtooth-sdk')
	const privateKey = signer.makePrivateKey()
	const {TransactionEncoder} = require('sawtooth-sdk')


	const encoder = new TransactionEncoder(privateKey, {
		familyName: contractID,
		familyVersion: contractVer,
		inputs: addresses,
		outputs: addresses,
		payloadEncoding: 'application/cbor',
		payloadEncoder: cbor.encode
	})

	let states = {}	
	for (let index in args){
		let arg = args[index]
		for(let key in arg) {
			states[key] = arg[key]       	
		}
	}
	const txn = encoder.create(states)	

	const {BatchEncoder} = require('sawtooth-sdk')
	const batcher = new BatchEncoder(privateKey)

	const batch = batcher.create([txn])
	console.log('batch.headerSignature: ' + batch.headerSignature)
	let link = restApiUrl + '/batch_status?id=' + batch.headerSignature 
	const batchBytes = batcher.encode([batch])
	return batchBytes
}
