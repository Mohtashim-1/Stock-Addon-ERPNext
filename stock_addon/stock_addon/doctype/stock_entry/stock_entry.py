import frappe

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