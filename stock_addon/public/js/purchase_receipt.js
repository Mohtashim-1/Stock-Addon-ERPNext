frappe.ui.form.on('Purchase Receipt', {
    refresh: function(frm) {
        console.log("Purchase Receipt - refresh event triggered");
        console.log("Form doc:", frm.doc);
        toggle_landed_cost_field(frm);
        add_custom_buttons(frm);
    },
    naming_series: function(frm) {
        console.log("Purchase Receipt - naming_series event triggered");
        console.log("Naming series:", frm.doc.naming_series);
        toggle_landed_cost_field(frm);
    },
    onload_post_render: function(frm) {
        console.log("Purchase Receipt - onload_post_render event triggered");
        toggle_landed_cost_field(frm);
    },
    supplier_delivery_note: function(frm) {
        console.log("Purchase Receipt - supplier_delivery_note event triggered");
        toggle_landed_cost_field(frm);
    }
});

function toggle_landed_cost_field(frm) {
    console.log("toggle_landed_cost_field function called");
    console.log("Current naming_series:", frm.doc.naming_series);
    
    const allowed_series = [
        "PR-FABRIC-.###.-.YY.",
        "PR-IMP MATERIAL-.###.-.YY.",
        "PR-STOCK LOT-.###.-.YY.",
        "PR-TOWEL-.###.-.YY."
    ];
    
    console.log("Allowed series:", allowed_series);
    console.log("Is current series in allowed list:", allowed_series.includes(frm.doc.naming_series));

    // Check if the custom field exists
    if (frm.fields_dict['custom_create_landed_cost_']) {
        console.log("Custom field 'custom_create_landed_cost_' exists");
        
        // Hide and make not mandatory by default
        frm.set_df_property('custom_create_landed_cost_', 'hidden', 1);
        frm.set_df_property('custom_create_landed_cost_', 'reqd', 0);
        console.log("Field hidden and made not mandatory");

        // Show and make mandatory if the naming_series matches any allowed series
        if (allowed_series.includes(frm.doc.naming_series)) {
            frm.set_df_property('custom_create_landed_cost_', 'hidden', 0);
            frm.set_df_property('custom_create_landed_cost_', 'reqd', 1);
            console.log("Field shown and made mandatory for series:", frm.doc.naming_series);
        }
    } else {
        console.error("Custom field 'custom_create_landed_cost_' does not exist!");
        frappe.msgprint("Error: Custom field 'custom_create_landed_cost_' not found. Please check if the field exists in the doctype.");
    }
}

function add_custom_buttons(frm) {
    console.log("add_custom_buttons function called");
    console.log("Form status:", frm.doc.status);
    console.log("Is return:", frm.doc.is_return);
    console.log("Docstatus:", frm.doc.docstatus);
    
    // Post-submit actions: status buttons & create actions
    if (!frm.doc.is_return && frm.doc.status !== "Closed") {
        console.log("Conditions met for adding custom buttons");
        if (frm.doc.docstatus === 0) {
            console.log("Adding Purchase Order button");
            // Get Items From → Purchase Order
            frm.add_custom_button(__("Purchase Order"), function () {
                console.log("Purchase Order button clicked");
                if (!frm.doc.supplier) {
                    console.log("No supplier selected");
                    frappe.throw({ title: __("Mandatory"), message: __("Please Select a Supplier") });
                }
                console.log("Supplier selected:", frm.doc.supplier);
                erpnext.utils.map_current_doc({
                    method: "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
                    source_doctype: "Purchase Order",
                    target: frm,
                    setters: {
                        supplier: frm.doc.supplier,
                        schedule_date: undefined,
                        custom_reference: undefined,
                    },
                    get_query_filters: {
                        docstatus: 1,
                        status: ["not in", ["Closed", "On Hold"]],
                        per_received: ["<", 99.99],
                        company: frm.doc.company,
                    },
                });
            }, __("Get Items From"));
        } else {
            console.log("Docstatus is not 0, not adding button");
        }
    } else {
        console.log("Conditions not met for adding custom buttons");
    }
}

// (Optional) Monkey-patch to disable the built-in General Ledger popup for this form.
// Safe-guards so it only runs if the controller exists and loads.
frappe.after_ajax(() => {
    console.log("frappe.after_ajax callback triggered");
    if (erpnext?.stock?.PurchaseReceiptController) {
        console.log("PurchaseReceiptController found, patching show_general_ledger");
        erpnext.stock.PurchaseReceiptController.prototype.show_general_ledger = function () {
            console.log("show_general_ledger called (disabled)");
            // no-op: intentionally disabled
        };
    } else {
        console.log("PurchaseReceiptController not found");
    }
});

// Additional debug: Check if the script is loaded
console.log("Purchase Receipt script loaded successfully");
frappe.msgprint("Purchase Receipt script loaded - check console for debug messages");
