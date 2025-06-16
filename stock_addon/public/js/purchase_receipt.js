frappe.ui.form.on('Purchase Receipt', {
    refresh: function(frm) {
        // List of allowed series
        const allowed_series = [
            "PR-FABRIC-.###.-.YY.",
            "PR-IMP MATERIAL-.###.-.YY.",
            "PR-STOCK LOT-.###.-.YY.",
            "PR-TOWEL-.###.-.YY."
        ];

        // Hide and make not mandatory by default
        frm.set_df_property('custom_create_landed_cost_', 'hidden', 1);
        frm.set_df_property('custom_create_landed_cost_', 'reqd', 0);

        // Show and make mandatory if the naming_series matches any allowed series
        if (allowed_series.includes(frm.doc.naming_series)) {
            frm.set_df_property('custom_create_landed_cost_', 'hidden', 0);
            frm.set_df_property('custom_create_landed_cost_', 'reqd', 1);
        }
    }
});