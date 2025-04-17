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


// Filter item fuzzy search

frappe.listview_settings['Item'] = {
    onload: function (listview) {
        listview.page.add_inner_button('Filter Item', function () {
            let filtered_items = [];

            let d = new frappe.ui.Dialog({
                title: 'Search Item (Fuzzy)',
                fields: [
                    {
                        label: 'Search',
                        fieldname: 'search_text',
                        fieldtype: 'Data'
                    },
                    {
                        label: 'Results',
                        fieldname: 'results_html',
                        fieldtype: 'HTML'
                    }
                ],
                primary_action_label: 'Get Items',
                primary_action(values) {
                    d.hide();

                    // If we have results, apply filter to list view
                    if (filtered_items.length > 0) {
                        const names = filtered_items.map(item => item.name);

                        // Add filter to list view based on item name
                        listview.filter_area.add([
                            ['Item', 'name', 'in', names]
                        ]);
                    } else {
                        frappe.msgprint('No matching items to filter.');
                    }
                }
            });

            const searchAndRender = async () => {
                const search_txt = d.get_value('search_text') || '';
                const words = search_txt.toLowerCase().split(' ').filter(w => w);

                if (!search_txt) {
                    d.fields_dict.results_html.$wrapper.html('');
                    return;
                }

                const items = await frappe.db.get_list('Item', {
                    fields: ['name', 'item_name'],
                    limit: 100
                });

                filtered_items = items.filter(item => {
                    const fullText = `${item.name} ${item.item_name}`.toLowerCase();
                    return words.every(w => fullText.includes(w));
                });

                let html = '';
                if (filtered_items.length) {
                    html = '<ul>';
                    filtered_items.forEach(item => {
                        const url = `/app/item/${item.name}`;
                        html += `<li>
                            <a href="${url}" target="_blank">
                                <b>${item.name}</b>: ${item.item_name}
                            </a>
                        </li>`;
                    });
                    html += '</ul>';
                } else {
                    html = '<p>No matching items found</p>';
                }

                d.fields_dict.results_html.$wrapper.html(html);
            };

            d.fields_dict.search_text.$input.on('input', frappe.utils.debounce(searchAndRender, 300));

            d.show();
        });
    }
};


// filter item group based on item category

frappe.ui.form.on('Item', {
    setup: function(frm) {
        frm.set_query('item_group', function() {
            if (!frm.doc.custom_item_category) {
                frappe.msgprint({
                    message: '⚠️ <b>Please select an Item Category first.</b>',
                    indicator: 'orange'
                });
                return { filters: { name: '' } };  // Prevent selection
            }
            return {
                filters: {
                    custom_item_category: frm.doc.custom_item_category  // Filter dynamically
                }
            };
        });
    },

    custom_item_category: function(frm) {
        if (!frm.doc.custom_item_category) {
            frm.set_value('item_group', '');  // Clear Item Group if no category is selected
        } else {
            frm.set_query('item_group', function() {  // Apply filter dynamically
                return {
                    filters: {
                        custom_item_category: frm.doc.custom_item_category
                    }
                };
            });
        }
    }
});
