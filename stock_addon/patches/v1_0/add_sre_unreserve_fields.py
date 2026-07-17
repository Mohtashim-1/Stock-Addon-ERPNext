import frappe


def execute():
	from stock_addon.stock_addon.doctype.stock_reservation_entry.unreserve import (
		ensure_sre_unreserve_fields,
	)

	ensure_sre_unreserve_fields()
