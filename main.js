'use strict';

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const words = require('./admin/words.js');
const schedule = require('cron').CronJob;

// Load your modules here, e.g.:
// const fs = require("fs");

let connected = null;
let SQLFuncs = null;
let usedDatapoints = null;
let updateIsRunning = false;
let language = 'en';
let _ = null;

const dbNames = [
	'ts_number',
	'ts_counter',
	'ts_string',
	'ts_bool'
];


let availableData = null;

let blacklist = {

}

class Sqlstatistics extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sqlstatistics'
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

			// language for Tranlation
			var sysConfig = await this.getForeignObjectAsync('system.config');
			if (sysConfig && sysConfig.common && sysConfig.common['language']) {
				language = sysConfig.common['language']
			}

			// language Function
			/**
			 * @param {string | number} string
			 */
			_ = function (string) {
				if (words[string]) {
					return words[string][language]
				} else {
					return string;
				}
			}

			// subscribe on sql instance connection to show connection state to instance
			this.subscribeForeignStates(`${this.config.sqlInstance}.info.connection`);
			this.subscribeStates(`update`);

			// Check connection to instance
			connected = await this.checkConnection();

			let adapter = this;
			setInterval(function () {
				adapter.updateDatabaseStatistic();
			}, this.config.updateIntervalDatabases * 3600000);

			setInterval(function () {
				adapter.updateStatistic();
			}, this.config.updateIntervalStatistics * 60000);


			this.resetSessionStatistics();

			await this.getAvailableData();

			await this.updateStatistic();
			await this.updateDatabaseStatistic();
		}
	}

	async resetSessionStatistics() {

		if (this.config.resetSessionStatistics) {
			new schedule('0 0 * * *', async () => {
				try {
					if (connected) {
						let instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`)

						if (instanceObj && instanceObj.native) {
							if (instanceObj.native.dbtype !== 'sqlite') {

								SQLFuncs = await require(__dirname + '/lib/' + instanceObj.native.dbtype);
								let result = await this.getQueryResult(SQLFuncs.resetSessionStatistics());

								this.log.info('Reset of session statistics successful!');

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
					this.log.error(`[resetSessionStatistics] error: ${err.message}, stack: ${err.stack}`);
				}
			}).start();
		}
	}

	async getAvailableData() {
		try {
			if (connected) {
				availableData = {};

				let instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`)

				if (instanceObj && instanceObj.native) {
					SQLFuncs = await require(__dirname + '/lib/' + instanceObj.native.dbtype);

					this.getAvailableDataFromObject(await this.getQueryResult(SQLFuncs.getDatabases()), 'databases', instanceObj.native.dbtype);

					if (this.config.enableglobalStatus || this.config.enablesessionStatus) {
						let infoList = await this.getQueryResult(SQLFuncs.getSystemOrSessionInfos());

						if (this.config.enableglobalStatus) {
							this.getAvailableDataFromObject(infoList, 'globalStatus', instanceObj.native.dbtype);
						}

						if (this.config.enablesessionStatus) {
							this.getAvailableDataFromObject(infoList, 'sessionStatus', instanceObj.native.dbtype);
						}
					}

					if (this.config.enableclients) {
						this.getAvailableDataFromObject(await this.getQueryResult(SQLFuncs.getClientStatistics(1)), 'clients', instanceObj.native.dbtype);
					}


					let updateObj = await this.getObjectAsync('info');
					if (updateObj) {
						updateObj.native = availableData;

						await this.setObjectAsync('info', updateObj);
						this.log.info(`Successful updating avaiable objects lists!`);
					} else {
						this.log.error(`datapoint '${this.namespace}.info' not exist!`);
					}

				} else {
					this.log.error(`Instance object 'system.adapter.${this.config.sqlInstance}' not exist!`);
				}
			} else {
				this.log.warn(`Instance '${this.config.sqlInstance}' has no connection to database!`);
			}
		} catch (err) {
			this.log.error(`[getAvailableData] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * @param {Array<object>} list
	 * @param {string | number} name
	 * @param {string} dbType
	 */
	getAvailableDataFromObject(list, name, dbType) {
		this.log.info(`[${dbType}] Updating available objects for '${name}' ...`);

		if (list && Object.keys(list).length > 0) {
			if (!availableData[name]) {
				availableData[name] = [];
			}

			for (const item of list) {
				if ((blacklist[name] && !blacklist[name].includes(item.name)) || !blacklist[name]) {

					if (name === 'clients') {
						for (const [key, subValue] of Object.entries(item)) {
							availableData[name].push(key);
						}
					} else {
						availableData[name].push(item.name);
					}
				}
			}
		} else {
			this.log.error(`[${dbType}] list of ${name} is '${JSON.stringify(list)}'. Please report this issue to the developer!`);
		}
	}

	async updateDatabaseStatistic() {
		try {
			updateIsRunning = true;

			if (connected) {
				let instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`)

				if (instanceObj && instanceObj.native) {
					if (instanceObj.native.dbtype !== 'sqlite') {
						this.log.info(`updating statistics for database provider '${instanceObj.native.dbtype}'...`);

						usedDatapoints = [`databases.rows`, `databases.size`, `databases.tables`];
						let updateStart = new Date().getTime();

						SQLFuncs = await require(__dirname + '/lib/' + instanceObj.native.dbtype);

						let databaseList = await this.getQueryResult(SQLFuncs.getDatabases());

						if (databaseList && Object.keys(databaseList).length > 0) {
							this.log.debug(`[${instanceObj.native.dbtype}] list of databases received, ${Object.keys(databaseList).length} databases exists`);
							let totalSize = 0;
							let totalRows = 0;
							let totalTables = 0;

							for (const database of databaseList) {
								try {
									this.log.debug(`[${instanceObj.native.dbtype}] creating statistics for database '${database.name}'`);

									let idDatabasePrefix = `databases.${database.name}`;
									let databaseRows = 0;
									let iobBrokenRows = 0;

									// store database statistics
									totalSize = totalSize + database.size;
									this.setMyState(`${idDatabasePrefix}.size`, database.size, true, instanceObj, { dbname: database.name, name: "size of database", unit: 'MB' });

									totalTables = totalTables + database.tables;
									this.setMyState(`${idDatabasePrefix}.tables`, database.tables, true, instanceObj, { dbname: database.name, name: "count of tables of database", unit: '' });

									// table statistics
									let databaseTableList = await this.getQueryResult(SQLFuncs.getTablesOfDatabases(database.name));
									if (databaseTableList && Object.keys(databaseTableList).length > 0) {
										this.log.debug(`[${instanceObj.native.dbtype}] tables list of database '${database.name}' received, ${Object.keys(databaseTableList).length} tables exists`);

										for (const table of databaseTableList) {
											try {
												this.log.debug(`[${instanceObj.native.dbtype}] creating statistics for table '${table.name}' of database '${database.name}'`);

												let idTablePrefix = `${idDatabasePrefix}.${table.name}`;

												this.setMyState(`${idTablePrefix}.size`, table.size, true, instanceObj, { dbname: database.name, name: "size of table", unit: 'MB', isTable: true });

												let rowsCount = await this.getQueryResult(SQLFuncs.getRowsCountOfTable(database.name, table.name));
												if (rowsCount && rowsCount[0] && (rowsCount[0].rows || rowsCount[0].rows === 0)) {
													databaseRows = databaseRows + rowsCount[0].rows;
													this.setMyState(`${idTablePrefix}.rows`, rowsCount[0].rows, true, instanceObj, { dbname: database.name, name: "rows in table", unit: '', isTable: true });
												} else {
													if (!table.name.toLowerCase().includes('innodb_')) {
														this.log.warn(`[updateDatabaseStatistic] database: '${database.name}', table: '${table.name}' rowsCount is '${JSON.stringify(rowsCount)}'`);
													} else {
														this.log.debug(`[updateDatabaseStatistic] database: '${database.name}', table: '${table.name}' rowsCount is '${JSON.stringify(rowsCount)}'`);
													}
													this.setMyState(`${idTablePrefix}.rows`, 0, true, instanceObj, { dbname: database.name, name: "rows in table", unit: '', isTable: true });
												}

												if (database.name === instanceObj.native.dbname) {
													let brokenRows = await this.createIobSpecialTableStatistic(database, table, idTablePrefix, instanceObj);

													// @ts-ignore
													iobBrokenRows = iobBrokenRows + brokenRows;
												}
											} catch (tableErr) {
												this.log.error(`[updateDatabaseStatistic] database: '${database.name}', table: '${table.name}' error: ${tableErr.message}, stack: ${tableErr.stack}`);
											}
										}
									} else {
										this.log.error(`[${instanceObj.native.dbtype}] tables list of database '${database.name}' is ${JSON.stringify(databaseTableList)}. Please report this issue to the developer!`);
									}

									this.setMyState(`${idDatabasePrefix}.rows`, databaseRows, true, instanceObj, { dbname: database.name, name: "rows in database", unit: '' });
									totalRows = totalRows + databaseRows;

									if (database.name === instanceObj.native.dbname) {
										this.setMyState(`${idDatabasePrefix}.brokerRows`, iobBrokenRows, true, instanceObj, { dbname: database.name, name: "broken rows in database", unit: '' });
									}

								} catch (dbErr) {
									this.log.error(`[updateDatabaseStatistic] database: '${database.name}' error: ${dbErr.message}, stack: ${dbErr.stack}`);
								}
							}

							// store total sql statistics
							await this.createStatisticObjectNumber(`databases.size`, _("total size of all databases"), 'MB');
							this.setState(`databases.size`, Math.round(totalSize), true);

							await this.createStatisticObjectNumber(`databases.rows`, _("count of rows of all databases"), '');
							this.setState(`databases.rows`, totalRows, true);

							await this.createStatisticObjectNumber(`databases.tables`, _("count of tables of all databases"), '');
							this.setState(`databases.tables`, totalTables, true);

							
							let updateEnd = new Date().getTime();
							let duration = Math.round(((updateEnd - updateStart) / 1000) * 100) / 100;

							this.setState(`lastUpdate`, updateEnd, true);
							this.setState(`lastUpdateDuration`, duration, true);

							await this.deleteUnsedObjects();

							this.log.info(`Successful updating databases statistics in ${duration}s! `);
						} else {
							this.log.error(`[${instanceObj.native.dbtype}] list of databases is ${JSON.stringify(databaseList)}. Please report this issue to the developer!`);
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

			updateIsRunning = false;
		} catch (err) {
			this.log.error(`[updateDatabaseStatistic] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	async updateStatistic() {
		try {
			updateIsRunning = true;

			if (connected) {
				let instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`)

				if (instanceObj && instanceObj.native) {
					if (instanceObj.native.dbtype !== 'sqlite') {
						await this.createSystemOrSessionStatistic(instanceObj, this.config.enableglobalStatus);
						await this.createSystemOrSessionStatistic(instanceObj, this.config.enablesessionStatus, true);
						await this.createClientStatistic(instanceObj);
					} else {
						this.log.warn(`Database type 'SQLite3' is not supported!`);
					}
				} else {
					this.log.error(`Instance object 'system.adapter.${this.config.sqlInstance}' not exist!`);
				}
			} else {
				this.log.warn(`Instance '${this.config.sqlInstance}' has no connection to database!`);
			}

			updateIsRunning = false;
		} catch (err) {
			this.log.error(`[updateSystemStatistic] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * @param {ioBroker.Object} instanceObj id des native points
	 */
	async createClientStatistic(instanceObj) {
		try {
			if (this.config.enableclients) {
				this.log.info(`updating client statistics for database provider '${instanceObj.native.dbtype}'...`);

				SQLFuncs = await require(__dirname + '/lib/' + instanceObj.native.dbtype);

				let clientInfos = await this.getQueryResult(SQLFuncs.getClientStatistics());
				if (clientInfos && Object.keys(clientInfos).length > 0) {
					this.log.debug(`[${instanceObj.native.dbtype}] client statistics received, ${Object.keys(clientInfos).length} values exists`);

					for (var i = 0; i <= clientInfos.length - 1; i++) {
						if (clientInfos[i]) {
							let idPrefix = `clients.${i}`

							for (const [key, value] of Object.entries(clientInfos[i])) {
								if (this.config.clients.includes(key)) {
									if (key.includes('memory')) {
										await this.createStatisticObjectNumber(`${idPrefix}.${key.toLowerCase()}`, _(key.replace(/_/g, " ")), 'MB');
										await this.setStateAsync(`${idPrefix}.${key.toLowerCase()}`, Math.round(parseFloat(value) / 1024 / 1024 * 100) / 100, true);

									} else if (key.includes('latency')) {
										await this.createStatisticObjectNumber(`${idPrefix}.${key.toLowerCase()}`, _(key.replace(/_/g, " ")), 'ms');
										await this.setStateAsync(`${idPrefix}.${key.toLowerCase()}`, Math.round(parseFloat(value) / 1000 / 1000 / 1000 * 100) / 100, true);

									} else if (isNaN(value)) {
										await this.createStatisticObjectString(`${idPrefix}.${key.toLowerCase()}`, _(key.replace(/_/g, " ")));
										await this.setStateAsync(`${idPrefix}.${key.toLowerCase()}`, value, true);

									} else {
										await this.createStatisticObjectNumber(`${idPrefix}.${key.toLowerCase()}`, _(key.replace(/_/g, " ")), '');
										await this.setStateAsync(`${idPrefix}.${key.toLowerCase()}`, parseFloat(value), true);
									}
								} else {
									if (await this.getObjectAsync(`${this.namespace}.${idPrefix}.${key.toLowerCase()}`)) {
										await this.delObjectAsync(`${this.namespace}.${idPrefix}.${key.toLowerCase()}`);
									}
								}
							}
						}
					}
					this.log.info(`Successful updating clientstatistics!`);
				} else {
					this.log.error(`[${instanceObj.native.dbtype}] client statistics is ${JSON.stringify(clientInfos)}. Please report this issue to the developer!`);
				}
			} else {
				let exisitingObj = await this.getForeignObjectsAsync(`${this.namespace}.clients.*`);
				for (const key of Object.keys(exisitingObj)) {
					await this.delObjectAsync(key);
				}
			}
		} catch (err) {
			this.log.error(`[createClientStatistic] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * @param {ioBroker.Object} instanceObj
	 * @param {Boolean} isSession
	 */
	async createSystemOrSessionStatistic(instanceObj, enabled, isSession = false) {
		try {
			if (enabled) {
				this.log.info(`updating ${isSession ? 'session' : 'system'} statistics for database provider '${instanceObj.native.dbtype}'...`);

				SQLFuncs = await require(__dirname + '/lib/' + instanceObj.native.dbtype);

				let avaiableInfos = await this.getQueryResult(SQLFuncs.getSystemOrSessionInfos(isSession));
				if (avaiableInfos && Object.keys(avaiableInfos).length > 0) {
					this.log.debug(`[${instanceObj.native.dbtype}] ${isSession ? 'session' : 'system'} statistics received, ${Object.keys(avaiableInfos).length} values exists`);

					for (const info of avaiableInfos) {

						if (info && info.name && info.value) {
							if (isSession) {
								setInfoStates(this, info, this.config.sessionStatus, this.config.enablesessionStatus, isSession);
							} else {
								setInfoStates(this, info, this.config.globalStatus, this.config.enableglobalStatus, isSession);
							}
						}

						/**
						 * @param {object} adapter
						 * @param {object} info
						 * @param {string[]} selectedInfosList
						 * @param {boolean} enabled
						 * @param {boolean} isSession
						 */
						async function setInfoStates(adapter, info, selectedInfosList, enabled, isSession) {
							if (selectedInfosList.includes(info.name)) {
								// this.log.info(parseFloat(info.value).toString());

								if (isNaN(info.value)) {
									await adapter.createStatisticObjectString(`${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`, _(info.name.replace(/_/g, " ")));
									await adapter.setStateAsync(`${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`, info.value, true);
								} else {

									if (info.name.toLowerCase().includes('bytes')) {
										await adapter.createStatisticObjectNumber(`${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`, _(info.name.replace(/_/g, " ")), 'MB');
										await adapter.setStateAsync(`${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`, Math.round(parseFloat(info.value) / 1024 / 1024 * 100) / 100, true);
									} else {
										await adapter.createStatisticObjectNumber(`${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`, _(info.name.replace(/_/g, " ")), '');
										await adapter.setStateAsync(`${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`, parseFloat(info.value), true);
									}
								}
							} else {
								if (await adapter.getObjectAsync(`${adapter.namespace}.${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`)) {
									await adapter.delObjectAsync(`${adapter.namespace}.${isSession ? 'session' : 'system'}.${info.name.toLowerCase()}`);
								}
							}
						}
					}

					this.log.info(`Successful updating ${isSession ? 'session' : 'system'} statistics!`);
				} else {
					this.log.error(`[${instanceObj.native.dbtype}] ${isSession ? 'session' : 'system'} statistics is ${JSON.stringify(avaiableInfos)}. Please report this issue to the developer!`);
				}
			} else {
				let exisitingObj = await this.getForeignObjectsAsync(`${this.namespace}.${isSession ? 'session' : 'system'}.*`);
				for (const key of Object.keys(exisitingObj)) {
					await this.delObjectAsync(key);
				}
			}
		} catch (err) {
			this.log.error(`[createSystemOrSessionStatistic] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * @param {{ name: string; size: number, tables: number}} database
	 * @param {{ name: string; size: number}} table
	 * @param {string} idTablePrefix
	 * @param {ioBroker.Object} instanceObj
	 */
	async createIobSpecialTableStatistic(database, table, idTablePrefix, instanceObj) {
		try {
			this.log.debug(`[${instanceObj.native.dbtype}] creating special statistics for ioBroker table '${table.name}' of database '${database.name}'`);

			let brokenRows = 0;
			let brokenRowsList = [];

			if (table.name === 'datapoints') {
				// table datapoints -> check if Ids exist in Iob
				let tableDatapoints = await this.getQueryResult(SQLFuncs.getRowsFromIobTableDatapoints(instanceObj.native.dbname));

				if (tableDatapoints && Object.keys(tableDatapoints).length > 0) {
					this.log.debug(`[${instanceObj.native.dbtype}] special ioBroker row list for table '${table.name}' of database '${database.name}' received, ${Object.keys(tableDatapoints).length} tables exists`);

					for (const row of tableDatapoints) {

						let iobObj = await this.getForeignObjectAsync(row.name);
						if (!iobObj) {
							// Object not exist in IoB -> row is broken
							brokenRows++;
							brokenRowsList.push({ id: row.id, name: row.name, existInIoBroker: false });

							this.log.debug(`[${instanceObj.native.dbtype}] object '${row.name}' not exist in ioBroker, added to broken list`);

						} else if (iobObj && iobObj.common) {
							if (!iobObj.common.custom || (iobObj.common.custom && !iobObj.common.custom[this.config.sqlInstance])) {
								// Object exist in IoB but have no custom property for the current instance -> row is broken
								brokenRows++;
								brokenRowsList.push({ id: row.id, name: row.name, existInIoBroker: true });

								this.log.silly(`[${instanceObj.native.dbtype}] object '${row.name}' exist in ioBroker but has no custom property for '${this.namespace}' instance, added to broken list`);
							}
						}
					}
				} else {
					this.log.error(`[${instanceObj.native.dbtype}] special ioBroker tables list of database '${database.name}' is ${JSON.stringify(tableDatapoints)}. Please report this issue to the developer!`);
				}
			} else {
				// ohter iob tables
				let tableDatapoints = await this.getQueryResult(SQLFuncs.getRowsFromIobTables(instanceObj.native.dbname, table.name));

				if (tableDatapoints && Object.keys(tableDatapoints).length > 0) {
					this.log.debug(`[${instanceObj.native.dbtype}] special ioBroker row list for table '${table.name}' of database '${database.name}' received, ${Object.keys(tableDatapoints).length} tables exists`);

					for (const row of tableDatapoints) {
						if (dbNames.includes(table.name)) {
							if (row.dead === 1) {
								brokenRows = brokenRows + row.count;
								brokenRowsList.push({ id: row.id });

								this.log.silly(`[${instanceObj.native.dbtype}] row with id '${row.id}' exist in table '${table.name}' but not exist in table 'datapoints', added to broken list`);
							}
						}
					}
				} else {
					if (!tableDatapoints) {
						this.log.error(`[${instanceObj.native.dbtype}] special ioBroker row list for table '${table.name}' of database '${database.name}' is ${JSON.stringify(tableDatapoints)}. Please report this issue to the developer!`);
					}
				}
			}

			if (dbNames.includes(table.name) || table.name === 'datapoints') {
				await this.createStatisticObjectNumber(`${idTablePrefix}.brokenRows`, _('broken rows in table'), '');
				this.setMyState(`${idTablePrefix}.brokenRows`, brokenRows, true, instanceObj);

				await this.createStatisticObjectString(`${idTablePrefix}.brokenRowsIds`, _("ids of broken rows in table"));
				if (brokenRowsList.length > 0) {
					this.setMyState(`${idTablePrefix}.brokenRowsIds`, JSON.stringify(brokenRowsList), true, instanceObj);
				} else {
					this.setMyState(`${idTablePrefix}.brokenRowsIds`, 'none', true, instanceObj);
				}
			}

			return brokenRows;
		} catch (err) {
			this.log.error(`[createIobSpecialTableStatistic] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	async deleteUnsedObjects() {
		try {
			this.log.debug(`deleting unused objects...`);

			let stateList = await this.getStatesAsync(`${this.namespace}.databases.*`);

			let counter = 0;
			for (const id in stateList) {
				if (usedDatapoints.length > 0 && !usedDatapoints.includes(id.replace(`${this.namespace}.`, ''))) {
					await this.delObjectAsync(id);
					this.log.silly(`object '${id}' deleted`);

					counter++;
				}
			}

			this.log.debug(`${counter} unused objects deleted`);
		} catch (err) {
			this.log.error(`[deleteUnsedObjects] error: ${err.message}, stack: ${err.stack}`);
		}
	}

	/**
	 * @param {string} id
	 * @param {any} value
	 * @param {boolean} ack
	 * @param {object} options
	 * @param {ioBroker.Object} instanceObj
	 */
	setMyState(id, value, ack, instanceObj, options = undefined) {
		if (options) {
			if (!this.config.databases.includes(options.dbname)) {

				if (!options.isTable || options.dbname === instanceObj.native.dbname) {
					this.createStatisticObjectNumber(id, _(options.name), options.unit);

					this.log.silly(`store state '${id}', value: ${value}`);
					this.setState(id, value, ack);
					usedDatapoints.push(id);
				} else {
					// table
					if (this.config.foreignTableStatistics) {
						this.createStatisticObjectNumber(id, _(options.name), options.unit);

						this.log.silly(`store state '${id}', value: ${value}`);
						this.setState(id, value, ack);
						usedDatapoints.push(id);
					}
				}
			}
		} else {
			this.log.silly(`store state '${id}', value: ${value}`);
			this.setState(id, value, ack);
			usedDatapoints.push(id);
		}
	}

	async checkConnection() {
		try {
			// check connection to sql instance on load
			let instanceIsConnected = await this.getForeignStateAsync(`${this.config.sqlInstance}.info.connection`);
			if (instanceIsConnected && instanceIsConnected.val) {
				this.setState('info.connection', Boolean(instanceIsConnected.val), instanceIsConnected.ack);
				return Boolean(instanceIsConnected.val);
			} else {
				this.setState('info.connection', false, true);
				return false;
			}
		} catch (err) {
			this.log.error(`[deleteUnsedObjects] error: ${err.message}, stack: ${err.stack}`);
			return false;
		}
	}

	/**
	 * @param {string} query
	 */
	async getQueryResult(query) {
		try {
			let result = await this.sendToAsync(this.config.sqlInstance, 'query', query);

			if (result && result['result']) {
				return result['result'];
			}
			return null;
		} catch (err) {
			this.log.error(`[getQueryResult] error: ${err.message}, query: ${query}, stack: ${err.stack}`);
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 * @param {any} unit
	 */
	async createStatisticObjectNumber(id, name, unit) {
		let obj = await this.getObjectAsync(id);

		if (obj) {
			if (obj.common.name !== name || obj.common['unit'] !== unit) {

				obj.common.name = name;
				obj.common['unit'] = unit;

				await this.setObject(id, obj);
			}
		} else {
			await this.setObjectNotExistsAsync(id,
				{
					type: 'state',
					common: {
						name: name,
						desc: 'sql statistic',
						type: 'number',
						unit: unit,
						read: true,
						write: false,
						role: 'value'
					},
					native: {}
				});
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createStatisticObjectString(id, name) {
		let obj = await this.getObjectAsync(id);

		if (obj) {
			if (obj.common.name !== name) {
				obj.common.name = name;
				await this.setObject(id, obj);
			}
		} else {
			await this.setObjectNotExistsAsync(id,
				{
					type: 'state',
					common: {
						name: name,
						desc: 'sql statistic',
						type: 'string',
						read: true,
						write: false,
						role: 'value'
					},
					native: {}
				});
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
	async onStateChange(id, state) {
		if (id === `${this.config.sqlInstance}.info.connection`) {
			if (state) {
				// The state was changed
				this.setState('info.connection', Boolean(state.val), state.ack);
				connected === Boolean(state.val);

				if (state.val) {
					await this.getAvailableData();
				}
			} else {
				// The state was deleted
				this.setState('info.connection', false, true);
				connected === false;
			}
		}

		if (id === `${this.namespace}.update`) {
			if (!updateIsRunning) {
				await this.updateStatistic();
				await this.updateDatabaseStatistic();
			} else {
				this.log.warn(`update is currently running, please wait until its finished!`);
			}
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