import frappe 
from frappe.utils import flt
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

    def validate(self):
        """Override validate to set rate to 0 when allow_zero_valuation_rate is enabled"""
        super().validate()
        self.set_zero_rate_for_zero_valuation_items()

    def set_zero_rate_for_zero_valuation_items(self):
        """Set rate and valuation_rate to 0 for items with allow_zero_valuation_rate enabled"""
        for item in self.get("items"):
            if item.allow_zero_valuation_rate:
                # Set rate to 0 if allow_zero_valuation_rate is enabled
                if flt(item.rate) != 0:
                    item.rate = 0.0
                    item.base_rate = 0.0
                    item.amount = 0.0
                    item.base_amount = 0.0
                    item.net_amount = 0.0
                    item.base_net_amount = 0.0

    def update_valuation_rate(self, reset_outgoing_rate=True):
        """Override update_valuation_rate to set valuation_rate to 0 when allow_zero_valuation_rate is enabled"""
        super().update_valuation_rate(reset_outgoing_rate)
        
        # After parent method calculates valuation_rate, set it to 0 for items with allow_zero_valuation_rate
        for item in self.get("items"):
            if item.allow_zero_valuation_rate:
                item.valuation_rate = 0.0

PurchaseReceipt.po_required = PurchaseReceipt.po_required