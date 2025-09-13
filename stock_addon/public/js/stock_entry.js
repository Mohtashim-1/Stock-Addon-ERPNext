frappe.ui.form.on("Stock Entry", {
    refresh: function(frm) {
        if (frm.doc.stock_entry_type == "Material Transfer for Manufacture" || frm.doc.stock_entry_type == "Manufacture") {
            frm.set_df_property("custom_cost_center", "reqd", 1);
        } else {
            frm.set_df_property("custom_cost_center", "reqd", 0); 
        }
    }
});

frappe.ui.form.on('Stock Entry', {
    refresh: function(frm) {
        // Add custom buttons to the existing "Get Items From" dropdown
        if (frm.doc.docstatus === 0) {
            // Add "Warehouse" option to Get Items From dropdown
            frm.add_custom_button(__('Warehouse'), function() {
                show_warehouse_dialog(frm);
            }, __('Get Items From'));
            
            // Add "Sales Order" option to Get Items From dropdown
            frm.add_custom_button(__('Sales Order'), function() {
                show_sales_order_dialog(frm);
            }, __('Get Items From'));
        }
    }
});

function show_warehouse_dialog(frm) {
    const dialog = new frappe.ui.Dialog({
        title: __('Get Items from Warehouse'),
        fields: [
            {
                fieldtype: 'Link',
                fieldname: 'warehouse',
                label: __('Warehouse'),
                options: 'Warehouse',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            is_group: 0
                        }
                    };
                }
            },
            {
                fieldtype: 'Check',
                fieldname: 'include_zero_qty',
                label: __('Include Zero Quantity Items'),
                default: 0
            },
            {
                fieldtype: 'Check',
                fieldname: 'clear_existing',
                label: __('Clear Existing Items'),
                default: 0
            }
        ],
        primary_action_label: __('Get Items'),
        primary_action: function(values) {
            if (!values.warehouse) {
                frappe.msgprint(__('Please select a warehouse'));
                return;
            }
            
            frappe.show_alert({
                message: __('Fetching items from warehouse...'),
                indicator: 'blue'
            });
            
            frappe.call({
                method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_items_from_source',
                args: {
                    source_type: 'Warehouse',
                    source: values.warehouse,
                    include_zero_qty: values.include_zero_qty,
                    company: frm.doc.company
                },
                callback: function(r) {
                    if (r.message && r.message.items) {
                        if (values.clear_existing) {
                            frm.clear_table('items');
                        }
                        
                        r.message.items.forEach(item => {
                            const row = frm.add_child('items');
                            row.item_code = item.item_code;
                            row.item_name = item.item_name;
                            row.qty = item.qty;
                            row.uom = item.uom;
                            row.stock_uom = item.stock_uom;
                            row.conversion_factor = item.conversion_factor;
                            row.s_warehouse = values.warehouse;
                            
                            if (frm.doc.purpose === 'Material Transfer') {
                                row.t_warehouse = frm.doc.to_warehouse;
                            }
                            
                            row.basic_rate = item.rate || 0;
                            row.valuation_rate = item.valuation_rate || 0;
                        });
                        
                        frm.refresh_field('items');
                        dialog.hide();
                        
                        frappe.show_alert({
                            message: __('{0} items added successfully', [r.message.items.length]),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint(__('No items found in this warehouse'));
                    }
                },
                error: function(r) {
                    frappe.msgprint(__('Error fetching items: {0}', [r.message || 'Unknown error']));
                }
            });
        }
    });
    
    dialog.show();
}

function show_sales_order_dialog(frm) {
    const dialog = new frappe.ui.Dialog({
        title: __('Get Items from Sales Order'),
        fields: [
            {
                fieldtype: 'Link',
                fieldname: 'sales_order',
                label: __('Sales Order'),
                options: 'Sales Order',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            docstatus: 1,
                            status: ['not in', ['Stopped', 'Closed']]
                        }
                    };
                }
            },
            {
                fieldtype: 'Check',
                fieldname: 'clear_existing',
                label: __('Clear Existing Items'),
                default: 0
            }
        ],
        primary_action_label: __('Get Items'),
        primary_action: function(values) {
            if (!values.sales_order) {
                frappe.msgprint(__('Please select a sales order'));
                return;
            }
            
            frappe.show_alert({
                message: __('Fetching items from sales order...'),
                indicator: 'blue'
            });
            
            frappe.call({
                method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_items_from_source',
                args: {
                    source_type: 'Sales Order',
                    source: values.sales_order,
                    include_zero_qty: false,
                    company: frm.doc.company
                },
                callback: function(r) {
                    if (r.message && r.message.items) {
                        if (values.clear_existing) {
                            frm.clear_table('items');
                        }
                        
                        r.message.items.forEach(item => {
                            const row = frm.add_child('items');
                            row.item_code = item.item_code;
                            row.item_name = item.item_name;
                            row.qty = item.qty;
                            row.uom = item.uom;
                            row.stock_uom = item.stock_uom;
                            row.conversion_factor = item.conversion_factor;
                            row.s_warehouse = item.warehouse;
                            
                            if (frm.doc.purpose === 'Material Transfer') {
                                row.t_warehouse = frm.doc.to_warehouse;
                            }
                            
                            row.basic_rate = item.rate || 0;
                            row.valuation_rate = item.valuation_rate || 0;
                        });
                        
                        frm.refresh_field('items');
                        dialog.hide();
                        
                        frappe.show_alert({
                            message: __('{0} items added successfully', [r.message.items.length]),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint(__('No items found in this sales order'));
                    }
                },
                error: function(r) {
                    frappe.msgprint(__('Error fetching items: {0}', [r.message || 'Unknown error']));
                }
            });
        }
    });
    
    dialog.show();
}