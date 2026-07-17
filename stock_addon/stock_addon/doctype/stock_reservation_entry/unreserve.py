# Copyright (c) 2026, SAH and contributors
"""Unreserve Stock Reservation Entry without cancelling the document."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, now_datetime


def ensure_sre_unreserve_fields():
	fields = [
		{
			"fieldname": "custom_manually_unreserved",
			"label": "Manually Unreserved",
			"fieldtype": "Check",
			"insert_after": "status",
			"read_only": 1,
			"no_copy": 1,
			"description": "Set when stock was unreserved via Unreserve (without Cancel).",
		},
		{
			"fieldname": "custom_unreserved_qty",
			"label": "Unreserved Qty",
			"fieldtype": "Float",
			"insert_after": "custom_manually_unreserved",
			"read_only": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "custom_unreserved_on",
			"label": "Unreserved On",
			"fieldtype": "Datetime",
			"insert_after": "custom_unreserved_qty",
			"read_only": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "custom_unreserved_by",
			"label": "Unreserved By",
			"fieldtype": "Link",
			"options": "User",
			"insert_after": "custom_unreserved_on",
			"read_only": 1,
			"no_copy": 1,
		},
	]
	for df in fields:
		if frappe.db.exists("Custom Field", {"dt": "Stock Reservation Entry", "fieldname": df["fieldname"]}):
			continue
		frappe.get_doc({"doctype": "Custom Field", "dt": "Stock Reservation Entry", **df}).insert(
			ignore_permissions=True
		)
	frappe.clear_cache(doctype="Stock Reservation Entry")


def _open_reserved_qty(sre) -> float:
	return max(
		flt(sre.reserved_qty)
		- flt(sre.delivered_qty)
		- flt(sre.transferred_qty)
		- flt(sre.consumed_qty),
		0,
	)


@frappe.whitelist()
def unreserve_stock_reservation_entry(name: str):
	"""Free open reserved qty without cancelling the SRE (keeps doc submitted)."""
	ensure_sre_unreserve_fields()
	sre = frappe.get_doc("Stock Reservation Entry", name)

	if sre.docstatus != 1:
		frappe.throw(_("Only submitted Stock Reservation Entries can be unreserved."))

	if sre.status in ("Cancelled",):
		frappe.throw(_("Cancelled entry cannot be unreserved."))

	if cint_flag(sre, "custom_manually_unreserved"):
		frappe.throw(_("This entry is already unreserved. Use Re-reserve if you need the reservation again."))

	open_qty = _open_reserved_qty(sre)
	if open_qty <= 0:
		frappe.throw(_("No open reserved qty left to unreserve."))

	# Move open qty into transferred_qty so Bin reserved_stock drops, without Cancel.
	new_transferred = flt(sre.transferred_qty) + open_qty
	sre.db_set(
		{
			"transferred_qty": new_transferred,
			"custom_manually_unreserved": 1,
			"custom_unreserved_qty": open_qty,
			"custom_unreserved_on": now_datetime(),
			"custom_unreserved_by": frappe.session.user,
			"status": "Closed",
		},
		update_modified=True,
	)
	sre.reload()
	if hasattr(sre, "update_reserved_stock_in_bin"):
		sre.update_reserved_stock_in_bin()

	frappe.msgprint(
		_("Unreserved {0} of {1} from {2}. Document remains submitted (not cancelled).").format(
			frappe.bold(open_qty), frappe.bold(sre.item_code), frappe.bold(sre.warehouse)
		),
		indicator="green",
		alert=True,
	)
	return {"unreserved_qty": open_qty, "status": "Closed"}


@frappe.whitelist()
def rereserve_stock_reservation_entry(name: str):
	"""Undo a manual unreserve (only if it was unreserved via Unreserve button)."""
	ensure_sre_unreserve_fields()
	sre = frappe.get_doc("Stock Reservation Entry", name)

	if sre.docstatus != 1:
		frappe.throw(_("Only submitted entries can be re-reserved."))

	if not cint_flag(sre, "custom_manually_unreserved"):
		frappe.throw(_("This entry was not manually unreserved."))

	unreserved_qty = flt(sre.get("custom_unreserved_qty"))
	if unreserved_qty <= 0:
		frappe.throw(_("Nothing to re-reserve."))

	new_transferred = max(flt(sre.transferred_qty) - unreserved_qty, 0)
	sre.db_set(
		{
			"transferred_qty": new_transferred,
			"custom_manually_unreserved": 0,
			"custom_unreserved_qty": 0,
			"custom_unreserved_on": None,
			"custom_unreserved_by": None,
		},
		update_modified=True,
	)
	sre.reload()
	if hasattr(sre, "update_status"):
		sre.update_status()
	if hasattr(sre, "update_reserved_stock_in_bin"):
		sre.update_reserved_stock_in_bin()

	frappe.msgprint(
		_("Re-reserved {0} of {1}.").format(frappe.bold(unreserved_qty), frappe.bold(sre.item_code)),
		indicator="green",
		alert=True,
	)
	return {"rereserved_qty": unreserved_qty, "status": sre.status}


def cint_flag(doc, fieldname: str) -> int:
	return 1 if flt(doc.get(fieldname)) else 0
