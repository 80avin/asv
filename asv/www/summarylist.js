'use strict';

$(document).ready(function() {
    /* The state of the parameters in the sidebar.  Dictionary mapping
       strings to values determining the "enabled" configurations. */
    var state = null;
    /* Cache of constructed tables, {data_path: table_dom_id} */
    var table_cache = {};
    var table_cache_counter = 0;

    function setup_display(state_selection) {
        var new_state = setup_state(state_selection);
        var same_state = (state !== null);

        /* Avoid needless UI updates, e.g., on table sort */

        if (same_state) {
            $.each(state, function (key, value) {
                if (value != new_state[key]) {
                    same_state = false;
                }
            });
        }

        if (!same_state) {
            state = new_state;
            replace_params_ui();

            var filename = $.asv.graph_to_path('summary', state);

            $("#summarylist-body table").hide();
            $("#summarylist-body .message").remove();

            if (table_cache[filename] !== undefined) {
                $(table_cache[filename]).show();
            }
            else {
                $("#summarylist-body").append($("<p class='message'>Loading...</p>"));
                $.asv.load_graph_data(
                    filename
                ).done(function (data) {
                    var table = construct_benchmark_table(data);
                    var table_name = 'summarylist-table-' + table_cache_counter;
                    ++table_cache_counter;

                    table.attr('id', table_name);
                    table_cache[filename] = '#' + table_name;
                    $("#summarylist-body .message").remove();
                    $("#summarylist-body").append(table);
                    table.show()
                });
            }
        }
    }

    function update_state_url(key, value) {
        var info = $.asv.parse_hash_string(window.location.hash);
        var new_state = get_valid_state(state, key, value);

        $.each($.asv.main_json.params, function(param, values) {
            if (values.length > 1) {
                info.params[param] = [new_state[param]];
            }
            else if (info.params[param]) {
                delete info.params[param];
            }
        });

        window.location.hash = $.asv.format_hash_string(info);
    }

    function obj_copy(obj) {
        var newobj = {};
        $.each(obj, function(key, val) {
            newobj[key] = val;
        });
        return newobj;
    }

    function obj_diff(obj1, obj2) {
        var count = 0;
        $.each(obj1, function(key, val) {
            if (obj2[key] != val) {
                ++count
            }
        });
        return count;
    }

    function get_valid_state(tmp_state, wanted_key, wanted_value) {
        /*
          Get an available state with wanted_key having wanted_value,
          preferably as a minor modification of tmp_state.
         */
        var best_params = null;
        var best_diff = 1e99;
        var best_hit = false;

        tmp_state = obj_copy(tmp_state);
        if (wanted_key !== undefined) {
            tmp_state[wanted_key] = wanted_value;
        }

        $.each($.asv.main_json.graph_param_list, function(idx, params) {
            var diff = obj_diff(tmp_state, params);
            var hit = (wanted_key === undefined || params[wanted_key] == wanted_value);

            if ((!best_hit && hit) || (hit == best_hit && diff < best_diff)) {
                best_params = params;
                best_diff = diff;
                best_hit = hit;
            }
        });

        if (best_params === null) {
            best_params = $.asv.main_json.graph_param_list[0];
        }

        return obj_copy(best_params);
    }

    function setup_state(state_selection) {
        var index = $.asv.main_json;
        var state = {};

        state.machine = index.params.machine;

        $.each(index.params, function(param, values) {
            state[param] = values[0];
        });

        if (state_selection !== null) {
            /* Select a specific generic parameter state */
            $.each(index.params, function(param, values) {
                if (state_selection[param]) {
                    state[param] = state_selection[param][0];
                }
            });
        }

        return get_valid_state(state);
    }

    function replace_params_ui() {
        var index = $.asv.main_json;

        var nav = $('#summarylist-navigation');
        nav.empty();

        /* Machine selection */
        $.asv.ui.make_value_selector_panel(nav, 'machine', index.params.machine,  function(i, machine, button) {
            button.text(machine);

            button.on('click', function(evt) {
                update_state_url('machine', machine);
            });

            if (state.machine != machine) {
                button.removeClass('active');
            }
            button.removeAttr('data-toggle');

            /* Create tooltips for each machine */
            var details = [];
            $.each(index.machines[machine], function(key, val) {
                details.push(key + ': ' + val);
            });
            details = details.join('<br/>');

            button.tooltip({
                title: details,
                html: true,
                placement: 'right',
                container: 'body',
                animation: false
            });
        });

        /* Generic parameter selectors */
        $.each(index.params, function(param, values) {
            if (values.length > 1 && param != 'machine') {
                $.asv.ui.make_value_selector_panel(nav, param, values, function(i, value, button) {
                    var value_display;
                    if (value === null)
                        value_display = '[none]';
                    else if (!value)
                        value_display = '[default]';
                    else
                        value_display = value;

                    button.text(value_display);

                    if (state[param] != value) {
                        button.removeClass('active');
                    }

                    button.on('click', function(evt) {
                        update_state_url(param, value);
                    });
                });
            }
        });

        $(nav).find(".btn-group").removeAttr("data-toggle");

        $.asv.ui.reflow_value_selector_panels();
    }

    function construct_benchmark_table(data) {
        var index = $.asv.main_json;

        /* Form a new table */

        var table = $('<table class="table table-hover"/>');

        var table_head = $('<thead><tr>' +
                           '<th>Benchmark</th>' +
                           '<th>Value</th>' +
                           '<th>Recent change</th>' +
                           '<th>Changed at</th>' +
                           '</tr></thead>');
        table.append(table_head);
        var table_body = $('<tbody/>');
        table.append(table_body);

        // Set datatable after page has loaded
        setTimeout(() => setup_sort(table, data), 0);

        return table;
    }

    function setup_sort(table, data) {
        table.dataTable({
          data,
          pageLength: 100,
          lengthMenu: [25, 50, 100, { label: 'All', value: -1 }],
          columns: [
            {
              data: 'pretty_name',
              render: (val, type, row) => {
                if (type !== 'display') return val;
                let benchmark_url_args = {}
                benchmark_url_args.location = [row.name];
                benchmark_url_args.params = {};
                $.each($.asv.main_json.params, function (key, values) {
                  if (values.length > 1) {
                    benchmark_url_args.params[key] = [state[key]];
                  }
                });
                let benchmark_base_url = $.asv.format_hash_string(benchmark_url_args);
                let benchmark_full_url = $.asv.format_hash_string(benchmark_url_args);
                if (row.idx === null) {
                  return `<a href="${benchmark_base_url}">${val}</a>`
                } else {
                  var basename = row.pretty_name;
                  var args = null;
                  var m = row.pretty_name.match(/(.*)\(.*$/);
                  if (m) {
                    basename = m[1];
                    args = row.pretty_name.slice(basename.length);
                  }
                  let bm_link = $('<a/>').attr('href', benchmark_base_url).text(basename);
                  let name_td = $('<td/>');
                  name_td.append(bm_link).attr('data-filter', row.pretty_name).attr('data-order', row.pretty_name);;
                  if (args) {
                    var bm_idx_link;
                    var graph_url;
                    bm_idx_link = $('<a/>').attr('href', benchmark_full_url).text(' ' + args);
                    name_td.append(bm_idx_link);
                    graph_url = $.asv.graph_to_path(row.name, state);
                    $.asv.ui.hover_graph(bm_idx_link, graph_url, row.name, row.idx, null);
                  }
                  return name_td[0].innerHTML
                }
              },
              createdCell: (td_tag, text, row, rowIndex, colIndex, ...args) => {
                if (td_tag.children[0])
                  $.asv.ui.hover_summary_graph($(td_tag.children[0]), row.name);
                if (td_tag.children[1]) {
                  let graph_url = $.asv.graph_to_path(row.name, state);
                  $.asv.ui.hover_graph($(td_tag.children[1]), graph_url, row.name, row.idx, null);
                }
              }
            },
            {
              data: 'last_value', render: (text, type, row) => {
                if (type !== 'display') return text;
                let unit = $.asv.main_json.benchmarks[row.name].unit;
                let value = $.asv.pretty_unit(row.last_value, unit);

                let err = 100 * row.last_err / row.last_value;
                let err_str
                if (err == err) {
                  err_str = " \u00b1 " + err.toFixed(0.1) + '%';
                }
                else {
                  err_str = "";
                }

                var value_span = $('<span/>').text(value + err_str);
                value_span.attr('data-toggle', 'tooltip');
                value_span.attr('title', value + err_str);
                return value_span[0].outerHTML
              },
              createdCell: (td_tag, text, row, rowIndex, colIndex) => {
                $(td_tag).find('[data-toggle=tooltip]').tooltip()
                td_tag.classList.add('value')
              }
            },
            {
              data: 'prev_value',
              render: (_text, type, row) => {
                let change = 0;
                if (row.prev_value) {
                  change = 100 * (row.last_value / row.prev_value - 1);
                }
                if (type === 'sort') return change || 0;
                let benchmark_url_args = { location: [row.name], params: {} }
                $.each($.asv.main_json.params, function (key, values) {
                  if (values.length > 1) {
                    benchmark_url_args.params[key] = [state[key]];
                  }
                });
                let benchmark_full_url = $.asv.format_hash_string(benchmark_url_args);
                if (row.prev_value !== null) {
                  let text, change_str;
                  let unit = $.asv.main_json.benchmarks[row.name].unit;
                  change_str = $.asv.pretty_unit(row.last_value - row.prev_value, unit);
                  if (!change_str.match(/^-/)) {
                    change_str = '+' + change_str;
                  }
                  if (row.prev_value != 0) {
                    text = change.toFixed(1) + '%  (' + change_str + ')';
                    if (change > 0) {
                      text = '+' + text;
                    }
                  }
                  else {
                    text = ' (' + change_str + ')';
                  }
                  text = text.replace('-', '\u2212');
                  if (type === 'filter') return text

                  let change_commit_a = $.asv.main_json.revision_to_hash[row.change_rev[0]];
                  let change_commit_b = $.asv.main_json.revision_to_hash[row.change_rev[1]];
                  let change_q = '&commits=' + [change_commit_a, change_commit_b].filter(Boolean).join('-');
                  let change_link = $('<a/>').attr('href', benchmark_full_url + change_q).text(text);
                  return change_link[0].outerHTML
                }
                return ''
              },
              createdCell: (td_tag, text, row, rowIndex, colIndex) => {
                let graph_url = $.asv.graph_to_path(row.name, state);
                $.asv.ui.hover_graph($(td_tag.children[0]), graph_url, row.name, row.idx, [row.change_rev]);
                let change = 0;
                if (row.prev_value) {
                  change = 100 * (row.last_value / row.prev_value - 1);
                }
                if (change > 5) {
                  td_tag.classList.add('positive-change')
                } else if (change < -5) {
                  td_tag.classList.add('negative-change')
                }
                td_tag.classList.add('change')
              }
            },
            {
              data: 'change_rev.0',
              render: (text, type, row) => {
                if (type !== 'display') return text;
                if (row.change_rev === null) return '';
                var date = new Date($.asv.main_json.revision_to_date[row.change_rev[1]]);
                var commit_1 = $.asv.get_commit_hash(row.change_rev[0]);
                var commit_2 = $.asv.get_commit_hash(row.change_rev[1]);
                var commit_a = $('<a/>');
                var span = $('<span/>');
                if (commit_1) {
                    var commit_url;
                    if ($.asv.main_json.show_commit_url.match(/.*\/\/github.com\//)) {
                        commit_url = ($.asv.main_json.show_commit_url + '../compare/'
                                      + commit_1 + '...' + commit_2);
                    }
                    else {
                        commit_url = $.asv.main_json.show_commit_url + commit_2;
                    }
                    commit_a.attr('href', commit_url);
                    commit_a.text(commit_1 + '...' + commit_2);
                }
                else {
                    commit_a.attr('href', $.asv.main_json.show_commit_url + commit_2);
                    commit_a.text(commit_2);
                }
                var text = $.asv.format_date_yyyymmdd(date) + ' '
                span.text(text);
                span.append(commit_a);
                return span[0].outerHTML
              },
              createdCell: (td_tag, text, row, rowIndex, colIndex) => {
                td_tag.classList.add('change-date')
              }
            },
          ],
          columnControl: ['order', ['search', 'searchList']],
          layout: {
            bottomEnd: {
              paging: {
                firstLast: false
              }
            },
          },
          ordering: {
            indicators: false,
            handler: false
          },
          searching: true
        });
        return;
    }

    /*
     * Entry point
     */
    $.asv.register_page('summarylist', function(params) {
        var state_selection = null;

        if (Object.keys(params).length > 0) {
            state_selection = params;
        }

        setup_display(state_selection);

        $('#summarylist-display').show();
        $("#title").text("List of benchmarks");
    });
});
