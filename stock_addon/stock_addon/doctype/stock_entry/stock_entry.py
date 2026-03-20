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


def notify_system_managers_for_bom_exceptions(doc, method):
    if not getattr(doc, "bom_no", None):
        return

    try:
        bom_doc = frappe.get_doc("BOM", doc.bom_no)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Stock Entry BOM fetch failed")
        return

    bom_items = {row.item_code: row for row in bom_doc.items}
    bom_qty = bom_doc.quantity or 1
    fg_qty = doc.fg_completed_qty or 0
    multiplier = (fg_qty / bom_qty) if (fg_qty and bom_qty) else 1

    extra_items = []
    over_items = []

    for row in doc.items or []:
        if not row.item_code:
            continue
        if getattr(row, "is_finished_item", 0):
            continue

        bom_row = bom_items.get(row.item_code)
        if not bom_row:
            extra_items.append(row)
            continue

        expected = (getattr(bom_row, "stock_qty", None) or bom_row.qty or 0) * multiplier
        if expected and (row.qty or 0) > expected:
            over_items.append((row, expected))

    if not extra_items and not over_items:
        return

    role_rows = frappe.get_all("Has Role", filters={"role": "System Manager"}, fields=["parent"])
    users = sorted({r.parent for r in role_rows})
    if not users:
        return

    enabled_users = frappe.get_all("User", filters={"name": ["in", users], "enabled": 1}, fields=["name"])
    recipients = [u.name for u in enabled_users]
    if not recipients:
        return

    subject = f"Stock Entry {doc.name}: BOM exceptions detected"

    lines = []
    lines.append(f"<p>Stock Entry <b>{doc.name}</b> has BOM exceptions.</p>")
    lines.append(f"<p>BOM: <b>{doc.bom_no}</b></p>")
    lines.append(f"<p>Company: {doc.company or ''} | Posting Date: {doc.posting_date}</p>")

    if extra_items:
        lines.append("<p><b>Items not in BOM:</b></p><ul>")
        for row in extra_items:
            lines.append(f"<li>{row.item_code} - Qty {row.qty}</li>")
        lines.append("</ul>")

    if over_items:
        lines.append("<p><b>Items exceeding BOM qty:</b></p><ul>")
        for row, expected in over_items:
            lines.append(f"<li>{row.item_code} - Qty {row.qty} (Expected {expected})</li>")
        lines.append("</ul>")

    message = "\n".join(lines)

    try:
        frappe.sendmail(recipients=recipients, subject=subject, message=message)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Stock Entry BOM exception email failed")


@frappe.whitelist()
def get_stock_entry_extra_qt_data(filters=None):
    if isinstance(filters, str):
        try:
            filters = json.loads(filters)
        except Exception:
            filters = {}

    filters = filters or {}

    conditions = []
    values = {}

    if filters.get("stock_entry"):
        conditions.append("se.name = %(stock_entry)s")
        values["stock_entry"] = filters.get("stock_entry")

    if filters.get("bom_no"):
        conditions.append("se.bom_no = %(bom_no)s")
        values["bom_no"] = filters.get("bom_no")

    if filters.get("from_date"):
        conditions.append("se.posting_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("se.posting_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    if filters.get("item_code"):
        conditions.append("sed.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")

    where_clause = " AND ".join(conditions)
    if where_clause:
        where_clause = "AND " + where_clause

    rows = frappe.db.sql(
        f"""
            SELECT
                se.name AS stock_entry,
                se.posting_date,
                se.stock_entry_type,
                se.purpose,
                se.bom_no,
                se.fg_completed_qty,
                se.work_order,
                se.company,
                sed.item_code,
                sed.item_name,
                sed.is_finished_item,
                sed.qty,
                sed.uom,
                sed.conversion_factor,
                sed.stock_uom,
                sed.s_warehouse,
                sed.t_warehouse
            FROM `tabStock Entry` se
            INNER JOIN `tabStock Entry Detail` sed
                ON sed.parent = se.name
                AND sed.parenttype = 'Stock Entry'
            WHERE se.docstatus < 2
            {where_clause}
            ORDER BY se.posting_date DESC, se.name DESC, sed.idx ASC
        """,
        values=values,
        as_dict=True
    )

    if not rows:
        return []

    exceptions = []
    bom_cache = {}

    def get_bom(bom_no):
        if not bom_no:
            return None
        if bom_no not in bom_cache:
            try:
                bom_cache[bom_no] = frappe.get_doc("BOM", bom_no)
            except Exception:
                bom_cache[bom_no] = None
        return bom_cache[bom_no]

    grouped = {}
    for row in rows:
        grouped.setdefault(row.stock_entry, []).append(row)

    for se_name, items in grouped.items():
        first = items[0]
        bom_no = first.get("bom_no")
        if not bom_no:
            continue

        bom_doc = get_bom(bom_no)
        if not bom_doc:
            continue

        bom_items = {r.item_code: r for r in bom_doc.items}
        bom_qty = bom_doc.quantity or 1
        fg_qty = first.get("fg_completed_qty") or 0
        multiplier = (fg_qty / bom_qty) if (fg_qty and bom_qty) else 1

        for row in items:
            if not row.get("item_code"):
                continue
            if row.get("is_finished_item"):
                continue

            bom_row = bom_items.get(row.item_code)
            if not bom_row:
                row.exception_type = "Not in BOM"
                row.expected_qty = 0
                row.extra_qty = row.qty or 0
                exceptions.append(row)
                continue

            # Compute expected in same UOM as stock entry row
            expected = 0
            if row.get("uom") and row.get("uom") == getattr(bom_row, "uom", None):
                expected = (bom_row.qty or 0) * multiplier
            elif row.get("uom") and row.get("uom") == getattr(bom_row, "stock_uom", None):
                expected = (getattr(bom_row, "stock_qty", None) or 0) * multiplier
            else:
                # Fallback: compute in stock UOM then convert to row UOM using row.conversion_factor
                expected_stock = (getattr(bom_row, "stock_qty", None) or 0) * multiplier
                if row.get("conversion_factor"):
                    try:
                        expected = expected_stock / row.get("conversion_factor")
                    except Exception:
                        expected = expected_stock
                else:
                    expected = expected_stock

            if expected and (row.qty or 0) > (expected + 1e-9):
                row.exception_type = "Qty > Expected"
                row.expected_qty = expected
                row.extra_qty = (row.qty or 0) - expected
                exceptions.append(row)

    return exceptions


@frappe.whitelist()
def send_stock_entry_extra_qt_email(filters=None, recipients=None, subject=None):
    rows = get_stock_entry_extra_qt_data(filters=filters)
    if not rows:
        return "No records found for the selected filters."

    recips = []
    if recipients:
        if isinstance(recipients, str):
            recips = [r.strip() for r in recipients.split(',') if r.strip()]
        elif isinstance(recipients, (list, tuple)):
            recips = [r for r in recipients if r]

    if not recips:
        role_rows = frappe.get_all("Has Role", filters={"role": "System Manager"}, fields=["parent"])
        users = sorted({r.parent for r in role_rows})
        if users:
            enabled_users = frappe.get_all(
                "User",
                filters={"name": ["in", users], "enabled": 1, "user_type": ["!=", "Website User"]},
                fields=["name", "email"]
            )
            for u in enabled_users:
                recips.append(u.email or u.name)

    if not recips:
        return "No valid recipients found."

    subject = subject or "Stock Entry Extra Qty Results"

    # Summary
    summary_lines = [
        f"<p><b>Total Rows:</b> {len(rows)}</p>",
    ]

    # Table
    table_head = [
        "Stock Entry", "Posting Date", "Stock Entry Type", "Purpose", "BOM No",
        "Item Code", "Item Name", "Qty", "Expected Qty", "Extra Qty",
        "UOM", "Source WH", "Target WH", "Work Order", "Company", "Exception"
    ]

    table = ["<table border=\"1\" cellspacing=\"0\" cellpadding=\"5\">", "<thead><tr>"]
    for h in table_head:
        table.append(f"<th>{frappe.utils.escape_html(h)}</th>")
    table.append("</tr></thead><tbody>")

    for row in rows:
        table.append("<tr>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('stock_entry') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('posting_date') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('stock_entry_type') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('purpose') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('bom_no') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('item_code') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('item_name') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('qty') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('expected_qty') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('extra_qty') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('uom') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('s_warehouse') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('t_warehouse') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('work_order') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('company') or '')}</td>")
        table.append(f"<td>{frappe.utils.escape_html(row.get('exception_type') or '')}</td>")
        table.append("</tr>")

    table.append("</tbody></table>")

    message = "\n".join(summary_lines + table)

    # CSV attachment
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(table_head)
    for row in rows:
        writer.writerow([
            row.get('stock_entry') or '',
            row.get('posting_date') or '',
            row.get('stock_entry_type') or '',
            row.get('purpose') or '',
            row.get('bom_no') or '',
            row.get('item_code') or '',
            row.get('item_name') or '',
            row.get('qty') or '',
            row.get('expected_qty') or '',
            row.get('extra_qty') or '',
            row.get('uom') or '',
            row.get('s_warehouse') or '',
            row.get('t_warehouse') or '',
            row.get('work_order') or '',
            row.get('company') or '',
            row.get('exception_type') or ''
        ])

    attachments = [{
        'fname': 'stock_entry_extra_qt.csv',
        'fcontent': output.getvalue()
    }]

    frappe.sendmail(
        recipients=recips,
        subject=subject,
        message=message,
        attachments=attachments
    )

    return f"Email sent to: {', '.join(recips)}"



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
