import frappe
from frappe import _
from frappe.utils import cint, flt
from erpnext.stock.doctype.purchase_receipt.purchase_receipt import PurchaseReceipt as ERPNextPurchaseReceipt


class PurchaseReceipt(ERPNextPurchaseReceipt):
	def po_required(self):
		"""PO required for all items, except allow_zero_valuation_rate rows.

		Previously this method only returned True/False and never threw, so any
		item could be received without a Purchase Order. Only zero-valuation
		items are allowed without PO reference.
		"""
		if (
			frappe.db.get_single_value("Buying Settings", "po_required") != "Yes"
			or self.is_internal_transfer()
		):
			return

		for d in self.get("items"):
			if d.purchase_order:
				continue

			allow_zero = d.allow_zero_valuation_rate
			if allow_zero is None:
				allow_zero = frappe.db.get_value("Item", d.item_code, "allow_zero_valuation_rate")

			if cint(allow_zero):
				continue

			frappe.throw(_("Purchase Order number required for Item {0}").format(d.item_code))

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

	def update_received_qty_if_from_pp(self):
		"""Update PP sub-assembly received_qty without requiring Submit on Production Plan.

		ERPNext uses frappe.set_value() which loads the parent Production Plan and tries to
		save a submitted doc — that needs Submit permission. Store users often only have
		Read/Write on Production Plan, so PR submit fails with PermissionError.
		Use db.set_value on the child row instead.
		"""
		from frappe.query_builder.functions import Coalesce, Sum

		items_from_po = [item.purchase_order_item for item in self.items if item.purchase_order_item]
		if not items_from_po:
			return

		table = frappe.qb.DocType("Purchase Order Item")
		subquery = (
			frappe.qb.from_(table)
			.select(table.production_plan_sub_assembly_item)
			.distinct()
			.where(
				table.name.isin(items_from_po)
				& Coalesce(table.production_plan_sub_assembly_item, "").ne("")
			)
		)
		result = subquery.run(as_dict=True)
		if not result:
			return

		result = [item.production_plan_sub_assembly_item for item in result]
		query = (
			frappe.qb.from_(table)
			.select(
				table.production_plan_sub_assembly_item,
				Sum(table.received_qty / (table.qty / table.fg_item_qty)).as_("received_qty"),
			)
			.where(table.production_plan_sub_assembly_item.isin(result))
			.groupby(table.production_plan_sub_assembly_item)
		)
		for row in query.run(as_dict=True):
			frappe.db.set_value(
				"Production Plan Sub Assembly Item",
				row.production_plan_sub_assembly_item,
				"received_qty",
				row.received_qty,
				update_modified=False,
			)
