frappe.ui.form.on("Stock Reservation Entry", {
	refresh(frm) {
		frm.trigger("add_unreserve_buttons");
	},

	add_unreserve_buttons(frm) {
		if (frm.is_new() || frm.doc.docstatus !== 1) return;
		if (frm.doc.status === "Cancelled") return;

		const manually_unreserved = cint(frm.doc.custom_manually_unreserved);
		const open_qty =
			flt(frm.doc.reserved_qty) -
			flt(frm.doc.delivered_qty) -
			flt(frm.doc.transferred_qty) -
			flt(frm.doc.consumed_qty);

		if (!manually_unreserved && open_qty > 0) {
			frm.add_custom_button(__("Unreserve Stock"), () => {
				frappe.confirm(
					__(
						"Unreserve open qty without cancelling this entry?<br><br>Stock will become free for other documents. This SRE stays <b>Submitted</b>."
					),
					() => {
						frappe.call({
							method:
								"stock_addon.stock_addon.doctype.stock_reservation_entry.unreserve.unreserve_stock_reservation_entry",
							args: { name: frm.doc.name },
							freeze: true,
							freeze_message: __("Unreserving..."),
							callback() {
								frm.reload_doc();
							},
						});
					}
				);
			}).addClass("btn-primary");
		}

		if (manually_unreserved) {
			frm.add_custom_button(__("Re-reserve Stock"), () => {
				frappe.confirm(__("Put the previously unreserved qty back on reservation?"), () => {
					frappe.call({
						method:
							"stock_addon.stock_addon.doctype.stock_reservation_entry.unreserve.rereserve_stock_reservation_entry",
						args: { name: frm.doc.name },
						freeze: true,
						freeze_message: __("Re-reserving..."),
						callback() {
							frm.reload_doc();
						},
					});
				});
			});
		}
	},
});
