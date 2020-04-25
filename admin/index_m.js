var myNamespace = null;
var retryTimer = [];

/**
 * Is called by the admin adapter when the settings page loads
 * @param {*} settings 
 * @param {*} onChange 
 */
function load(settings, onChange) {
    myNamespace = adapter + '.' + instance;

    let checkboxLists = [
        {
            // databases
            id: `${myNamespace}.info`,
            property: 'databases',
            defaults: ["sys", "information_schema", "performance_schema", "mysql"],
            ignores: ['iobroker_dev'],
            parentContainerId: 'container_databases'
        },
        {
            // global status
            id: `${myNamespace}.info`,
            property: 'globalStatus',
            defaults: ["Aborted_clients", "Aborted_connects", "Bytes_received", "Bytes_sent", "Connection_errors_accept", "Connection_errors_internal", "Connection_errors_max_connections", "Connection_errors_peer_address", "Connection_errors_select", "Connection_errors_tcpwrap", "Connections", "Max_used_connections", "Questions", "Slow_queries", "Threads_cached", "Threads_connected", "Threads_created", "Threads_running", "Uptime"],
            parentContainerId: 'container_globalStatus'
        },
        {
            // session status
            id: `${myNamespace}.info`,
            property: 'sessionStatus',
            defaults: ["Bytes_received", "Bytes_sent", "Questions", "Uptime_since_flush_status"],
            parentContainerId: 'container_sessionStatus'
        },
        {
            // clients
            id: `${myNamespace}.info`,
            property: 'clients',
            defaults: ["host", "statement_avg_latency", "file_io_latency", "current_connections", "total_connections", "current_memory", "total_memory_allocated"],
            parentContainerId: 'container_clients'
        }
    ]

    // example: select elements with id=key and class=value and insert value
    if (!settings) return;
    $('.value').each(function () {
        var $key = $(this);
        var id = $key.attr('id');
        if ($key.attr('type') === 'checkbox') {
            // do not call onChange direct, because onChange could expect some arguments
            $key.prop('checked', settings[id])
                .on('change', () => onChange())
                ;
        } else {
            // do not call onChange direct, because onChange could expect some arguments
            $key.val(settings[id])
                .on('change', function () {
                    if (id === 'sqlInstance') showHideSettings();
                    onChange()
                })
                .on('keyup', () => onChange())
                ;
        }
    });

    generateSqlInstancesDropDown(settings);

    for (const options of checkboxLists) {
        generateCheckboxList(options, settings, onChange)
    }

    eventsHandler();

    showHideSettings();

    onChange(false);

    // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
    if (M) M.updateTextFields();
}

function eventsHandler() {
    $("[id*=enable]").each(function () {
        let key = $(this).attr('id').replace('enable', '');

        $(this).on('change', function () {
            if ($(this).prop('checked') === true) {
                $(`#container_${key}`).show();
            } else {
                $(`#container_${key}`).hide();
            }
        });
    });
}

/**
 * @param {object} options				-> see options parameter below 
 * @param {object} settings				-> settings des Adapters
 * @param {object} onChange				-> onChange Event des Adapters
 * 
 * options parameter --------------------------------------------------------------------------------------------------------------------------------------------------
 * @param {string} id					-> id of datapoint which has an array in native object to be used for the checkbox list
 * @param {string} property				-> name of the array in native object, property name where the selected items store must have the same name in io-package.json
 * @param {Array<string>} defaults		-> default selection used by default button -> if no default is defined, button will hide
 * @param {Array<string>} ignores		-> will be ignore by creating the checkbox list
 * @param {string} parentContainerId    -> id of parent container where the checklist should be added to.
 */
function generateCheckboxList(options, settings, onChange) {
    try {
        $(`#${options.parentContainerId}`).html(
            `<div class="col s12 ${options.property}_button_panel checkbox_list_buttons_container">
                <a id="${options.property}_button_default" class="waves-effect waves-light btn-small checkbox_list_button"><i
                        class="material-icons left">settings_backup_restore</i><span
                        class="translate">${_("default")}</span></a>
                <a id="${options.property}_button_all" class="waves-effect waves-light btn-small checkbox_list_button"><i
                        class="material-icons left">check_box</i><span class="translate">${_("selectAll")}</span></a>
                <a id="${options.property}_button_none" class="waves-effect waves-light btn-small checkbox_list_button"><i
                        class="material-icons left">check_box_outline_blank</i><span
                        class="translate">${_("selectNone")}</span></a>
            </div>
            <div class="col s12 checkbox_list" id="${options.property}_checkbox_list">
                <div class="progress">
                    <div class="indeterminate"></div>
                </div>
                <h6 class="center translate">${_("notYetAvailable")}</h6>
            </div>`
        )

        // Read all available datapoints from object
        getObject(options.id, (err, state) => {

            // If native has not the array, loop until array is available
            if (!state.native[options.property]) {

                // Reset timer (if running) and start new one for next polling interval
                if (retryTimer[options.property]) {
                    clearTimeout(retryTimer[options.property]);
                    retryTimer[options.property] = null;
                }

                retryTimer[options.property] = setTimeout(() => {
                    generateCheckboxList(options.id, options.property, settings);
                }, 1000);

                $(`.${options.property}_button_panel`).hide();
            } else {
                // native has array -> create checkbox list

                if (retryTimer[options.property]) {
                    clearTimeout(retryTimer[options.property]);
                    retryTimer[options.property] = null;
                }

                let checkboxElementsList = [];
                let availableDatapoints = state.native[options.property];

                if (availableDatapoints) {
                    availableDatapoints = availableDatapoints.sort();

                    for (const datapoint of availableDatapoints) {
                        if (options.ignores && !options.ignores.includes(datapoint) || !options.ignores) {
                            checkboxElementsList.push(
                                `<label class="col s4 input-field checkbox_list_item">
                                    <input type="checkbox" class="${options.property}_checkbox_item" ${settings[options.property].indexOf(datapoint) !== -1 ? 'checked ' : ''} data-info="${datapoint}" />
                                    <span class="black-text">${_(datapoint.replace(/_/g, ' '))}</span>
                                </label>`
                            )
                        }
                    }
                    $(`#${options.property}_checkbox_list`).html(checkboxElementsList.join(""));

                    $(`.${options.property}_button_panel`).show();
                }
            }

            $(`.${options.property}_checkbox_item`).on('change', function () {
                onChange()
            });

            if (options.defaults && options.defaults.length > 0) {
                $(`#${options.property}_button_default`).on('click', function () {
                    $(`.${options.property}_checkbox_item`).each(function () {
                        let $this = $(this);

                        if (options.defaults.includes($this.data('info'))) {
                            $this.prop('checked', true);
                        } else {
                            $this.prop('checked', false);
                        }

                        onChange();
                    });
                });
                $(`#${options.property}_button_default`).show();
            } else {
                $(`#${options.property}_button_default`).hide();
            }

            $(`#${options.property}_button_all`).on('click', function () {
                $(`.${options.property}_checkbox_item`).each(function () {
                    $(this).prop('checked', true);
                    onChange();
                });
            });

            $(`#${options.property}_button_none`).on('click', function () {
                $(`.${options.property}_checkbox_item`).each(function () {
                    $(this).prop('checked', false);
                    onChange();
                });
            });


            // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
            M && M.updateTextFields();
        });
    } catch (err) {
        console.error(`[generateCheckboxList] id: '${options.id}', property: '${options.property}', error: ${err.message}, stack: ${err.stack}`);
    }
}

function showHideSettings() {
    if ($('#sqlInstance').val()) {
        $('.myVisibleHandler').show();
    } else {
        $('.myVisibleHandler').hide();
    }

    $("[id*=enable]").each(function () {
        let key = $(this).attr('id').replace('enable', '');

        if ($(this).prop('checked') === true && $('#sqlInstance').val()) {
            $(`#container_${key}`).show();
        } else {
            $(`#container_${key}`).hide();
        }
    });
}

function generateSqlInstancesDropDown(settings) {
    socket.emit('getObjectView', 'system', 'instance', { startkey: 'system.adapter.sql.', endkey: 'system.adapter.sql.\u9999' }, function (err, doc) {
        if (err) {
            console.error(err);
        } else {
            if (doc.rows.length) {
                var result = [];
                for (var i = 0; i < doc.rows.length; i++) {
                    result.push(doc.rows[i].value);
                }
                result = result.filter(function (adp) {
                    return adp && adp.common && adp.common.getHistory;
                });

                var text = '';
                for (var r = 0; r < result.length; r++) {
                    var name = result[r]._id.substring('system.adapter.'.length);
                    text += '<option value="' + name + '">' + name + '</option>';
                }
                $('#sqlInstance').append(text).val(settings.sqlInstance).select();
                showHideSettings();
            }
        }
    });
}

/**
 * Is called by the admin adapter when the user presses the save button
 * @param {*} callback 
 */
function save(callback) {
    // example: select elements with class=value and build settings object
    var obj = {};
    $('.value').each(function () {
        var $this = $(this);
        if ($this.attr('type') === 'checkbox') {
            obj[$this.attr('id')] = $this.prop('checked');
        } else {
            obj[$this.attr('id')] = $this.val();
        }
    });

    // create empty arrays for all checkbox list
    $("[id*=_checkbox_list]").each(function () {
        let property = $(this).attr('id').replace('_checkbox_list', '');
        obj[property] = [];
    });

    // dynamic add items if checkbox is checked
    $("[class*=_checkbox_item]").each(function () {
        let property = $(this).attr('class').replace('_checkbox_item', '');

        if ($(this).prop('checked')) {
            if (obj.hasOwnProperty(property)) {
                obj[property].push($(this).data('info'));
            }
        }
    });

    callback(obj);
}