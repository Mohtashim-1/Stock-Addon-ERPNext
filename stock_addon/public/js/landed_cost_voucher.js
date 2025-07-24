frappe.ui.form.on("Landed Cost Voucher", {
    refresh_fields: function(frm) {
        frm.refresh_field("purchase_receipts");
    },
    refresh: function(frm) {
        // Add debug log for refresh
        console.log("LCV: Form refreshed", frm);
        frm.fields_dict['purchase_receipts'].grid.get_field('receipt_document').get_query = function(doc, cdt, cdn) {
            console.log("LCV: get_query called for receipt_document", {doc, cdt, cdn});
            return {
                query: "stock_addon.stock_addon.overrides.landed_cost_voucher_override.purchase_receipt_query",
                filters: {}
            };
        };
    }
});

frappe.ui.form.on("Landed Cost Purchase Receipt", {
    receipt_document(frm, cdt, cdn) {
        var d = locals[cdt][cdn];
        console.log("LCV: receipt_document event triggered", d);
        if (d.receipt_document) {
            frappe.call({
                method: "stock_addon.stock_addon.overrides.landed_cost_voucher_override.get_receipt_document_details",
                args: {
                    receipt_document: d.receipt_document,
                    receipt_document_type: d.receipt_document_type,
                },
                callback: function (r) {
                    console.log("LCV: get_receipt_document_details response", r);
                    if (r.message) {
                        $.extend(d, r.message);
                        refresh_field("purchase_receipts");
                    }
                },
                error: function(err) {
                    console.error("LCV: get_receipt_document_details error", err);
                }
            });
        }
    },
    onload: function(frm) {
        console.log("LCV: Landed Cost Purchase Receipt child table loaded", frm);
    },
    supplier_delivery_note_input: function(frm, cdt, cdn) {
        var d = locals[cdt][cdn];
        if (d.supplier_delivery_note_input) {
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Purchase Receipt",
                    filters: {
                        supplier_delivery_note: d.supplier_delivery_note_input
                    },
                    fields: ["name"]
                },
                callback: function(r) {
                    if (r.message && r.message.length) {
                        d.receipt_document = r.message[0].name;
                        refresh_field("purchase_receipts");
                    } else {
                        frappe.msgprint("No Purchase Receipt found for this Supplier Delivery Note.");
                    }
                }
            });
        }
    }
});