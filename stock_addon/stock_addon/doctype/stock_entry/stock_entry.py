import frappe

def set_cost_center_to_child_items(doc, method):
    if doc.custom_cost_center:
        for item in doc.items:
            item.cost_center = doc.custom_cost_center
            # item.save()