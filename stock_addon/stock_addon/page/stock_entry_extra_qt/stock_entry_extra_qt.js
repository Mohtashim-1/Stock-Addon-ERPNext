frappe.pages['stock-entry-extra-qt'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Stock Entry Extra Qty',
        single_column: true
    });

    var filters = {};

    filters.stock_entry = page.add_field({
        fieldname: 'stock_entry',
        label: 'Stock Entry',
        fieldtype: 'Link',
        options: 'Stock Entry'
    });

    filters.bom_no = page.add_field({
        fieldname: 'bom_no',
        label: 'BOM No',
        fieldtype: 'Link',
        options: 'BOM'
    });

    filters.from_date = page.add_field({
        fieldname: 'from_date',
        label: 'From Date',
        fieldtype: 'Date',
        default: frappe.datetime.get_today()
    });

    filters.to_date = page.add_field({
        fieldname: 'to_date',
        label: 'To Date',
        fieldtype: 'Date',
        default: frappe.datetime.get_today()
    });

    filters.item_code = page.add_field({
        fieldname: 'item_code',
        label: 'Item Code',
        fieldtype: 'Link',
        options: 'Item'
    });

    page.set_primary_action('Refresh', function() {
        load_data();
    });

    page.add_action_item('Email', function() {
        open_email_dialog();
    });

    var $container = $('<div class="stock-entry-extra-qt"></div>').appendTo(page.body);

    function get_filters() {
        return {
            stock_entry: filters.stock_entry.get_value(),
            bom_no: filters.bom_no.get_value(),
            from_date: filters.from_date.get_value(),
            to_date: filters.to_date.get_value(),
            item_code: filters.item_code.get_value()
        };
    }

    function escape_html(value) {
        return frappe.utils.escape_html(value == null ? '' : String(value));
    }

    function render(rows) {
        if (!rows || !rows.length) {
            $container.html('<p>No records found.</p>');
            return;
        }

        var head = [
            'Stock Entry',
            'Posting Date',
            'Stock Entry Type',
            'Purpose',
            'BOM No',
            'Item Code',
            'Item Name',
            'Qty',
            'Expected Qty',
            'Extra Qty',
            'UOM',
            'Source WH',
            'Target WH',
            'Work Order',
            'Company',
            'Exception'
        ];

        var html = [];
        html.push('<div class="table-responsive">');
        html.push('<table class="table table-bordered table-hover">');
        html.push('<thead><tr>');
        head.forEach(function(h) {
            html.push('<th>' + escape_html(h) + '</th>');
        });
        html.push('</tr></thead><tbody>');

        rows.forEach(function(row) {
            html.push('<tr>');
            var link = row.stock_entry ? ('<a href="/app/stock-entry/' + encodeURIComponent(row.stock_entry) + '">' + escape_html(row.stock_entry) + '</a>') : '';
            html.push('<td>' + link + '</td>');
            html.push('<td>' + escape_html(row.posting_date) + '</td>');
            html.push('<td>' + escape_html(row.stock_entry_type) + '</td>');
            html.push('<td>' + escape_html(row.purpose) + '</td>');
            html.push('<td>' + escape_html(row.bom_no) + '</td>');
            html.push('<td>' + escape_html(row.item_code) + '</td>');
            html.push('<td>' + escape_html(row.item_name) + '</td>');
            html.push('<td>' + escape_html(row.qty) + '</td>');
            html.push('<td>' + escape_html(row.expected_qty) + '</td>');
            html.push('<td>' + escape_html(row.extra_qty) + '</td>');
            html.push('<td>' + escape_html(row.uom) + '</td>');
            html.push('<td>' + escape_html(row.s_warehouse) + '</td>');
            html.push('<td>' + escape_html(row.t_warehouse) + '</td>');
            html.push('<td>' + escape_html(row.work_order) + '</td>');
            html.push('<td>' + escape_html(row.company) + '</td>');
            html.push('<td>' + escape_html(row.exception_type) + '</td>');
            html.push('</tr>');
        });

        html.push('</tbody></table></div>');
        $container.html(html.join(''));
    }

    function load_data() {
        frappe.call({
            method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_stock_entry_extra_qt_data',
            args: { filters: get_filters() },
            freeze: true,
            callback: function(r) {
                render(r.message || []);
            }
        });
    }

    function open_email_dialog() {
        var d = new frappe.ui.Dialog({
            title: 'Email Results',
            fields: [
                {
                    fieldname: 'recipients',
                    label: 'Recipients (leave blank for System Managers)',
                    fieldtype: 'MultiEmail'
                },
                {
                    fieldname: 'subject',
                    label: 'Subject',
                    fieldtype: 'Data',
                    default: 'Stock Entry Extra Qty Results'
                }
            ],
            primary_action_label: 'Send',
            primary_action: function(values) {
                d.hide();
                frappe.call({
                    method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.send_stock_entry_extra_qt_email',
                    args: {
                        filters: get_filters(),
                        recipients: values.recipients || '',
                        subject: values.subject
                    },
                    freeze: true,
                    callback: function(r) {
                        if (r.message) {
                            frappe.msgprint(r.message);
                        }
                    }
                });
            }
        });
        d.show();
    }

    load_data();
};
