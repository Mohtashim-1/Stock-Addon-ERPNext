import frappe
import json

def set_cost_center_to_child_items(doc, method):
    if doc.custom_cost_center:
        for item in doc.items:
            item.cost_center = doc.custom_cost_center
            # item.save()


def get_expense_account(doc, method):
    """Set expense account from Stock Entry Type custom_account field"""
    try:
        if not getattr(doc, "stock_entry_type", None):
            frappe.msgprint("Stock Entry Type is not set")

            return

        stock_entry_type_doc = frappe.get_doc("Stock Entry Type", doc.stock_entry_type)
        expense_account = getattr(stock_entry_type_doc, "custom_account", None) 
        frappe.msgprint(f"Stock Entry Type: {stock_entry_type_doc}")
        frappe.msgprint(f"Expense Account: {expense_account}")
        if not expense_account:
            return

        # Set on parent
        doc.expense_account = expense_account
        frappe.msgprint(f"Expense Account: {doc.expense_account}")

        # Also set on child rows (ERPNext reads Difference Account from row)
        if getattr(doc, "items", None):
            for item in doc.items:
                frappe.msgprint(f"Item: {item.item_code}")
                item.expense_account = expense_account
                frappe.msgprint(f"Item Expense Account: {item.expense_account}")
    except Exception as e:
        frappe.log_error(f"Error setting expense account on Stock Entry: {str(e)}")


def get_all_child_item_groups(item_group_name):
    """Get all child item groups recursively"""
    try:
        print(f"[DEBUG] Getting child groups for: {item_group_name}")
        
        # Get direct children
        children = frappe.get_all("Item Group",
            filters={"parent_item_group": item_group_name},
            fields=["name"]
        )
        
        print(f"[DEBUG] Direct children of '{item_group_name}': {[c.name for c in children]}")
        
        child_groups = []
        for child in children:
            child_groups.append(child.name)
            # Recursively get children of children
            grand_children = get_all_child_item_groups(child.name)
            child_groups.extend(grand_children)
        
        print(f"[DEBUG] All children of '{item_group_name}': {child_groups}")
        return child_groups
    except Exception as e:
        print(f"[DEBUG] Error getting child item groups for {item_group_name}: {str(e)}")
        return []


@frappe.whitelist()
def get_items_from_source(source_type, source, warehouses=None, cost_center=None, item_groups=None, include_zero_qty=False, company=None):
    """Get items from warehouse or sales order for Stock Entry"""
    try:
        print(f"[DEBUG] get_items_from_source called with:")
        print(f"  source_type: {source_type}")
        print(f"  source: {source}")
        print(f"  warehouses: {warehouses}")
        print(f"  cost_center: {cost_center}")
        print(f"  item_groups: {item_groups}")
        print(f"  include_zero_qty: {include_zero_qty}")
        print(f"  company: {company}")
        
        items = []
        
        # Parse warehouses if it's a string
        if isinstance(warehouses, str):
            try:
                warehouses = json.loads(warehouses)
            except:
                warehouses = [warehouses]
        
        # Parse item_groups if it's a string
        if isinstance(item_groups, str):
            try:
                item_groups = json.loads(item_groups)
            except:
                item_groups = [item_groups] if item_groups else []
        
        print(f"[DEBUG] Parsed warehouses: {warehouses}")
        print(f"[DEBUG] Parsed item_groups: {item_groups}")
        
        # Expand item groups to include all children
        expanded_item_groups = []
        if item_groups:
            for item_group in item_groups:
                expanded_item_groups.append(item_group)
                # Get all child item groups
                child_groups = get_all_child_item_groups(item_group)
                expanded_item_groups.extend(child_groups)
                print(f"[DEBUG] Item group '{item_group}' has children: {child_groups}")
            
            # Remove duplicates
            expanded_item_groups = list(set(expanded_item_groups))
            print(f"[DEBUG] Expanded item groups: {expanded_item_groups}")
        
        if source_type == 'Cost Center':
            # Get items from warehouses with optional cost center and item group filtering
            bin_filters = {"warehouse": ["in", warehouses]}
            
            if not include_zero_qty:
                bin_filters["actual_qty"] = [">", 0]
            
            print(f"[DEBUG] Bin filters: {bin_filters}")
            
            # Get bins with items
            bins = frappe.get_all("Bin", 
                filters=bin_filters,
                fields=["item_code", "actual_qty", "valuation_rate", "warehouse"],
                order_by="item_code"
            )
            
            print(f"[DEBUG] Found {len(bins)} bins")
            
            for bin in bins:
                try:
                    item_doc = frappe.get_cached_doc("Item", bin.item_code)
                    
                    # Filter by item groups if specified (using expanded list)
                    if expanded_item_groups and item_doc.item_group not in expanded_item_groups:
                        print(f"[DEBUG] Skipping item {bin.item_code} - item_group '{item_doc.item_group}' not in {expanded_item_groups}")
                        continue
                    
                    # Filter by cost center if specified
                    if cost_center:
                        print(f"[DEBUG] Checking cost center filter for item {bin.item_code}")
                        
                        # Check if this item was transferred with this cost center
                        # We need to check both source and target warehouses for stock entries
                        stock_entries = frappe.get_all("Stock Entry Detail",
                            filters={
                                "item_code": bin.item_code,
                                "cost_center": cost_center,
                                "docstatus": 1  # Only submitted entries
                            },
                            fields=["name", "s_warehouse", "t_warehouse"],
                            limit=10
                        )
                        
                        print(f"[DEBUG] Found {len(stock_entries)} stock entries for item {bin.item_code} with cost center {cost_center}")
                        
                        # Check if any of these entries involve the current warehouse
                        warehouse_found = False
                        for entry in stock_entries:
                            if entry.s_warehouse == bin.warehouse or entry.t_warehouse == bin.warehouse:
                                warehouse_found = True
                                print(f"[DEBUG] Item {bin.item_code} found in warehouse {bin.warehouse} with cost center {cost_center}")
                                break
                        
                        if not warehouse_found:
                            print(f"[DEBUG] Skipping item {bin.item_code} - not found in warehouse {bin.warehouse} with cost center {cost_center}")
                            continue
                    
                    print(f"[DEBUG] Adding item {bin.item_code} with item_group '{item_doc.item_group}'")
                    
                    # Avoid negative quantities; clamp to zero to reflect available stock only
                    safe_qty = bin.actual_qty if (bin.actual_qty or 0) > 0 else 0
                    item_data = {
                        "item_code": bin.item_code,
                        "item_name": item_doc.item_name,
                        "qty": safe_qty,
                        "uom": item_doc.stock_uom,
                        "stock_uom": item_doc.stock_uom,
                        "conversion_factor": 1.0,
                        "warehouse": bin.warehouse,
                        "rate": bin.valuation_rate,
                        "valuation_rate": bin.valuation_rate
                    }
                    
                    # Add cost center to item if specified
                    if cost_center:
                        item_data["cost_center"] = cost_center
                    
                    items.append(item_data)
                    
                except Exception as e:
                    print(f"[DEBUG] Error processing item {bin.item_code}: {str(e)}")
                    continue
            
            print(f"[DEBUG] Final items count: {len(items)}")
            
        elif source_type == 'Warehouse':
            # Get items from warehouse (Bin table)
            bin_filters = {"warehouse": source}
            if not include_zero_qty:
                bin_filters["actual_qty"] = [">", 0]
            
            bins = frappe.get_all("Bin", 
                filters=bin_filters,
                fields=["item_code", "actual_qty", "valuation_rate"],
                order_by="item_code"
            )
            
            for bin in bins:
                item_doc = frappe.get_cached_doc("Item", bin.item_code)
                safe_qty = bin.actual_qty if (bin.actual_qty or 0) > 0 else 0
                items.append({
                    "item_code": bin.item_code,
                    "item_name": item_doc.item_name,
                    "qty": safe_qty,
                    "uom": item_doc.stock_uom,
                    "stock_uom": item_doc.stock_uom,
                    "conversion_factor": 1.0,
                    "warehouse": source,
                    "rate": bin.valuation_rate,
                    "valuation_rate": bin.valuation_rate
                })
                
        elif source_type == 'Sales Order':
            # Get items from sales order
            so_items = frappe.get_all("Sales Order Item",
                filters={"parent": source},
                fields=["item_code", "qty", "rate", "warehouse", "uom", "conversion_factor"],
                order_by="idx"
            )
            
            for so_item in so_items:
                item_doc = frappe.get_cached_doc("Item", so_item.item_code)
                items.append({
                    "item_code": so_item.item_code,
                    "item_name": item_doc.item_name,
                    "qty": so_item.qty,
                    "uom": so_item.uom or item_doc.stock_uom,
                    "stock_uom": item_doc.stock_uom,
                    "conversion_factor": so_item.conversion_factor or 1.0,
                    "warehouse": so_item.warehouse,
                    "rate": so_item.rate,
                    "valuation_rate": 0
                })
        
        return {"items": items}
        
    except Exception as e:
        print(f"[DEBUG] Error in get_items_from_source: {str(e)}")
        frappe.log_error(title="get_items_from_source error", message=frappe.get_traceback())
        frappe.throw(f"Error fetching items: {str(e)}")
