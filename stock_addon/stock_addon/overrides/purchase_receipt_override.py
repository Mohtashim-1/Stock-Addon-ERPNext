import frappe 
from erpnext.stock.doctype.purchase_receipt.purchase_receipt import PurchaseReceipt as ERPNextPurchaseReceipt

class PurchaseReceipt(ERPNextPurchaseReceipt):
    def po_required(self):
        for i in self.items:
            allow_zero = i.allow_zero_valuation_rate
            if allow_zero is None:
                allow_zero = frappe.db.get_value("Item", i.item_code, "allow_zero_valuation_rate")
            if allow_zero:
                return False
        return True

PurchaseReceipt.po_required = PurchaseReceipt.po_required