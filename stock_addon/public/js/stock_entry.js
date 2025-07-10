frappe.ui.form.on("Stock Entry", {
    refresh: function(frm) {
        if (frm.doc.stock_entry_type == "Material Transfer for Manufacture" || frm.doc.stock_entry_type == "Manufacture") {
            frm.set_df_property("custom_cost_center", "reqd", 1);
        } else {
            frm.set_df_property("custom_cost_center", "reqd", 0); 
        }
    }
});
