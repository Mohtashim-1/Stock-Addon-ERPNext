import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

@frappe.whitelist()
def create_outward_gate_pass_from_delivery_note(doc, method):
    if doc.docstatus == 1:
        frappe.msgprint("Delivery Note is submitted")
        frappe.msgprint("Creating Outward Gate Pass")

        # Create the Outward Gate Pass document
        ogp = frappe.get_doc({
            "doctype": "Outward Gate Pass",
            "ogp_type": "Non-Inventory",
            "type": "Non-Returnable",
            "out_to": "Customer",
            "document":"Delivery Note",
            "voucher": doc.name,
            "customer": doc.customer,
            "vehicle_number": "",
            "driver_name": "",
            "driver_contact": "",
            "non_inventory": [],
            "creation_date": doc.posting_date
        })

        # Add items from Delivery Note to the child table
        for item in doc.items:
            ogp.append("non_inventory", {
                "item": item.item_code,
                "qty": item.qty,
                "uom": item.uom
            })

        ogp.insert()
        frappe.msgprint("Outward Gate Pass created")