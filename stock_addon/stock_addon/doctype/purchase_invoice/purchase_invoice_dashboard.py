from frappe import _

def get_data(data=None):
    return {
        "fieldname": "name",  # <-- Correct! Or just remove this line.
        "non_standard_fieldnames": {
            "Journal Entry": "reference_name",
            "Payment Entry": "reference_name",
            "Payment Request": "reference_name",
            "Landed Cost Voucher": "receipt_document",
            "Purchase Invoice": "return_against",
            "Auto Repeat": "reference_document",
        },
        "internal_links": {
            "Purchase Order": ["items", "purchase_order"],
            "Purchase Receipt": ["items", "purchase_receipt"],
            "Landed Cost Voucher": "custom_landed_cost_voucher_reference",
        },
        "transactions": [
            {"label": _("Payment"), "items": ["Payment Entry", "Payment Request", "Journal Entry"]},
            {
                "label": _("Reference"),
                "items": ["Purchase Order", "Purchase Receipt", "Asset", "Landed Cost Voucher"],
            },
            {"label": _("Returns"), "items": ["Purchase Invoice"]},
            {"label": _("Subscription"), "items": ["Auto Repeat"]},
        ],
    }

