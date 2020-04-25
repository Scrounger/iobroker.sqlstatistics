exports.getDatabases = function () {
    return `SELECT table_catalog [name], (SELECT CAST(SUM(CAST( (size * 8.0/1024) AS DECIMAL(15,2) )) AS VARCHAR(20)) AS [size] FROM sys.database_files) [size], COUNT(TABLE_NAME) [tables] FROM information_schema.TABLES GROUP BY table_catalog;`
}

/**
 * @param {string} dbname
 */
exports.getTablesOfDatabases = function (dbname) {
    return `SELECT table_name [name], TRUNCATE((data_length + index_length) / 1024 / 1024, 2) [size] FROM information_schema.TABLES WHERE table_schema = '${dbname}';`
}

/**
 * @param {string} dbname
 * @param {string} table
 */
exports.getRowsCountOfTable = function (dbname, table) {
    // must be separate called, because using information_schema is only an approximation on inno dbs
    return `SELECT count(*) [rows] from ${dbname}.${table};`
}

/**
 * @param {string} dbname
 * @param {string} table
 */
exports.getRowsFromIobTableDatapoints = function (dbname, table) {
    return `SELECT id, name FROM ${dbname}.datapoints;`;
}

/**
 * @param {string} dbname
 * @param {string} tableName
 */
exports.getRowsFromIobTables = function (dbname, tableName) {
    return `SELECT id, Count(id) [count], IIF(id NOT EXISTS (SELECT id from ${dbname}.datapoints), 1, 0) [dead] FROM ${dbname}.${tableName} GROUP BY id;`;
}

/**
 * @param {Boolean} isSession
 */
exports.getSystemStatistics = function (isSession) {
    return `SELECT VARIABLE_NAME as 'name', VARIABLE_VALUE as 'value' FROM performance_schema.${isSession ? 'session_status' : 'global_status'} WHERE Variable_name LIKE "BYTES%" OR Variable_name LIKE "UPTIME" OR Variable_name LIKE "Connections" OR Variable_name LIKE "Connection_errors%" OR Variable_name LIKE "Threads_%" OR Variable_name LIKE "Aborted_c%" OR Variable_name LIKE "Max_used_connections" OR Variable_name LIKE "Slow_queries";`
}

/**
* @param {Boolean} isSession
*/
exports.getSystemOrSessionInfos = function (isSession=false) {
    return `SELECT VARIABLE_NAME as 'name', VARIABLE_VALUE as 'value' FROM performance_schema.${isSession ? 'session_status' : 'global_status'};`;
}