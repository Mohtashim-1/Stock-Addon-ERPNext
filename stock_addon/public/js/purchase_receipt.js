frappe.ui.form.on('Purchase Receipt', {
    refresh: function(frm) {
        toggle_landed_cost_field(frm);
    },
    naming_series: function(frm) {
        toggle_landed_cost_field(frm);
    },
    onload_post_render: function(frm) {
        toggle_landed_cost_field(frm);
    },
    supplier_delivery_note: function(frm) {
        toggle_landed_cost_field(frm);
    }
});

function toggle_landed_cost_field(frm) {
    frappe.msgprint(frm.doc.naming_series);
    const allowed_series = [
        "PR-FABRIC-.###.-.YY.",
        "PR-IMP MATERIAL-.###.-.YY.",
        "PR-STOCK LOT-.###.-.YY.",
        "PR-TOWEL-.###.-.YY."
    ];

    // Hide and make not mandatory by default
    frm.set_df_property('custom_create_landed_cost_', 'hidden', 1);
    frm.set_df_property('custom_create_landeud_cost_', 'reqd', 0);

    // Show and make mandatory if the naming_series matches any allowed series
    if (allowed_series.includes(frm.doc.naming_series)) {
        frm.set_df_property('custom_create_landed_cost_', 'hidden', 0);
        frm.set_df_property('custom_create_landed_cost_', 'reqd', 1);
    }
}