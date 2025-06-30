frappe.listview_settings['Bin'] = {
    // make sure valuation_rate & stock_value come down in your API load
    add_fields: [
      "item_code","warehouse",
      "actual_qty","projected_qty","reserved_qty",
      "valuation_rate","stock_value"
    ],

    // show a little status badge
    get_indicator: function(doc) {
        if (doc.actual_qty > 0) {
        return [__("In Stock"), "green", "actual_qty,>,0"];
        } else if (doc.projected_qty > 0) {
        return [__("Projected"), "orange", "projected_qty,>,0"];
        } else {
        return [__("Out of Stock"), "red", "actual_qty,=,0"];
        }
    },
    show_indicators: true,
  
    onload: function(listview) {
      // 1) Recalc selected
      listview.page.add_inner_button(__('Recalculate Selected'), () => {
        let docs = listview.get_checked_items();
        if (!docs.length) {
          frappe.msgprint(__('Select at least one row'));
          return;
        }
        frappe.confirm(
          __('Recalculate qty & valuation for {0} selected bins?', [docs.length]),
          () => {
            // call your whitelisted python method for each
            let calls = docs.map(d =>
              frappe.call({
                method: 'stock_addon.stock_addon.doctype.bin.bin.recalculate_qty',
                args: { bin_name: d.name },
                freeze: true
              })
            );
            Promise.all(calls).then(() => listview.refresh());
          }
        );
      });
  
      // 2) Recalc all
      listview.page.add_inner_button(__('Recalculate All Bins'), () => {
        frappe.confirm(
          __('Recalculate qty & valuation for ALL bins? This could take a while.'),
          () => {
            frappe.call({
              method: 'stock_addon.stock_addon.doctype.bin.bin.recalculate_all_bins',
              freeze: true,
              callback: () => listview.refresh()
            });
          }
        );
      });
    }
  };
  