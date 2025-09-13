import frappe
import json

def set_cost_center_to_child_items(doc, method):
    if doc.custom_cost_center:
        for item in doc.items:
            item.cost_center = doc.custom_cost_center
            # item.save()


def get_expense_account(doc, method):
    """Set expense account from Stock Entry Type custom_account field"""
    if doc.stock_entry_type:
        try:
            # Get the Stock Entry Type document
            stock_entry_type_doc = frappe.get_doc("Stock Entry Type", doc.stock_entry_type)
            
            # Check if custom_account field exists and has a value
            if hasattr(stock_entry_type_doc, 'custom_account') and stock_entry_type_doc.custom_account:
                stock_entry_account = stock_entry_type_doc.custom_account
                
                # Set expense_account for all items
                for item in doc.items:
                    item.expense_account = stock_entry_account
                
                # frappe.msgprint(f"Expense account set to {stock_entry_account} from Stock Entry Type")
            else:
                # frappe.msgprint("No custom account found in Stock Entry Type", indicator="orange")
                pass
                
        except Exception as e:
            frappe.log_error(f"Error setting expense account: {str(e)}", "Stock Entry Expense Account Error")
            frappe.msgprint(f"Error setting expense account: {str(e)}", indicator="red")


@frappe.whitelist()
def get_items_from_source(source_type, source, include_zero_qty=False, company=None, warehouses=None, sales_order=None, cost_center=None):
    """Get items from warehouse, sales order, or cost center for Stock Entry"""
    try:
        print(f"[DEBUG] get_items_from_source called with:")
        print(f"  source_type: {source_type}")
        print(f"  source: {source}")
        print(f"  include_zero_qty: {include_zero_qty}")
        print(f"  company: {company}")
        print(f"  warehouses: {warehouses} (type: {type(warehouses)})")
        print(f"  sales_order: {sales_order}")
        print(f"  cost_center: {cost_center}")
        
        items = []
        
        if source_type == 'Warehouse':
            print(f"[DEBUG] Processing Warehouse source type")
            
            # Handle multiple warehouses - fix the parsing issue
            warehouse_list = []
            if isinstance(warehouses, str):
                try:
                    # Try to parse as JSON first
                    warehouse_list = json.loads(warehouses)
                except:
                    # If not JSON, treat as single warehouse
                    warehouse_list = [warehouses]
            elif isinstance(warehouses, list):
                warehouse_list = warehouses
            else:
                warehouse_list = [source]  # fallback to single source
            
            print(f"[DEBUG] Final warehouse_list: {warehouse_list}")
            
            # Get items from warehouse (Bin table)
            bin_filters = {"warehouse": ["in", warehouse_list]}
            if not include_zero_qty:
                bin_filters["actual_qty"] = [">", 0]
            
            print(f"[DEBUG] Bin filters: {bin_filters}")
            
            bins = frappe.get_all("Bin", 
                filters=bin_filters,
                fields=["item_code", "actual_qty", "valuation_rate", "warehouse"],
                order_by="warehouse, item_code"
            )
            
            print(f"[DEBUG] Found {len(bins)} bins")
            for i, bin in enumerate(bins[:5]):  # Show first 5 for debugging
                print(f"  Bin {i+1}: {bin}")
            
            for bin in bins:
                try:
                    item_doc = frappe.get_cached_doc("Item", bin.item_code)
                    items.append({
                        "item_code": bin.item_code,
                        "item_name": item_doc.item_name,
                        "qty": bin.actual_qty,
                        "uom": item_doc.stock_uom,
                        "stock_uom": item_doc.stock_uom,
                        "conversion_factor": 1.0,
                        "warehouse": bin.warehouse,
                        "rate": bin.valuation_rate,
                        "valuation_rate": bin.valuation_rate
                    })
                except Exception as e:
                    print(f"[DEBUG] Error processing item {bin.item_code}: {str(e)}")
                    continue
                
        elif source_type == 'Sales Order':
            print(f"[DEBUG] Processing Sales Order source type")
            
            # Get items from sales order
            so_items = frappe.get_all("Sales Order Item",
                filters={"parent": source},
                fields=["item_code", "qty", "rate", "warehouse", "uom", "conversion_factor"],
                order_by="idx"
            )
            
            print(f"[DEBUG] Found {len(so_items)} sales order items")
            
            for so_item in so_items:
                try:
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
                except Exception as e:
                    print(f"[DEBUG] Error processing SO item {so_item.item_code}: {str(e)}")
                    continue
        
        elif source_type == 'Warehouse with Sales Order':
            print(f"[DEBUG] Processing Warehouse with Sales Order source type")
            
            # New logic: Get items from warehouses that are tagged to specific sales order
            warehouse_list = []
            if isinstance(warehouses, str):
                try:
                    warehouse_list = json.loads(warehouses)
                except:
                    warehouse_list = [warehouses]
            elif isinstance(warehouses, list):
                warehouse_list = warehouses
            
            print(f"[DEBUG] Warehouse list: {warehouse_list}")
            print(f"[DEBUG] Sales order: {sales_order}")
            
            # First, get items from the sales order
            so_items = frappe.get_all("Sales Order Item",
                filters={"parent": sales_order},
                fields=["item_code", "qty", "rate", "warehouse", "uom", "conversion_factor"],
                order_by="idx"
            )
            
            print(f"[DEBUG] Found {len(so_items)} sales order items")
            
            # Get actual stock from bins for these items in the specified warehouses
            if so_items and warehouse_list:
                item_codes = [item.item_code for item in so_items]
                print(f"[DEBUG] Item codes from SO: {item_codes[:5]}...")  # Show first 5
                
                bin_filters = {
                    "warehouse": ["in", warehouse_list],
                    "item_code": ["in", item_codes]
                }
                if not include_zero_qty:
                    bin_filters["actual_qty"] = [">", 0]
                
                print(f"[DEBUG] Bin filters: {bin_filters}")
                
                bins = frappe.get_all("Bin", 
                    filters=bin_filters,
                    fields=["item_code", "actual_qty", "valuation_rate", "warehouse"],
                    order_by="warehouse, item_code"
                )
                
                print(f"[DEBUG] Found {len(bins)} matching bins")
                
                # Create a map of item_code to sales order details
                so_item_map = {item.item_code: item for item in so_items}
                
                for bin in bins:
                    so_item = so_item_map.get(bin.item_code)
                    if so_item:
                        try:
                            item_doc = frappe.get_cached_doc("Item", bin.item_code)
                            items.append({
                                "item_code": bin.item_code,
                                "item_name": item_doc.item_name,
                                "qty": bin.actual_qty,  # Use actual stock quantity
                                "uom": so_item.uom or item_doc.stock_uom,
                                "stock_uom": item_doc.stock_uom,
                                "conversion_factor": so_item.conversion_factor or 1.0,
                                "warehouse": bin.warehouse,
                                "rate": so_item.rate,
                                "valuation_rate": bin.valuation_rate,
                                "sales_order": sales_order,
                                "sales_order_qty": so_item.qty  # Keep reference to SO qty
                            })
                        except Exception as e:
                            print(f"[DEBUG] Error processing bin item {bin.item_code}: {str(e)}")
                            continue
        
        elif source_type == 'Cost Center':
            print(f"[DEBUG] Processing Cost Center source type")
            print(f"[DEBUG] Cost center: {cost_center}")
            
            # New logic: Get items from warehouses, optionally filtered by cost center
            warehouse_list = []
            if isinstance(warehouses, str):
                try:
                    warehouse_list = json.loads(warehouses)
                except:
                    warehouse_list = [warehouses]
            elif isinstance(warehouses, list):
                warehouse_list = warehouses
            
            print(f"[DEBUG] Warehouse list: {warehouse_list}")
            
            if cost_center:
                print(f"[DEBUG] Cost center specified, filtering by cost center")
                
                # If cost center is specified, get items from stock entries that used this cost center
                # and are currently in the specified warehouses
                
                # Get items from stock entries with this cost center
                stock_entry_items = frappe.get_all("Stock Entry Detail",
                    filters={"cost_center": cost_center},
                    fields=["item_code", "t_warehouse", "qty", "basic_rate", "valuation_rate"],
                    order_by="item_code"
                )
                
                print(f"[DEBUG] Found {len(stock_entry_items)} stock entry items with cost center")
                
                # Filter by warehouses and get current stock
                item_codes = list(set([item.item_code for item in stock_entry_items]))
                print(f"[DEBUG] Unique item codes from stock entries: {len(item_codes)}")
                
                if item_codes and warehouse_list:
                    bin_filters = {
                        "warehouse": ["in", warehouse_list],
                        "item_code": ["in", item_codes]
                    }
                    if not include_zero_qty:
                        bin_filters["actual_qty"] = [">", 0]
                    
                    print(f"[DEBUG] Bin filters for cost center: {bin_filters}")
                    
                    bins = frappe.get_all("Bin", 
                        filters=bin_filters,
                        fields=["item_code", "actual_qty", "valuation_rate", "warehouse"],
                        order_by="warehouse, item_code"
                    )
                    
                    print(f"[DEBUG] Found {len(bins)} bins matching cost center criteria")
                    
                    for bin in bins:
                        try:
                            item_doc = frappe.get_cached_doc("Item", bin.item_code)
                            items.append({
                                "item_code": bin.item_code,
                                "item_name": item_doc.item_name,
                                "qty": bin.actual_qty,
                                "uom": item_doc.stock_uom,
                                "stock_uom": item_doc.stock_uom,
                                "conversion_factor": 1.0,
                                "warehouse": bin.warehouse,
                                "rate": bin.valuation_rate,
                                "valuation_rate": bin.valuation_rate,
                                "cost_center": cost_center
                            })
                        except Exception as e:
                            print(f"[DEBUG] Error processing cost center item {bin.item_code}: {str(e)}")
                            continue
                else:
                    print(f"[DEBUG] No item codes or warehouses to process")
            else:
                print(f"[DEBUG] No cost center specified, getting all items from warehouses")
                
                # If no cost center specified, just get all items from warehouses
                bin_filters = {"warehouse": ["in", warehouse_list]}
                if not include_zero_qty:
                    bin_filters["actual_qty"] = [">", 0]
                
                print(f"[DEBUG] Bin filters for warehouses only: {bin_filters}")
                
                bins = frappe.get_all("Bin", 
                    filters=bin_filters,
                    fields=["item_code", "actual_qty", "valuation_rate", "warehouse"],
                    order_by="warehouse, item_code"
                )
                
                print(f"[DEBUG] Found {len(bins)} bins in warehouses")
                
                for bin in bins:
                    try:
                        item_doc = frappe.get_cached_doc("Item", bin.item_code)
                        items.append({
                            "item_code": bin.item_code,
                            "item_name": item_doc.item_name,
                            "qty": bin.actual_qty,
                            "uom": item_doc.stock_uom,
                            "stock_uom": item_doc.stock_uom,
                            "conversion_factor": 1.0,
                            "warehouse": bin.warehouse,
                            "rate": bin.valuation_rate,
                            "valuation_rate": bin.valuation_rate
                        })
                    except Exception as e:
                        print(f"[DEBUG] Error processing warehouse item {bin.item_code}: {str(e)}")
                        continue
        
        print(f"[DEBUG] Final result: {len(items)} items found")
        if items:
            print(f"[DEBUG] First few items: {items[:3]}")
        
        return {"items": items}
        
    except Exception as e:
        print(f"[DEBUG] Exception in get_items_from_source: {str(e)}")
        print(f"[DEBUG] Traceback: {frappe.get_traceback()}")
        frappe.log_error(title="get_items_from_source error", message=frappe.get_traceback())
        frappe.throw(f"Error fetching items: {str(e)}")
