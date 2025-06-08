import frappe
from frappe.model.document import Document

# def on_submit(self):
#     self.create_lc()
def on_submit(self, method):
    # if self.custom_create_landed_cost_ == "Yes":
        create_lc(self)

    
def create_lc(doc, method):
    if doc.custom_create_landed_cost_ == "Yes":
            lc = frappe.new_doc("Landed Cost Voucher")
            
            # Append a new Purchase Receipt row to the Landed Cost Voucher
            pr = lc.append('purchase_receipts')
            pr.receipt_document_type = "Purchase Receipt"
            pr.receipt_document = doc.name
            pr.supplier = doc.supplier
            pr.grand_total = doc.grand_total
            
            # Append taxes to the Landed Cost Voucher
            taxes = lc.append('taxes')
            taxes.expense_account = "Duties and Taxes - SAH"
            taxes.description = "Duties and Taxes - SAH"
            taxes.amount = 1
            
            # Save the Landed Cost Voucher
            lc.save()
        
