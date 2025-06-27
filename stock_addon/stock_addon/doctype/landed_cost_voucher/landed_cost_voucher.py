import frappe
from frappe.utils import now_datetime
from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import PurchaseInvoice

@frappe.whitelist()
def create_purchase_invoice_from_landed_cost_voucher_taxes(doc, method):
    frappe.msgprint("Landed Cost Voucher is submitted")
    frappe.msgprint("Creating Purchase Invoice")
    
    # Counter for series
    series_counter = 1
    
    for tax_row in doc.taxes:
        supplier = tax_row.custom_supplier or doc.supplier

        pi = frappe.get_doc({
            "doctype": "Purchase Invoice",
            "purchase_invoice_type": "Landed Cost Voucher",
            "naming_series": "PINV-SERVICES-.###.-.YY.",
            "supplier": supplier,
            "grand_total": tax_row.amount,
            "posting_date": now_datetime(),
            "bill_no": f"LCV-{doc.name}-{series_counter}",  # series will show like 1,2,3,...
            "bill_date": now_datetime(),
            "ignore_pr_validation": 1,
            "ignore_po_validation": 1
        })

        for item_row in doc.items:
            pi.append("items", {
                "item_code": item_row.item_code,
                "qty": item_row.qty,
                "rate": 0,
                "amount": 0,
                "base_rate": 0,
                "base_amount": 0,
                "price_list_rate": 0,
                "allow_zero_valuation_rate": 1
            })

        pi.append("taxes", {
            "charge_type": "Actual",
            "account_head": tax_row.expense_account,
            "description": tax_row.description,
            "tax_amount": tax_row.amount,
            "total": tax_row.amount
        })

        # Set flags before inserting
        pi.flags.ignore_pr_validation = True
        pi.flags.ignore_po_validation = True
        pi.flags.ignore_mandatory = True  # Ensures doc.insert() skips certain mandatory validations
        frappe.local.form_dict["_lcv_invoice_doc"] = pi
        pi.insert(ignore_permissions=True)
        frappe.local.form_dict.pop("_lcv_invoice_doc", None)  # Clean up after insert
        frappe.msgprint(f"Created Purchase Invoice: {pi.name} for supplier: {supplier}")
        
        # Increment series counter
        series_counter += 1

# Patch validate to skip PO/PR for LCV
original_validate = PurchaseInvoice.validate

def custom_validate(self):
    if getattr(self, "purchase_invoice_type", None) == "Landed Cost Voucher":
        self.ignore_po_validation = True
        self.ignore_pr_validation = True

def patched_validate(self):
    custom_validate(self)
    original_validate(self)

PurchaseInvoice.validate = patched_validate
