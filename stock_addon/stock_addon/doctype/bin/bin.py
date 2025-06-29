import frappe
from frappe import _


@frappe.whitelist()
def recalculate_qty(bin_name=None):
	"""Recalculate quantities for a specific bin"""
	if bin_name:
		bin_doc = frappe.get_doc("Bin", bin_name)
		bin_doc.recalculate_qty()
		return True
	return False

@frappe.whitelist()
def recalculate_all_bins():
	"""Recalculate quantities for all bins"""
	bin_names = frappe.get_all("Bin", pluck="name")
	total_bins = len(bin_names)
	
	if total_bins == 0:
		return {"message": "No bins found to recalculate"}
	
	# Process bins in batches to avoid memory issues
	batch_size = 100
	processed = 0
	
	for i in range(0, total_bins, batch_size):
		batch = bin_names[i:i + batch_size]
		
		for bin_name in batch:
			try:
				bin_doc = frappe.get_doc("Bin", bin_name)
				bin_doc.recalculate_qty()
				processed += 1
			except Exception as e:
				frappe.log_error(f"Error recalculating bin {bin_name}: {str(e)}", "Bin Recalculation Error")
	
	return {"message": f"Successfully recalculated {processed} out of {total_bins} bins"}

# stock_addon/stock_addon/doctype/bin/bin.py

import frappe
from frappe import _

@frappe.whitelist()
def recalc_impacted_bins(doc, method):
    """
    DocEvent hook for submit/cancel of PR, Stock Entry, Stock Reconciliation.
    Only recalculates the bins actually touched by the transaction.
    """
    affected_bins = set()

    # for each child row, collect all relevant warehouse fields
    for row in doc.get("items", []):
        item_code = getattr(row, "item_code", None)
        if not item_code:
            continue

        # possible warehouse fields per doctype
        whs = []
        # Purchase Receipt & Stock Reconciliation
        whs.append(getattr(row, "warehouse", None))
        # Stock Entry: source and target
        whs.append(getattr(row, "s_warehouse", None))
        whs.append(getattr(row, "t_warehouse", None))

        for wh in filter(None, whs):
            # find the Bin record(s) for this item+warehouse
            for b in frappe.get_all(
                "Bin",
                filters={"item_code": item_code, "warehouse": wh},
                pluck="name"
            ):
                affected_bins.add(b)

    if not affected_bins:
        # nothing to do, but log so you can see why
        frappe.log_error(
            _("No Bins found to recalc for {0} {1}").format(doc.doctype, doc.name),
            "recalc_impacted_bins"
        )
        return

    # recalc each bin
    for bin_name in affected_bins:
        try:
            frappe.get_doc("Bin", bin_name).recalculate_qty()
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                f"recalc_impacted_bins failure for Bin {bin_name}"
            )

    frappe.db.commit()
