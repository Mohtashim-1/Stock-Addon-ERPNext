// Item filter by customer

frappe.listview_settings['Item'] = {
    onload: function(listview) {
        listview.page.add_inner_button('Filter by Customer', function() {
            let d = new frappe.ui.Dialog({
                title: 'Enter details',
                fields: [
                    {
                        label: 'Select Customer',
                        fieldname: 'customer',
                        fieldtype: 'Link',
                        options: "Customer"
                    }
                ],
                size: 'small', // small, large, extra-large 
                primary_action_label: 'Submit',
                primary_action(values) {
                    if (values.customer) {
                        listview.filter_area.add([
                            ['Allowed Customer', 'customer', '=', values.customer]
                        ]);
                    }
                    d.hide();
                }
            });

            d.show();
        });
    }
};
