# stock_addon/stock_addon/doctype/bin/bin.py

import frappe
from frappe import _
from frappe.utils import flt
from erpnext.stock.doctype.bin.bin import Bin as ERPBin
from erpnext.stock.stock_ledger import get_valuation_rate

@frappe.whitelist()
def recalculate_all_bins():
    """
    Whitelisted: recalc both qty & valuation for all bins.
    """
    bin_names = frappe.get_all("Bin", pluck="name")
    if not bin_names:
        return {"message": "No bins to recalculate"}

    for b in bin_names:
        # reuse your per-bin logic
        frappe.get_doc("Bin", b).recalculate_qty()

    frappe.db.commit()
    return {"message": f"Successfully recalculated {len(bin_names)} bins"}

@frappe.whitelist()
def recalculate_qty(bin_name):
    """
    Whitelisted: recalc both qty & valuation for a single bin.
    """
    if not bin_name:
        frappe.throw(_("`bin_name` is required"))

    bin_doc = frappe.get_doc("Bin", bin_name)
    bin_doc.recalculate_qty()
    frappe.db.commit()
    return {"status": "ok", "bin": bin_name}


@frappe.whitelist()
def recalc_impacted_bins(doc, method):
    frappe.log_error(f"recalc_impacted_bins fired for {doc.doctype} {doc.name}", "DEBUG")
    affected_bins = set()

    for row in doc.get("items", []):
        item = getattr(row, "item_code", None)
        if not item:
            continue

        # collect source/target warehouses
        whs = [
            getattr(row, "warehouse", None),
            getattr(row, "s_warehouse", None),
            getattr(row, "t_warehouse", None),
        ]
        for wh in filter(None, whs):
            for b in frappe.get_all("Bin", filters={
                "item_code": item, "warehouse": wh
            }, pluck="name"):
                affected_bins.add(b)

    if not affected_bins:
        frappe.log_error(
            _("No Bins found to recalc for {0} {1}").format(doc.doctype, doc.name),
            "recalc_impacted_bins"
        )
        return

    for b in affected_bins:
        try:
            frappe.get_doc("Bin", b).recalculate_qty()
        except Exception:
            frappe.log_error(frappe.get_traceback(),
                             f"recalc_impacted_bins failure for Bin {b}")

    frappe.db.commit()

class Bin(ERPBin):
    def recalculate_qty(self):
        super().recalculate_qty()

        # 2) fetch the last Stock Ledger Entry’s valuation_rate
        rate_row = frappe.db.sql("""
            SELECT valuation_rate
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
              AND warehouse = %s
              AND is_cancelled = 0
            ORDER BY posting_datetime DESC, name DESC
            LIMIT 1
        """, (self.item_code, self.warehouse), as_list=True)

        if rate_row and rate_row[0]:
            val_rate = flt(rate_row[0][0])
        else:
            val_rate = 0.0

        # 3) compute and store stock_value
        stock_val = flt(self.actual_qty) * val_rate

        # 4) write back to the Bin record
        self.db_set("valuation_rate", val_rate,  update_modified=True)
        self.db_set("stock_value",    stock_val, update_modified=True)
