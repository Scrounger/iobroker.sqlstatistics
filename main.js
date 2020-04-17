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
let SQLFuncs = null;
let usedDatapoints = null;

const dbNames = [
	'ts_number',
	'ts_counter',
	'ts_string',
	'ts_bool'
];

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

			//TODO: interval einfügen

			let objList = await this.getForeignObjectsAsync(`${this.name}.${this.instance}.total.*|${this.name}.${this.instance}.databases.*`);

			this.log.info(JSON.stringify(objList));

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

						usedDatapoints = [];
						let updateStart = new Date().getTime();

						SQLFuncs = await require(__dirname + '/lib/' + instanceObj.native.dbtype);

						let databaseList = await this.getQueryResult(SQLFuncs.getDatabases());

						if (databaseList && Object.keys(databaseList).length > 0) {
							let totalSize = 0;
							let totalRows = 0;

							for (const database of databaseList) {
								if (!database.name.includes("_schema")) {
									let idDatabasePrefix = `databases.${database.name}`;
									let databaseRows = 0;

									// store database statistics
									totalSize = totalSize + database.size;
									this.setMyState(`${idDatabasePrefix}.size`, database.size, true, { dbname: database.name, name: "size of database", unit: 'MB' });

									// table statistics
									let databaseTableList = await this.getQueryResult(SQLFuncs.getTablesOfDatabases(database.name));
									if (databaseTableList && Object.keys(databaseTableList).length > 0) {
										for (const table of databaseTableList) {
											let idTablePrefix = `${idDatabasePrefix}.${table.name}`;

											this.setMyState(`${idTablePrefix}.size`, table.size, true, { dbname: database.name, name: "size of table", unit: 'MB' });

											let rowsCount = await this.getQueryResult(SQLFuncs.getRowsCountOfTable(database.name, table.name));
											databaseRows = databaseRows + rowsCount[0].rows;

											this.setMyState(`${idTablePrefix}.rows`, rowsCount[0].rows, true, { dbname: database.name, name: "rows in table", unit: '' });

											if (database.name === instanceObj.native.dbname) {
												await this.createIobSpecialTableStatistic(table, idTablePrefix, instanceObj);
											}
										}
									}
									
									this.setMyState(`${idDatabasePrefix}.rows`, databaseRows, true, { dbname: database.name, name: "rows in database", unit: '' });
									totalRows = totalRows + databaseRows;
								}
							}

							// store total sql statistics
							await this.createStatisticObjectNumber(`total.size`, "total size of all databases", 'MB');
							this.setMyState(`total.size`, totalSize, true);

							await this.createStatisticObjectNumber(`total.rows`, "total rows of all databases", '');
							this.setMyState(`total.rows`, totalRows, true);

							// TODO alte DPs löschen
							this.log.info(usedDatapoints.join(","));

							let updateEnd = new Date().getTime();
							let duration = Math.round(((updateEnd - updateStart) / 1000) * 100) / 100;

							this.setState(`lastUpdate`, updateEnd, true);
							this.setState(`lastUpdateDuration`, duration, true);

							await this.deleteUnsedObjects();

							this.log.info(`Successful updating statistics in ${duration}s! `);
						}
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


	/**
	 * @param {{ name: string; size: number}} table
	 * @param {string} idTablePrefix
	 * @param {ioBroker.Object} instanceObj
	 */
	async createIobSpecialTableStatistic(table, idTablePrefix, instanceObj) {
		let brokenRows = 0;
		let brokenRowsList = [];

		if (table.name === 'datapoints') {
			// table datapoints -> check if Ids exist in Iob
			let tableDatapoints = await this.getQueryResult(SQLFuncs.getRowsFromIobTableDatapoints(instanceObj.native.dbname));

			if (tableDatapoints && Object.keys(tableDatapoints).length > 0) {
				for (const row of tableDatapoints) {

					let iobObj = await this.getForeignObjectAsync(row.name);
					if (!iobObj) {
						// Object not exist in IoB -> row is broken
						brokenRows++;
						brokenRowsList.push({ id: row.id, name: row.name, existInIoBroker: false });
					} else if (iobObj && iobObj.common) {
						if (!iobObj.common.custom || (iobObj.common.custom && !iobObj.common.custom[this.config.sqlInstance])) {
							// Object exist in IoB but have no custom property for the current instance -> row is broken
							brokenRows++;
							brokenRowsList.push({ id: row.id, name: row.name, existInIoBroker: true });
						}
					}
				}
			}
		} else {
			// ohter iob tables
			let tableDatapoints = await this.getQueryResult(SQLFuncs.getRowsFromIobTables(instanceObj.native.dbname, table.name));

			if (tableDatapoints && Object.keys(tableDatapoints).length > 0) {
				for (const row of tableDatapoints) {
					if (dbNames.includes(table.name)) {
						if (row.dead === 1) {
							brokenRows = brokenRows + row.count;
							brokenRowsList.push({ id: row.id });
						}
					}
				}
			}
		}

		if (dbNames.includes(table.name) || table.name === 'datapoints') {
			await this.createStatisticObjectNumber(`${idTablePrefix}.brokenRows`, 'broken rows in table', '');
			this.setMyState(`${idTablePrefix}.brokenRows`, brokenRows, true);

			await this.createStatisticObjectString(`${idTablePrefix}.brokenRowsIds`, "ids of broken rows in table");
			if (brokenRowsList.length > 0) {
				this.setMyState(`${idTablePrefix}.brokenRowsIds`, JSON.stringify(brokenRowsList), true);
			} else {
				this.setMyState(`${idTablePrefix}.brokenRowsIds`, 'none', true);
			}
		}
	}

	async deleteUnsedObjects() {
		if (this.config.deleteObjects) {
			let objList = await this.getObjectListAsync({ startkey: 'databases' });


		}
	}

	/**
	 * @param {string} id
	 * @param {any} value
	 * @param {boolean} ack
	 * @param {object} options
	 */
	setMyState(id, value, ack, options = undefined) {
		if (options) {
			if (!this.config.blackListDatabases.includes(options.dbname)) {
				this.createStatisticObjectNumber(id, options.name, options.unit);
				this.setState(id, value, ack);
				usedDatapoints.push(id);
			}
		} else {
			this.setState(id, value, ack);
			usedDatapoints.push(id);
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
	 * @param {string} query
	 */
	async getQueryResult(query) {
		return new Promise((resolve, reject) => {
			this.sendTo(this.config.sqlInstance, 'query', query, function (result) {
				if (result && !result.error) {
					resolve(result.result);
				} else {
					resolve(null);
				}
			});
		});
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 * @param {any} unit
	 */
	async createStatisticObjectNumber(id, name, unit) {
		let adapter = this;
		this.setObjectNotExists(id, {
			type: 'state',
			common: {
				name: name,
				desc: 'sql statistic',
				type: 'number',
				unit: unit,
				read: true,
				write: false
			},
			native: {}
		}, function (err, obj) {
			if (!err && obj) adapter.log.debug('[updateStatistic] statistic object ' + id + ' created');
		});
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createStatisticObjectString(id, name) {
		let adapter = this;
		this.setObjectNotExists(id, {
			type: 'state',
			common: {
				name: name,
				desc: 'sql statistic',
				type: 'string',
				read: true,
				write: false
			},
			native: {}
		}, function (err, obj) {
			if (!err && obj) adapter.log.debug('[updateStatistic] statistic object ' + id + ' created');
		});
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