# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
    columns = [
        {"label": _("Stock Entry"), "fieldname": "name", "fieldtype": "Link", "options": "Stock Entry", "width": 180},
        {"label": _("Posting Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
        {"label": _("Stock Entry Type"), "fieldname": "stock_entry_type", "fieldtype": "Data", "width": 180},
        {"label": _("BOM"), "fieldname": "bom_no", "fieldtype": "Link", "options": "BOM", "width": 180},
        {"label": _("Cost Center"), "fieldname": "custom_cost_center", "fieldtype": "Link", "options": "Cost Center", "width": 180},
        {"label": _("Total Outgoing Value"), "fieldname": "total_outgoing_value", "fieldtype": "Currency", "width": 150},
        {"label": _("Total Incoming Value"), "fieldname": "total_incoming_value", "fieldtype": "Currency", "width": 150},
    ]

    conditions = []
    values = {}

    if filters.get("custom_cost_center"):
        conditions.append("se.custom_cost_center = %(custom_cost_center)s")
        values["custom_cost_center"] = filters["custom_cost_center"]

    if filters.get("from_date"):
        conditions.append("se.posting_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("se.posting_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    if filters.get("bom_no"):
        conditions.append("se.bom_no = %(bom_no)s")
        values["bom_no"] = filters["bom_no"]

    # Only these types
    conditions.append("se.stock_entry_type in ('Manufacture', 'Material Transfer for Manufacture')")
    # Always filter for submitted docs
    conditions.append("se.docstatus = 1")

    where = " AND ".join(conditions)
    if where:
        where = "WHERE " + where

    data = frappe.db.sql(f"""
        SELECT
            se.name,
            se.posting_date,
            se.stock_entry_type,
            se.bom_no,
            se.custom_cost_center,
            se.total_outgoing_value,
            se.total_incoming_value
        FROM `tabStock Entry` se
        {where}
        ORDER BY se.posting_date DESC, se.name DESC
    """, values, as_dict=1)

    # Prepare cost center wise pie chart data
    cc_labels = []
    cc_outgoing = []
    cc_map = {}
    for row in data:
        cc = row["custom_cost_center"] or "Not Set"
        if cc not in cc_map:
            cc_map[cc] = 0
        cc_map[cc] += float(row["total_outgoing_value"] or 0)
    for cc in sorted(cc_map.keys()):
        cc_labels.append(cc)
        cc_outgoing.append(cc_map[cc])

    pie_chart = {
        "data": {
            "labels": cc_labels,
            "datasets": [
                {
                    "name": "Total Outgoing Value",
                    "values": cc_outgoing
                }
            ]
        },
        "type": "pie"
    }

    return columns, data, None, pie_chart
