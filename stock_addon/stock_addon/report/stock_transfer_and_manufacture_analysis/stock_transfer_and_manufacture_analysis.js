// Copyright (c) 2025, mohtashim and contributors
// For license information, please see license.txt

frappe.query_reports["Stock Transfer and Manufacture Analysis"] = {
    "filters": [
        {
            "fieldname": "custom_cost_center",
            "label": "Cost Center",
            "fieldtype": "Link",
            "options": "Cost Center"
        },
        {
            "fieldname": "from_date",
            "label": "From Date",
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            "reqd": 1
        },
        {
            "fieldname": "to_date",
            "label": "To Date",
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1
        },
        {
            "fieldname": "bom_no",
            "label": "BOM",
            "fieldtype": "Link",
            "options": "BOM"
        },
        {
            "fieldname": "chart_type",
            "label": "Chart Type",
            "fieldtype": "Select",
            "options": "Date-wise, Cost Center-wise",
            "default": "Date-wise"
        }
    ]
};
