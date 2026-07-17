import frappe


def execute():
	from stock_addon.stock_addon.doctype.stock_entry.pp_reserved_stock import (
		ensure_stock_entry_reservation_fields,
	)

	ensure_stock_entry_reservation_fields()
	frappe.clear_cache(doctype="Stock Entry")
