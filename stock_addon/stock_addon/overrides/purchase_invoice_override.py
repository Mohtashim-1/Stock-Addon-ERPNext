import frappe
from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import PurchaseInvoice as ERPNextPurchaseInvoice

class PurchaseInvoice(ERPNextPurchaseInvoice):
    def po_required(self):
        # Skip PO requirement for your special naming series
        if getattr(self, "naming_series", "") == "PINV-SERVICES-.###.-.YY.":
            return
        super().po_required()

    def pr_required(self):
        if getattr(self, "naming_series", "") == "PINV-SERVICES-.###.-.YY.":
            return
        super().pr_required()

# Patch the methods
PurchaseInvoice.po_required = PurchaseInvoice.po_required
PurchaseInvoice.pr_required = PurchaseInvoice.pr_required
