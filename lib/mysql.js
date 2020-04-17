
exports.getDatabases = function () {
    return `SELECT table_schema AS "name", TRUNCATE(SUM(data_length + index_length) / 1024 / 1024, 2) AS "size", COUNT(table_name) as "tables" FROM information_schema.TABLES GROUP BY table_schema;`
}

/**
 * @param {string} dbname
 */
exports.getTablesOfDatabases = function (dbname) {
    return `SELECT table_name AS 'name', TRUNCATE((data_length + index_length) / 1024 / 1024, 2) as 'size' FROM information_schema.TABLES WHERE table_schema = "${dbname}";`
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
    return `SELECT id, name FROM ${dbname}.datapoints`;
}

exports.getRowsFromIobTables = /**
 * @param {string} dbname
 * @param {string} tableName
 */
 function (dbname, tableName) {
    return `SELECT id, Count(id) as 'count', IF(id NOT IN (SELECT id from ${dbname}.datapoints), 1, 0) as 'dead' FROM ${dbname}.${tableName} GROUP BY id`;
}