# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
	columns = [
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 700},
		{"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 200},
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
	# Only filter by to_date, not from_date
	if filters.get("to_date"):
		conditions.append("sle.posting_date <= %(to_date)s")
		values["to_date"] = filters["to_date"]
	if filters.get("item_group"):
		join_item = True
		ig = frappe.db.get_value("Item Group", filters["item_group"], ["lft", "rgt"], as_dict=True)
		if ig:
			conditions.append("ig.lft >= %(lft)s AND ig.rgt <= %(rgt)s")
			values["lft"] = ig.lft
			values["rgt"] = ig.rgt

	if join_item:
		join = "JOIN `tabItem` i ON sle.item_code = i.name JOIN `tabItem Group` ig ON i.item_group = ig.name"
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


def get_opening_balance(item_code, warehouse, from_date):
    result = frappe.db.sql("""
        SELECT SUM(actual_qty) as opening_qty
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s AND warehouse = %s
          AND posting_date < %s
          AND docstatus < 2 AND is_cancelled = 0
    """, (item_code, warehouse, from_date))
    return result[0][0] or 0
