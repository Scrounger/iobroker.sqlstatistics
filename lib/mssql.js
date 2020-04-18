exports.getDatabases = function () {
    return `SELECT table_schema [name], TRUNCATE(SUM(data_length + index_length) / 1024 / 1024, 2) [size], COUNT(TABLE_NAME) [tables} FROM information_schema.TABLES GROUP BY table_schema;`
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

exports.getRowsFromIobTables = /**
 * @param {string} dbname
 * @param {string} tableName
 */
 function (dbname, tableName) {
    return `SELECT id, Count(id) [count], IIF(id NOT EXISTS (SELECT id from ${dbname}.datapoints), 1, 0) [dead] FROM ${dbname}.${tableName} GROUP BY id;`;
}