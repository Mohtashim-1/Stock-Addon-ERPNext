frappe.listview_settings['Bin'] = {
    add_fields: ["item_code", "warehouse", "actual_qty", "projected_qty", "reserved_qty"],
    get_indicator: function(doc) {
        if (doc.actual_qty > 0) {
            return [__("In Stock"), "green", "actual_qty,>,0"];
        } else if (doc.projected_qty > 0) {
            return [__("Projected"), "orange", "projected_qty,>,0"];
        } else {
            return [__("Out of Stock"), "red", "actual_qty,=,0"];
        }
    },
    onload: function(listview) {
        // Add custom button for recalculating bin quantities
        listview.page.add_inner_button(__('Recalculate Bin Qty'), function() {
            let selected_docs = listview.get_checked_items();
            
            if (selected_docs.length === 0) {
                frappe.msgprint(__('Please select at least one bin to recalculate.'));
                return;
            }
            
            frappe.confirm(
                __(`Are you sure you want to recalculate quantities for ${selected_docs.length} selected bin(s)?`),
                function() {
                    // User confirmed, proceed with recalculation
                    let promises = selected_docs.map(doc => {
                        return frappe.call({
                            method: 'stock_addon.stock_addon.doctype.bin.bin.recalculate_qty',
                            args: {
                                bin_name: doc.name
                            },
                            freeze: true
                        });
                    });
                    
                    Promise.all(promises).then(() => {
                        frappe.show_alert(__(`Successfully recalculated ${selected_docs.length} bin(s)`), 3);
                        listview.refresh();
                    }).catch((error) => {
                        frappe.msgprint(__('Error occurred while recalculating bin quantities.'));
                        console.error('Bin recalculation error:', error);
                    });
                },
                function() {
                    // User cancelled
                }
            );
        });
        
        // Add bulk recalculate all button
        listview.page.add_inner_button(__('Recalculate All Bins'), function() {
            frappe.confirm(
                __('Are you sure you want to recalculate quantities for ALL bins? This may take some time.'),
                function() {
                    frappe.call({
                        method: 'stock_addon.stock_addon.doctype.bin.bin.recalculate_all_bins',
                        freeze: true,
                        callback: function(r) {
                            if (r.message) {
                                frappe.show_alert(__('Successfully recalculated all bins'), 3);
                                listview.refresh();
                            }
                        }
                    });
                },
                function() {
                    // User cancelled
                }
            );
        });
    }
};
