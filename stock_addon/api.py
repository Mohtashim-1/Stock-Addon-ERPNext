import frappe

@frappe.whitelist()
def create_lc(doc, method):
    frappe.log_error(f"LC Triggered: {doc.name}, Flag: {doc.custom_create_landed_cost_}", "Landed Cost Debug")

    if doc.custom_create_landed_cost_ == "Yes":
        lc = frappe.new_doc("Landed Cost Voucher")
        pr = lc.append('purchase_receipts')
        pr.receipt_document_type = "Purchase Receipt"
        pr.receipt_document = doc.name
        pr.supplier = doc.supplier
        pr.grand_total = doc.grand_total

        taxes = lc.append('taxes')
        taxes.expense_account = "Duties and Taxes - SAH"
        taxes.description = "Duties and Taxes - SAH"
        taxes.amount = 1    

        lc.save()
        frappe.msgprint(f"Landed Cost Voucher created: {lc.name}")
    else:
        frappe.log_error(f"Landed Cost not created. Flag value: {doc.custom_create_landed_cost_}", "Landed Cost Debug")


def propagate_subcontracting_receipt_cost_center(doc, method=None):
    """Copy parent cost center into child rows for Subcontracting Receipt."""
    parent_cost_center = getattr(doc, "cost_center", None) or frappe.get_cached_value(
        "Company", doc.company, "cost_center"
    )

    if not parent_cost_center:
        return

    for row in doc.get("items") or []:
        if not row.cost_center:
            row.cost_center = parent_cost_center

    for row in doc.get("supplied_items") or []:
        if not row.cost_center:
            row.cost_center = parent_cost_center
