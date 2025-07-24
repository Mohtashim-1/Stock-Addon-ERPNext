import frappe

@frappe.whitelist()
def purchase_receipt_query(doctype, txt, searchfield, start, page_len, filters):
    frappe.log_error(f"purchase_receipt_query called with txt={txt}", "DEBUG LCV QUERY")
    return frappe.db.sql("""
        SELECT
            name,
            supplier_delivery_note,
            supplier,
            posting_date
        FROM `tabPurchase Receipt`
        WHERE docstatus = 1
          AND (name LIKE %(txt)s OR supplier_delivery_note LIKE %(txt)s)
        ORDER BY modified DESC
        LIMIT 20
    """, {"txt": f"%{txt}%"})

@frappe.whitelist()
def get_receipt_document_details(receipt_document_type, receipt_document):
    if receipt_document_type in [
        "Purchase Invoice",
        "Purchase Receipt",
        "Subcontracting Receipt",
    ]:
        fields = ["supplier", "posting_date", "supplier_delivery_note"]
        if receipt_document_type == "Subcontracting Receipt":
            fields.append("total as grand_total")
        else:
            fields.append("base_grand_total as grand_total")
    elif receipt_document_type == "Stock Entry":
        fields = ["total_incoming_value as grand_total"]

    return frappe.db.get_value(
        receipt_document_type,
        receipt_document,
        fields,
        as_dict=True,
    )
