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