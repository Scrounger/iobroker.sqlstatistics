'use strict';

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");

let connected = null;

class Sqlstatistics extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		// @ts-ignore
		super({
			...options,
			name: 'sqlstatistics',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		if (this.config.sqlInstance) {

			// subscribe on sql instance connection to show connection state to instance
			this.subscribeForeignStates(`${this.config.sqlInstance}.info.connection`);

			// Check connection to instance
			connected = await this.checkConnection();

			this.updateStatistic();
		}
	}

	async updateStatistic() {
		try {
			if (connected) {
				let instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`)

				if (instanceObj && instanceObj.native) {
					if (instanceObj.native.dbtype !== 'sqlite') {
						this.log.info(`SQL History Statistic connected with '${this.config.sqlInstance}'. Updating statistics...`);
						

					} else {
						this.log.warn(`Database type 'SQLite3' is not supported!`);
					}
				} else {
					this.log.error(`Instance object 'system.adapter.${this.config.sqlInstance}' not exist!`);
				}
			} else {
				this.log.warn(`Instance '${this.config.sqlInstance}' has no connection to database!`);
			}
		} catch (err) {
			this.log.error(`[updateStatistic] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	async checkConnection() {
		// check connection to sql instance on load
		let instanceIsConnected = await this.getForeignStateAsync(`${this.config.sqlInstance}.info.connection`);
		if (instanceIsConnected && instanceIsConnected.val) {
			this.setState('info.connection', Boolean(instanceIsConnected.val), instanceIsConnected.ack);
			return Boolean(instanceIsConnected.val);
		} else {
			this.setState('info.connection', false, true);
			return false;
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.setState('info.connection', Boolean(state.val), state.ack);
			connected === Boolean(state.val);
		} else {
			// The state was deleted
			this.setState('info.connection', false, true);
			connected === false;
		}
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Sqlstatistics(options);
} else {
	// otherwise start the instance directly
	new Sqlstatistics();
}