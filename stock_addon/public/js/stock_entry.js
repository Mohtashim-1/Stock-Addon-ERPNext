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
            
            // Add "Warehouse with Sales Order" option to Get Items From dropdown
            frm.add_custom_button(__('Warehouse with Sales Order'), function() {
                show_warehouse_with_sales_order_dialog(frm);
            }, __('Get Items From'));
            
            // Add "Cost Center" option to Get Items From dropdown
            frm.add_custom_button(__('Cost Center'), function() {
                show_cost_center_dialog(frm);
            }, __('Get Items From'));
        }
    }
});

function show_warehouse_dialog(frm) {
    console.log('[DEBUG] show_warehouse_dialog called');
    
    const dialog = new frappe.ui.Dialog({
        title: __('Get Items from Warehouse'),
        fields: [
            {
                fieldtype: 'Table',
                fieldname: 'warehouse_table',
                label: __('Select Warehouses'),
                fields: [
                    {
                        fieldtype: 'Link',
                        fieldname: 'warehouse',
                        label: __('Warehouse'),
                        options: 'Warehouse',
                        reqd: 1,
                        in_list_view: 1,
                        get_query: function() {
                            return {
                                filters: {
                                    is_group: 0
                                }
                            };
                        }
                    }
                ],
                data: [{}] // Pre-populate with one empty row
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
            console.log('[DEBUG] Warehouse dialog values:', values);
            
            if (!values.warehouse_table || values.warehouse_table.length === 0) {
                frappe.msgprint(__('Please add at least one warehouse'));
                return;
            }
            
            const warehouses = values.warehouse_table.map(row => row.warehouse).filter(Boolean);
            console.log('[DEBUG] Extracted warehouses:', warehouses);
            
            if (warehouses.length === 0) {
                frappe.msgprint(__('Please select at least one warehouse'));
                return;
            }
            
            frappe.show_alert({
                message: __('Fetching items from warehouses...'),
                indicator: 'blue'
            });
            
            const args = {
                source_type: 'Warehouse',
                source: warehouses[0], // For backward compatibility
                warehouses: warehouses,
                include_zero_qty: values.include_zero_qty,
                company: frm.doc.company
            };
            
            console.log('[DEBUG] Calling server with args:', args);
            
            frappe.call({
                method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_items_from_source',
                args: args,
                callback: function(r) {
                    console.log('[DEBUG] Server response:', r);
                    
                    if (r.message && r.message.items) {
                        console.log('[DEBUG] Items received:', r.message.items.length);
                        console.log('[DEBUG] First few items:', r.message.items.slice(0, 3));
                        
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
                        console.log('[DEBUG] No items in response');
                        frappe.msgprint(__('No items found in selected warehouses'));
                    }
                },
                error: function(r) {
                    console.log('[DEBUG] Server error:', r);
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

function show_warehouse_with_sales_order_dialog(frm) {
    const dialog = new frappe.ui.Dialog({
        title: __('Get Items from Warehouse with Sales Order'),
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
                fieldtype: 'Table',
                fieldname: 'warehouse_table',
                label: __('Select Warehouses'),
                fields: [
                    {
                        fieldtype: 'Link',
                        fieldname: 'warehouse',
                        label: __('Warehouse'),
                        options: 'Warehouse',
                        reqd: 1,
                        in_list_view: 1,
                        get_query: function() {
                            return {
                                filters: {
                                    is_group: 0
                                }
                            };
                        }
                    }
                ],
                data: [{}] // Pre-populate with one empty row
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
            if (!values.sales_order) {
                frappe.msgprint(__('Please select a sales order'));
                return;
            }
            
            if (!values.warehouse_table || values.warehouse_table.length === 0) {
                frappe.msgprint(__('Please add at least one warehouse'));
                return;
            }
            
            const warehouses = values.warehouse_table.map(row => row.warehouse).filter(Boolean);
            
            if (warehouses.length === 0) {
                frappe.msgprint(__('Please select at least one warehouse'));
                return;
            }
            
            frappe.show_alert({
                message: __('Fetching items from warehouses tagged to sales order...'),
                indicator: 'blue'
            });
            
            frappe.call({
                method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_items_from_source',
                args: {
                    source_type: 'Warehouse with Sales Order',
                    source: warehouses[0], // For backward compatibility
                    warehouses: warehouses,
                    sales_order: values.sales_order,
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
                            row.s_warehouse = item.warehouse;
                            
                            // Add sales order reference if available
                            if (item.sales_order) {
                                row.against_sales_order = item.sales_order;
                            }
                            
                            if (frm.doc.purpose === 'Material Transfer') {
                                row.t_warehouse = frm.doc.to_warehouse;
                            }
                            
                            row.basic_rate = item.rate || 0;
                            row.valuation_rate = item.valuation_rate || 0;
                        });
                        
                        frm.refresh_field('items');
                        dialog.hide();
                        
                        frappe.show_alert({
                            message: __('{0} items added successfully from sales order {1}', [r.message.items.length, values.sales_order]),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint(__('No items found in selected warehouses for this sales order'));
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

function show_cost_center_dialog(frm) {
    console.log('[DEBUG] show_cost_center_dialog called');
    
    const dialog = new frappe.ui.Dialog({
        title: __('Get Items from Cost Center'),
        fields: [
            {
                fieldtype: 'Link',
                fieldname: 'cost_center',
                label: __('Cost Center (Optional)'),
                options: 'Cost Center',
                get_query: function() {
                    return {
                        filters: {
                            is_group: 0,
                            disabled: 0
                        }
                    };
                }
            },
            {
                fieldtype: 'Table',
                fieldname: 'warehouse_table',
                label: __('Select Warehouses'),
                fields: [
                    {
                        fieldtype: 'Link',
                        fieldname: 'warehouse',
                        label: __('Warehouse'),
                        options: 'Warehouse',
                        reqd: 1,
                        in_list_view: 1,
                        get_query: function() {
                            return {
                                filters: {
                                    is_group: 0
                                }
                            };
                        }
                    }
                ],
                data: [{}] // Pre-populate with one empty row
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
            console.log('[DEBUG] Cost Center dialog values:', values);
            
            if (!values.warehouse_table || values.warehouse_table.length === 0) {
                frappe.msgprint(__('Please add at least one warehouse'));
                return;
            }
            
            const warehouses = values.warehouse_table.map(row => row.warehouse).filter(Boolean);
            console.log('[DEBUG] Extracted warehouses:', warehouses);
            
            if (warehouses.length === 0) {
                frappe.msgprint(__('Please select at least one warehouse'));
                return;
            }
            
            frappe.show_alert({
                message: __('Fetching items from warehouses...'),
                indicator: 'blue'
            });
            
            const args = {
                source_type: 'Cost Center',
                source: warehouses[0], // For backward compatibility
                warehouses: warehouses,
                cost_center: values.cost_center || null,
                include_zero_qty: values.include_zero_qty,
                company: frm.doc.company
            };
            
            console.log('[DEBUG] Calling server with args:', args);
            
            frappe.call({
                method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_items_from_source',
                args: args,
                callback: function(r) {
                    console.log('[DEBUG] Server response:', r);
                    
                    if (r.message && r.message.items) {
                        console.log('[DEBUG] Items received:', r.message.items.length);
                        console.log('[DEBUG] First few items:', r.message.items.slice(0, 3));
                        
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
                            
                            // Set cost center if provided
                            if (values.cost_center) {
                                row.cost_center = values.cost_center;
                            }
                            
                            if (frm.doc.purpose === 'Material Transfer') {
                                row.t_warehouse = frm.doc.to_warehouse;
                            }
                            
                            row.basic_rate = item.rate || 0;
                            row.valuation_rate = item.valuation_rate || 0;
                        });
                        
                        frm.refresh_field('items');
                        dialog.hide();
                        
                        const message = values.cost_center 
                            ? __('{0} items added successfully from cost center {1}', [r.message.items.length, values.cost_center])
                            : __('{0} items added successfully from warehouses', [r.message.items.length]);
                        
                        frappe.show_alert({
                            message: message,
                            indicator: 'green'
                        });
                    } else {
                        console.log('[DEBUG] No items in response');
                        const message = values.cost_center 
                            ? __('No items found in selected warehouses for cost center {0}', [values.cost_center])
                            : __('No items found in selected warehouses');
                        frappe.msgprint(message);
                    }
                },
                error: function(r) {
                    console.log('[DEBUG] Server error:', r);
                    frappe.msgprint(__('Error fetching items: {0}', [r.message || 'Unknown error']));
                }
            });
        }
    });
    
    dialog.show();
}