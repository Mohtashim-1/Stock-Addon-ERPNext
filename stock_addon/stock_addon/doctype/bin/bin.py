import frappe

@frappe.whitelist()
def recalculate_qty(bin_name=None):
	"""Recalculate quantities for a specific bin"""
	if bin_name:
		bin_doc = frappe.get_doc("Bin", bin_name)
		bin_doc.recalculate_qty()
		return True
	return False

@frappe.whitelist()
def recalculate_all_bins():
	"""Recalculate quantities for all bins"""
	bin_names = frappe.get_all("Bin", pluck="name")
	total_bins = len(bin_names)
	
	if total_bins == 0:
		return {"message": "No bins found to recalculate"}
	
	# Process bins in batches to avoid memory issues
	batch_size = 100
	processed = 0
	
	for i in range(0, total_bins, batch_size):
		batch = bin_names[i:i + batch_size]
		
		for bin_name in batch:
			try:
				bin_doc = frappe.get_doc("Bin", bin_name)
				bin_doc.recalculate_qty()
				processed += 1
			except Exception as e:
				frappe.log_error(f"Error recalculating bin {bin_name}: {str(e)}", "Bin Recalculation Error")
	
	return {"message": f"Successfully recalculated {processed} out of {total_bins} bins"}
