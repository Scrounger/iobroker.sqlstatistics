exports.getDatabases = function () {
    return `SELECT TABLE_SCHEMA AS "name", TRUNCATE(SUM(data_length + index_length) / 1024 / 1024, 2) AS "size", COUNT(TABLE_NAME) as "tables" FROM INFORMATION_SCHEMA.TABLES GROUP BY TABLE_SCHEMA;`
}

/**
 * @param {string} dbname
 */
exports.getTablesOfDatabases = function (dbname) {
    return `SELECT table_name AS "name", TRUNCATE((data_length + index_length) / 1024 / 1024, 2) as "size" FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${dbname}';`
}

/**
 * @param {string} dbname
 * @param {string} table
 */
exports.getRowsCountOfTable = function (dbname, table) {
    // must be separate called, because using information_schema is only an approximation on inno dbs
    return `SELECT count(*) as "rows" from ${dbname}.${table};`
}

/**
 * @param {string} dbname
 * @param {string} table
 */
exports.getRowsFromIobTableDatapoints = function (dbname, table) {
    return `SELECT id, name FROM ${dbname}.datapoints;`;
}

exports.getRowsFromIobTables = /**
 * @param {string} dbname
 * @param {string} tableName
 */
 function (dbname, tableName) {
    return `SELECT id, Count(id) as "count", IF(id NOT IN (SELECT id from ${dbname}.datapoints)) THEN 1 ELSE 0 as "dead" FROM ${dbname}.${tableName} GROUP BY id;`;
}

exports.getSystemStatistics = /**
 * @param {Boolean} isSession
 */
 function (isSession) {
    return `Show ${isSession? 'SESSION': 'GLOBAL'} STATUS WHERE Variable_name LIKE "BYTES%" OR Variable_name LIKE "UPTIME" OR Variable_name LIKE "Connections" OR Variable_name LIKE "Connection_errors%" OR Variable_name LIKE "Threads_%" OR Variable_name LIKE "Aborted_c%" OR Variable_name LIKE "Max_used_connections" OR Variable_name LIKE "Slow_queries";`
}