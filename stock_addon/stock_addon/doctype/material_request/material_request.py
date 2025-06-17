import frappe 
from frappe.model.document import Document

frappe.whitelist()
def calculate_total_qty(doc, method):
	total_qty = 0
	for item in doc.items:
		total_qty += item.qty
	doc.custom_total_qty = total_qty
	
