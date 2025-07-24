import frappe
from frappe import _


def get_data(data=None):
    return {
        'fieldname': 'custom_landed_cost_voucher_reference',
        'transactions': [
            {
                'label': _('Purchase Documents'),
                'items': ['Purchase Invoice',]
            }
        ]
    }
