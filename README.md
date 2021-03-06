![Logo](admin/sqlstatistics.png)
# ioBroker.sqlstatistics

[![NPM version](http://img.shields.io/npm/v/iobroker.sqlstatistics.svg)](https://www.npmjs.com/package/iobroker.sqlstatistics)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sqlstatistics.svg)](https://www.npmjs.com/package/iobroker.sqlstatistics)
![Number of Installations (latest)](http://iobroker.live/badges/sqlstatistics-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/sqlstatistics-stable.svg)
[![Dependency Status](https://img.shields.io/david/Scrounger/iobroker.sqlstatistics.svg)](https://david-dm.org/Scrounger/iobroker.sqlstatistics)
[![Known Vulnerabilities](https://snyk.io/test/github/Scrounger/ioBroker.sqlstatistics/badge.svg)](https://snyk.io/test/github/Scrounger/ioBroker.sqlstatistics)

[![NPM](https://nodei.co/npm/iobroker.sqlstatistics.png?downloads=true)](https://nodei.co/npm/iobroker.sqlstatistics/)

**Tests:**: [![Travis-CI](http://img.shields.io/travis/Scrounger/ioBroker.linkeddevices/master.svg)](https://travis-ci.org/Scrounger/ioBroker.sqlstatistics)

## SQL History Statistics adapter for ioBroker
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=VWAXSTS634G88&source=url)

> [SQL History Adapater](https://github.com/ioBroker/ioBroker.sql/blob/master/README.md) requiered!

SQL History Statistics creates statistics for your database provider. It creates statistics such as size in MB, number of rows, etc. for databases and tables.

For the used IoBroker database, additional statistics are created for no longer used data points and the connected data sets.

SQLite3 database is not supported!

##### data points structure
![stucture](docs/en/img/datapoints.png)

## Changelog

### 0.2.0 (2020-04-25)
* system statistics added
* adapter settings added
* translation added
* option to reset session statistics every day added
* sum of not used rows in iob database added

### 0.1.0 (2020-04-18)
* (Scrounger) alpha release

### 0.0.1 (2020-04-17)
* (Scrounger) initial release

## License
MIT License

Copyright (c) 2020 Scrounger <scrounger@gmx.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.