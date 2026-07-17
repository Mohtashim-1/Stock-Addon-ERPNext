# Copyright (c) 2026, SAH and contributors
"""Allow Stock Entry to consume Production Plan reserved stock when tagged."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt


def ensure_stock_entry_reservation_fields():
	"""Create Against Production Plan / Sales Order fields if missing."""
	fields = [
		{
			"fieldname": "custom_against_production_plan",
			"label": "Against Production Plan",
			"fieldtype": "Link",
			"options": "Production Plan",
			"insert_after": "work_order",
			"description": "Tag PP so this Stock Entry can use stock reserved against that Production Plan.",
		},
		{
			"fieldname": "custom_against_sales_order",
			"label": "Against Sales Order",
			"fieldtype": "Link",
			"options": "Sales Order",
			"insert_after": "custom_against_production_plan",
			"description": "Optional. Used to find Production Plan reservations when PP is not set.",
		},
	]
	for df in fields:
		if frappe.db.exists("Custom Field", {"dt": "Stock Entry", "fieldname": df["fieldname"]}):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Custom Field",
				"dt": "Stock Entry",
				**df,
			}
		)
		doc.insert(ignore_permissions=True)
	frappe.clear_cache(doctype="Stock Entry")


def validate_against_reservation_refs(doc, method=None):
	"""Auto-fill SO from PP; validate SO belongs to PP when both set."""
	pp = getattr(doc, "custom_against_production_plan", None)
	so = getattr(doc, "custom_against_sales_order", None)

	if pp and not so:
		sos = frappe.get_all(
			"Production Plan Sales Order",
			filters={"parent": pp},
			pluck="sales_order",
		)
		if len(sos) == 1:
			doc.custom_against_sales_order = sos[0]
		elif sos and getattr(doc, "custom_cost_center", None):
			# Cost center name often mirrors SO: "HML-TR/... - SAH"
			cc = (doc.custom_cost_center or "").replace(" - SAH", "").strip()
			if cc in sos:
				doc.custom_against_sales_order = cc

	pp = getattr(doc, "custom_against_production_plan", None)
	so = getattr(doc, "custom_against_sales_order", None)
	if pp and so:
		linked = frappe.db.exists(
			"Production Plan Sales Order",
			{"parent": pp, "sales_order": so},
		)
		if not linked:
			frappe.throw(
				_("Sales Order {0} is not linked to Production Plan {1}.").format(so, pp),
				title=_("Invalid Reference"),
			)


def release_pp_reserved_stock_before_submit(doc, method=None):
	"""Before submit: mark matching PP SRE qty as transferred so SLE allows issue."""
	if not _ste_issues_stock(doc):
		return

	production_plans = _resolve_production_plans(doc)
	if not production_plans:
		return

	# Persist PP on STE when resolved from Sales Order / cost center
	if not getattr(doc, "custom_against_production_plan", None) and len(production_plans) == 1:
		doc.db_set("custom_against_production_plan", production_plans[0], update_modified=False)
	elif not getattr(doc, "custom_against_production_plan", None) and len(production_plans) > 1:
		# Prefer PP that actually has open reservation for STE items
		preferred = _prefer_pp_with_open_reservation(doc, production_plans)
		if preferred:
			doc.db_set("custom_against_production_plan", preferred, update_modified=False)
			production_plans = [preferred]

	_recompute_pp_sre_transferred_qty(production_plans, include_ste_doc=doc)


def _prefer_pp_with_open_reservation(doc, production_plans: list[str]) -> str | None:
	items = {(r.item_code, r.s_warehouse) for r in (doc.items or []) if r.item_code and r.s_warehouse}
	if not items:
		return production_plans[0]

	for pp in production_plans:
		for item_code, warehouse in items:
			open_qty = frappe.db.sql(
				"""
				SELECT SUM(reserved_qty - IFNULL(delivered_qty,0)
					- IFNULL(transferred_qty,0) - IFNULL(consumed_qty,0))
				FROM `tabStock Reservation Entry`
				WHERE docstatus = 1 AND voucher_type = 'Production Plan'
					AND voucher_no = %s AND item_code = %s AND warehouse = %s
				""",
				(pp, item_code, warehouse),
			)
			if open_qty and flt(open_qty[0][0]) > 0:
				return pp
	return production_plans[0]


def restore_pp_reserved_stock_on_cancel(doc, method=None):
	"""After cancel: recompute transferred qty without this STE."""
	if not _ste_issues_stock(doc):
		return

	production_plans = _resolve_production_plans(doc)
	if not production_plans:
		return

	_recompute_pp_sre_transferred_qty(production_plans, include_ste_doc=None, exclude_ste=doc.name)


def _ste_issues_stock(doc) -> bool:
	purpose = (doc.purpose or "").strip()
	return purpose in {
		"Material Transfer for Manufacture",
		"Material Transfer",
		"Material Issue",
		"Manufacture",
		"Material Consumption for Manufacture",
		"Send to Subcontractor",
	}


def _resolve_production_plans(doc) -> list[str]:
	pp = getattr(doc, "custom_against_production_plan", None)
	if pp:
		return [pp]

	so = getattr(doc, "custom_against_sales_order", None)
	if not so and getattr(doc, "custom_cost_center", None):
		# Fallback: cost center named like SO
		cc = (doc.custom_cost_center or "").replace(" - SAH", "").strip()
		if frappe.db.exists("Sales Order", cc):
			so = cc
			doc.custom_against_sales_order = so

	if not so:
		return []

	return frappe.db.sql(
		"""
		SELECT DISTINCT ppso.parent
		FROM `tabProduction Plan Sales Order` ppso
		INNER JOIN `tabProduction Plan` pp ON pp.name = ppso.parent
		WHERE ppso.sales_order = %s AND pp.docstatus = 1
		""",
		so,
		pluck=True,
	)


def _recompute_pp_sre_transferred_qty(
	production_plans: list[str],
	include_ste_doc=None,
	exclude_ste: str | None = None,
):
	"""Set SRE.transferred_qty from submitted STEs tagged to these PPs (+ optional draft STE)."""
	sres = frappe.get_all(
		"Stock Reservation Entry",
		filters={
			"voucher_type": "Production Plan",
			"voucher_no": ("in", production_plans),
			"docstatus": 1,
			"status": ("not in", ["Cancelled"]),
		},
		fields=[
			"name",
			"item_code",
			"warehouse",
			"reserved_qty",
			"delivered_qty",
			"consumed_qty",
			"transferred_qty",
			"voucher_no",
		],
		order_by="creation",
	)
	if not sres:
		return

	# Aggregate issued qty from submitted STEs against these PPs
	issued = _get_issued_qty_by_item_warehouse(production_plans, exclude_ste=exclude_ste)

	# Include current (not-yet-submitted) STE quantities
	if include_ste_doc:
		for row in include_ste_doc.items or []:
			if not row.item_code or not row.s_warehouse:
				continue
			key = (row.item_code, row.s_warehouse)
			issued[key] = flt(issued.get(key)) + flt(row.transfer_qty or row.qty)

	# Allocate FIFO across SREs for same item+warehouse
	remaining = dict(issued)
	for sre in sres:
		key = (sre.item_code, sre.warehouse)
		cap = max(flt(sre.reserved_qty) - flt(sre.delivered_qty) - flt(sre.consumed_qty), 0)
		qty_to_set = min(flt(remaining.get(key, 0)), cap)
		remaining[key] = max(flt(remaining.get(key, 0)) - qty_to_set, 0)

		if flt(sre.transferred_qty) == qty_to_set:
			continue

		sre_doc = frappe.get_doc("Stock Reservation Entry", sre.name)
		sre_doc.db_set("transferred_qty", qty_to_set, update_modified=False)
		if hasattr(sre_doc, "update_status"):
			sre_doc.update_status()
		if hasattr(sre_doc, "update_reserved_stock_in_bin"):
			sre_doc.update_reserved_stock_in_bin()


def _get_issued_qty_by_item_warehouse(production_plans: list[str], exclude_ste: str | None = None):
	"""Sum transfer qty from submitted Stock Entries tagged to these Production Plans."""
	if not production_plans:
		return {}

	conditions = [
		"se.docstatus = 1",
		"se.custom_against_production_plan IN %(pps)s",
		"sed.s_warehouse IS NOT NULL",
		"sed.s_warehouse != ''",
	]
	values = {"pps": tuple(production_plans)}
	if exclude_ste:
		conditions.append("se.name != %(exclude)s")
		values["exclude"] = exclude_ste

	rows = frappe.db.sql(
		f"""
		SELECT sed.item_code, sed.s_warehouse AS warehouse,
			SUM(IFNULL(sed.transfer_qty, sed.qty)) AS qty
		FROM `tabStock Entry` se
		INNER JOIN `tabStock Entry Detail` sed ON sed.parent = se.name
		WHERE {" AND ".join(conditions)}
		GROUP BY sed.item_code, sed.s_warehouse
		""",
		values,
		as_dict=True,
	)
	return {(r.item_code, r.warehouse): flt(r.qty) for r in rows}


@frappe.whitelist()
def get_reserved_qty_for_pp(production_plan: str, item_code: str, warehouse: str) -> float:
	"""Helper for form UI: open reserved qty on a PP for item/warehouse."""
	if not production_plan or not item_code or not warehouse:
		return 0
	row = frappe.db.sql(
		"""
		SELECT SUM(reserved_qty - IFNULL(delivered_qty,0) - IFNULL(transferred_qty,0) - IFNULL(consumed_qty,0))
		FROM `tabStock Reservation Entry`
		WHERE docstatus = 1
			AND voucher_type = 'Production Plan'
			AND voucher_no = %s
			AND item_code = %s
			AND warehouse = %s
			AND status NOT IN ('Cancelled')
		""",
		(production_plan, item_code, warehouse),
	)
	return flt(row[0][0]) if row else 0
