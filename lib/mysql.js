exports.getDatabases = function () {
    return `SELECT TABLE_SCHEMA AS 'name', TRUNCATE(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'size', COUNT(TABLE_NAME) as 'tables' FROM INFORMATION_SCHEMA.TABLES GROUP BY TABLE_SCHEMA;`
}

/**
 * @param {string} dbname
 */
exports.getTablesOfDatabases = function (dbname) {
    return `SELECT table_name AS 'name', TRUNCATE((data_length + index_length) / 1024 / 1024, 2) as 'size' FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${dbname}';`
}

/**
 * @param {string} dbname
 * @param {string} table
 */
exports.getRowsCountOfTable = function (dbname, table) {
    // must be separate called, because using information_schema is only an approximation on inno dbs
    return `SELECT count(*) as 'rows' from ${dbname}.${table};`
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
    return `SELECT id, Count(id) as 'count', IF(id NOT IN (SELECT id from ${dbname}.datapoints), 1, 0) as 'dead' FROM ${dbname}.${tableName} GROUP BY id;`;
}

/**
* @param {Boolean} isSession
*/
exports.getSystemOrSessionInfos = function (isSession = false) {
    return `SELECT VARIABLE_NAME as 'name', VARIABLE_VALUE as 'value' FROM performance_schema.${isSession ? 'session_status' : 'global_status'};`;
}

/**
* @param {Number} limit
*/
exports.getClientStatistics = function (limit = 0) {
    return `SELECT * FROM sys.x$host_summary ${(limit !== 0) ? `LIMIT ${limit}` : ''};`;
}

exports.resetSessionStatistics = function () {
    return `FLUSH STATUS;`;
}