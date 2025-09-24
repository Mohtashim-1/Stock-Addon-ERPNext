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
            // frm.add_custom_button(__('Warehouse'), function() {
            //     show_warehouse_dialog(frm);
            // }, __('Get Items From'));
            
            // Add "Sales Order" option to Get Items From dropdown
            // frm.add_custom_button(__('Sales Order'), function() {
            //     show_sales_order_dialog(frm);
            // }, __('Get Items From'));
            
            // Add "Warehouse with Sales Order" option to Get Items From dropdown
            // frm.add_custom_button(__('Warehouse with Sales Order'), function() {
            //     show_warehouse_with_sales_order_dialog(frm);
            // }, __('Get Items From'));
            
            // Add "Cost Center" option to Get Items From dropdown
            frm.add_custom_button(__('Warehouse with Cost Center'), function() {
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
                            if (!(flt(item.qty) > 0)) { return; }
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
                            // Ensure Qty as per Stock UOM is populated
                            row.transfer_qty = flt(row.qty) * flt(row.conversion_factor || 1);
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
                            if (!(flt(item.qty) > 0)) { return; }
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
                            // Ensure Qty as per Stock UOM is populated
                            row.transfer_qty = flt(row.qty) * flt(row.conversion_factor || 1);
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
                            if (!(flt(item.qty) > 0)) { return; }
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
                            // Ensure Qty as per Stock UOM is populated
                            row.transfer_qty = flt(row.qty) * flt(row.conversion_factor || 1);
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
                            is_group: 0
                        }
                    };
                }
            },
            {
                fieldtype: 'Section Break',
                label: __('Warehouse Selection')
            },
            {
                fieldtype: 'Table',
                fieldname: 'warehouse_table',
                label: __('Select Warehouses'),
                reqd: 1,
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
                ]
            },
            {
                fieldtype: 'Section Break',
                label: __('Item Group Filter (Optional)')
            },
            {
                fieldtype: 'MultiSelectPills',
                fieldname: 'item_groups',
                label: __('Select Item Groups'),
                default: [], // Ensure it starts empty
                get_data: function(txt) {
                    console.log('[DEBUG] get_data called with txt:', txt);
                    return new Promise((resolve) => {
                        // Only fetch data if there's actual text input
                        if (!txt || txt.length < 1) {
                            resolve([]);
                            return;
                        }
                        
                        frappe.call({
                            method: 'frappe.client.get_list',
                            args: {
                                doctype: 'Item Group',
                                filters: {
                                    'name': ['like', `%${txt}%`] // Filter by search text
                                },
                                fields: ['name', 'is_group'],
                                limit_start: 0,
                                limit_page_length: 100, // Reduced limit
                                order_by: 'name asc'
                            }
                        }).then(r => {
                            console.log('[DEBUG] Item groups fetched for search:', txt, r.message);
                            
                            const results = (r.message || []).map(item => ({
                                value: item.name,
                                description: `${item.name} ${item.is_group ? '(Group)' : '(Item)'}`
                            }));
                            console.log('[DEBUG] Processed results:', results);
                            resolve(results);
                        }).catch((err) => {
                            console.error('[DEBUG] Error fetching item groups:', err);
                            resolve([]);
                        });
                    });
                }
            },
            {
                fieldtype: 'Section Break',
                label: __('Options')
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
            console.log('[DEBUG] Raw item_groups value:', values.item_groups);
            console.log('[DEBUG] Type of item_groups:', typeof values.item_groups);
            
            if (!values.warehouse_table || values.warehouse_table.length === 0) {
                frappe.msgprint(__('Please select at least one warehouse'));
                return;
            }
            
            // Extract warehouses from table
            const warehouses = values.warehouse_table.map(row => row.warehouse).filter(Boolean);
            console.log('[DEBUG] Extracted warehouses:', warehouses);
            
            // Extract item groups - handle multiple formats
            let item_groups = [];
            if (values.item_groups) {
                console.log('[DEBUG] Processing item_groups...');
                
                if (typeof values.item_groups === 'string') {
                    console.log('[DEBUG] item_groups is string, trying to parse...');
                    try {
                        item_groups = JSON.parse(values.item_groups);
                        console.log('[DEBUG] Parsed from JSON:', item_groups);
                    } catch (e) {
                        console.log('[DEBUG] JSON parse failed, treating as single value');
                        item_groups = [values.item_groups];
                    }
                } else if (Array.isArray(values.item_groups)) {
                    console.log('[DEBUG] item_groups is already array');
                    item_groups = values.item_groups;
                } else if (typeof values.item_groups === 'object') {
                    console.log('[DEBUG] item_groups is object, extracting values...');
                    item_groups = Object.values(values.item_groups).filter(Boolean);
                }
            }
            console.log('[DEBUG] Final extracted item groups:', item_groups);
            
            // Get the primary action button and show loading state
            const primary_btn = dialog.$wrapper.find('.btn-primary');
            const original_text = primary_btn.text();
            const original_disabled = primary_btn.prop('disabled');
            
            // Show loading state
            primary_btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> ' + __('Loading...'));
            
            frappe.show_alert({
                message: __('Fetching items from warehouses...'),
                indicator: 'blue'
            });
            
            const args = {
                source_type: 'Cost Center',
                source: warehouses[0], // Pass first warehouse as source
                warehouses: warehouses,
                cost_center: values.cost_center || null,
                item_groups: item_groups,
                include_zero_qty: values.include_zero_qty,
                company: frm.doc.company
            };
            
            console.log('[DEBUG] Calling server with args:', args);
            
            frappe.call({
                method: 'stock_addon.stock_addon.doctype.stock_entry.stock_entry.get_items_from_source',
                args: args,
                callback: function(r) {
                    console.log('[DEBUG] Server response:', r);
                    
                    // Restore button state
                    primary_btn.prop('disabled', original_disabled).text(original_text);
                    
                    if (r.message && r.message.items) {
                        console.log('[DEBUG] Items received:', r.message.items.length);
                        console.log('[DEBUG] First few items:', r.message.items.slice(0, 3));
                        
                        if (values.clear_existing) {
                            frm.clear_table('items');
                        }
                        
                        r.message.items.forEach(item => {
                            if (!(flt(item.qty) > 0)) { return; }
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
                            // Ensure Qty as per Stock UOM is populated
                            row.transfer_qty = flt(row.qty) * flt(row.conversion_factor || 1);
                        });
                        
                        frm.refresh_field('items');
                        dialog.hide();
                        
                        frappe.show_alert({
                            message: __('{0} items added successfully', [r.message.items.length]),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint(__('No items found'));
                    }
                },
                error: function(r) {
                    console.error('[DEBUG] Server error:', r);
                    
                    // Restore button state on error
                    primary_btn.prop('disabled', original_disabled).text(original_text);
                    
                    frappe.msgprint(__('Error fetching items: {0}', [r.message || 'Unknown error']));
                }
            });
        }
    });
    
    dialog.show();
}