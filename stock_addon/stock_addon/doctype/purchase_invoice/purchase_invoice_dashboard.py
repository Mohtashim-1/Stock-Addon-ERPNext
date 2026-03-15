from frappe import _


def get_data(data=None):
	data = data or {}

	non_standard_fieldnames = data.get("non_standard_fieldnames", {})
	non_standard_fieldnames.update(
		{
			"Journal Entry": "reference_name",
			"Payment Entry": "reference_name",
			"Payment Request": "reference_name",
			"Landed Cost Voucher": "receipt_document",
			"Purchase Invoice": "return_against",
			"Auto Repeat": "reference_document",
			"Service Billing": "purchase_invoice",
			"Meal Form": "purchase_invoice",
		}
	)

	internal_links = data.get("internal_links", {})
	internal_links.update(
		{
			"Purchase Order": ["items", "purchase_order"],
			"Purchase Receipt": ["items", "purchase_receipt"],
			"Landed Cost Voucher": "custom_landed_cost_voucher_reference",
		}
	)

	transactions = data.get("transactions", [])
	transactions.extend(
		[
			{"label": _("Payment"), "items": ["Payment Entry", "Payment Request", "Journal Entry"]},
			{
				"label": _("Reference"),
				"items": ["Purchase Order", "Purchase Receipt", "Asset", "Landed Cost Voucher"],
			},
			{"label": _("Returns"), "items": ["Purchase Invoice"]},
			{"label": _("Subscription"), "items": ["Auto Repeat"]},
			{"label": _("Service Billing"), "items": ["Service Billing", "Meal Form"]},
		]
	)

	data.update(
		{
			"fieldname": data.get("fieldname") or "name",
			"non_standard_fieldnames": non_standard_fieldnames,
			"internal_links": internal_links,
			"transactions": transactions,
		}
	)

	return data
