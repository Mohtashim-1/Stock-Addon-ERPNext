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



// capitalize item code and item name 


frappe.ui.form.on('Item', {
    validate: function(frm) {
        if (frm.doc.item_name) {
            frm.set_value('item_name', frm.doc.item_name.toUpperCase());
        }
        if (frm.doc.item_code) {
            frm.set_value('item_code', frm.doc.item_code.toUpperCase());
        }
    }
});



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


// item restriction on category

frappe.ui.form.on('Item', {
    setup: function(frm) {
        // Hide all sections when form loads
        const sectionsToHide = [
            'Other Items',
            'Services',
            'Machine',
            'Stitched Goods',
            'Piping',
            'Finished Product',
            'custom_other_item_description',
            'custom_service_description',
            'custom_machine_description',
            'custom_stitched_goods_description',
            'custom_piping_type',
            'custom_piping_stitching_style',
            'custom_finished_group_description',
            'custom_thread',
            'custom_zip',
            'custom_general',
            'custom_belly_band',
            'custom_labels',
            'custom_cartons',
            'custom_protection_sheet',
            'custom_button',
            'custom_inner_sheet',
            'custom_inlay_card',
            'custom_sticker',
            'custom_shipping_mark',
            'custom_poly_bag',
            'custom_elastic',
            'custom_tape',
            'custom_slider',
            'custom_polyfil',
            'custom_spare_parts'
        ];

        sectionsToHide.forEach(section => {
            try {
                frm.set_df_property(section, 'hidden', 1);
            } catch (e) {
                console.log('Error hiding section:', section, e);
            }
        });
    },

    refresh: function(frm) {
        // Define category to section mappings
        const categorySections = {
            'Thread': ['custom_thread'],
            'ZIP': ['custom_zip'],
            'General': ['custom_general'],
            'Belly Band': ['custom_belly_band'],
            'Labels': ['custom_labels'],
            'Cartons': ['custom_cartons'],
            'Protection Sheet': ['custom_protection_sheet'],
            'Button': ['custom_button'],
            'Inner Sheet': ['custom_inner_sheet'],
            'Inlay Card': ['custom_inlay_card'],
            'Sticker': ['custom_sticker'],
            'Shipping Mark': ['custom_shipping_mark'],
            'Poly Bag': ['custom_poly_bag'],
            'Elastic': ['custom_elastic'],
            'Tape': ['custom_tape'],
            'Slider': ['custom_slider'],
            'Polyfill': ['custom_polyfil'],
            'Spare Parts': ['custom_spare_parts'],
            'custom_other_item': ['Other Items', 'Services']
        };

        // Define all sections that should be hidden for specific categories
        const sectionsToHide = [
            'Other Items',
            'Services',
            'Machine',
            'Stitched Goods',
            'Piping',
            'Finished Product',
            'custom_other_item_description',
            'custom_service_description',
            'custom_machine_description',
            'custom_stitched_goods_description',
            'custom_piping_type',
            'custom_piping_stitching_style',
            'custom_finished_group_description',
            'custom_thread',
            'custom_zip',
            'custom_general',
            'custom_belly_band',
            'custom_labels',
            'custom_cartons',
            'custom_protection_sheet',
            'custom_button',
            'custom_inner_sheet',
            'custom_inlay_card',
            'custom_sticker',
            'custom_shipping_mark',
            'custom_poly_bag',
            'custom_elastic',
            'custom_tape',
            'custom_slider',
            'custom_polyfil',
            'custom_spare_parts'
        ];

        if (!frm.doc.custom_item_category) {
            // Hide all sections if no category is selected
            sectionsToHide.forEach(section => {
                try {
                    frm.set_df_property(section, 'hidden', 1);
                } catch (e) {
                    console.log('Error hiding section:', section, e);
                }
            });
            return;
        }

        // Find the matching category (case-insensitive)
        const selectedCategory = Object.keys(categorySections).find(
            category => category.toLowerCase() === frm.doc.custom_item_category.toLowerCase()
        );

        if (selectedCategory) {
            // Hide all sections first
            sectionsToHide.forEach(section => {
                try {
                    frm.set_df_property(section, 'hidden', 1);
                } catch (e) {
                    console.log('Error hiding section:', section, e);
                }
            });

            // Show sections for the selected category
            const sectionsToShow = categorySections[selectedCategory];
            sectionsToShow.forEach(section => {
                try {
                    frm.set_df_property(section, 'hidden', 0);
                } catch (e) {
                    console.log('Error showing section:', section, e);
                }
            });
        } else {
            // Hide all sections if no matching category
            sectionsToHide.forEach(section => {
                try {
                    frm.set_df_property(section, 'hidden', 1);
                } catch (e) {
                    console.log('Error hiding section:', section, e);
                }
            });
        }
    }
});

