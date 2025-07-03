# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
	columns = [
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 150},
		{"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 150},
		{"label": "Balance Qty", "fieldname": "qty_after_transaction", "fieldtype": "Float", "width": 120},
	]

	filters = filters or {}
	conditions = ["sle.is_cancelled = 0", "sle.docstatus < 2"]
	values = {}
	join_item = False
	if filters.get("item_code"):
		conditions.append("sle.item_code = %(item_code)s")
		values["item_code"] = filters["item_code"]
	if filters.get("warehouse"):
		conditions.append("sle.warehouse = %(warehouse)s")
		values["warehouse"] = filters["warehouse"]
	if filters.get("company"):
		conditions.append("sle.company = %(company)s")
		values["company"] = filters["company"]
	if filters.get("from_date"):
		conditions.append("sle.posting_date >= %(from_date)s")
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions.append("sle.posting_date <= %(to_date)s")
		values["to_date"] = filters["to_date"]
	if filters.get("item_group"):
		join_item = True
		conditions.append("i.item_group = %(item_group)s")
		values["item_group"] = filters["item_group"]

	# Get latest SLE for each (item_code, warehouse) within the date range
	if join_item:
		join = "JOIN `tabItem` i ON sle.item_code = i.name"
	else:
		join = ""

	data = frappe.db.sql(
		f'''
		SELECT sle.item_code, sle.warehouse, sle.qty_after_transaction
		FROM `tabStock Ledger Entry` sle
		{join}
		INNER JOIN (
			SELECT item_code, warehouse, MAX(posting_datetime) AS max_posting_datetime
			FROM `tabStock Ledger Entry`
			WHERE is_cancelled = 0 AND docstatus < 2
			{'AND posting_date >= %(from_date)s' if filters.get('from_date') else ''}
			{'AND posting_date <= %(to_date)s' if filters.get('to_date') else ''}
			GROUP BY item_code, warehouse
		) latest
		ON sle.item_code = latest.item_code AND sle.warehouse = latest.warehouse AND sle.posting_datetime = latest.max_posting_datetime
		{'WHERE ' + ' AND '.join(conditions) if conditions else ''}
		ORDER BY sle.item_code, sle.warehouse
		''',
		values,
		as_dict=True
	)
	return columns, data
