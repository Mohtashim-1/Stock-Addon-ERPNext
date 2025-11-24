console.log('[MR List] material_request_list.js file loaded!');

// Get existing settings if any (from ERPNext or other apps)
const existingSettings = frappe.listview_settings["Material Request"] || {};

// Merge add_fields arrays
const existingAddFields = existingSettings.add_fields || [];
const ourAddFields = ["material_request_type", "status", "per_ordered", "per_received", "transfer_status", "naming_series"];
const mergedAddFields = [...new Set([...existingAddFields, ...ourAddFields])];

// Merge formatters
const existingFormatters = existingSettings.formatters || {};
const ourFormatters = {
		naming_series: function(value, df, doc) {
			if (!value) return "";
			
			// Map series codes to readable labels
			const seriesLabels = {
				'MR-MN-.###.-.YY': 'MR-MN-.###.-.YY',
				'MR-FB-.###.-.YY': 'MR-FB-.###.-.YY',
				'MR-PR-.###.-.YY': 'MR-PR-.###.-.YY',
				'MR-RF-.###.-.YY': 'MR-RF-.###.-.YY'
			};
			
			// Check if the value matches any of the allowed series patterns
			let displayValue = value;
			for (const [pattern, label] of Object.entries(seriesLabels)) {
				// Check if the value starts with the pattern (before the number part)
				const patternPrefix = pattern.split('.')[0]; // e.g., "MR-MN-"
				if (value.startsWith(patternPrefix)) {
					displayValue = label;
					break;
				}
			}
			
			// Return formatted value with color coding
			let color = "#6c757d"; // default gray
			if (value.includes('MR-MN')) color = "#0f62fe"; // blue
			else if (value.includes('MR-FB')) color = "#8b5cf6"; // purple
			else if (value.includes('MR-PR')) color = "#10b981"; // green
			else if (value.includes('MR-RF')) color = "#f59e0b"; // orange
			
			return `<span style="color: ${color}; font-weight: 500;">${frappe.utils.escape_html(displayValue)}</span>`;
		}
};
const mergedFormatters = Object.assign({}, existingFormatters, ourFormatters);

// Merge our settings with existing ones
frappe.listview_settings["Material Request"] = Object.assign({}, existingSettings, {
	add_fields: mergedAddFields,
	get_indicator: function (doc) {
		var precision = frappe.defaults.get_default("float_precision");
		if (doc.status == "Stopped") {
			return [__("Stopped"), "red", "status,=,Stopped"];
		} else if (doc.transfer_status && doc.docstatus != 2) {
			if (doc.transfer_status == "Not Started") {
				return [__("Not Started"), "orange"];
			} else if (doc.transfer_status == "In Transit") {
				return [__("In Transit"), "yellow"];
			} else if (doc.transfer_status == "Completed") {
				return [__("Completed"), "green"];
			}
		} else if (doc.docstatus == 1 && flt(doc.per_ordered, precision) == 0) {
			return [__("Pending"), "orange", "per_ordered,=,0|docstatus,=,1"];
		} else if (
			doc.docstatus == 1 &&
			flt(doc.per_ordered, precision) < 100 &&
			doc.material_request_type == "Material Transfer"
		) {
			return [__("Partially Received"), "yellow", "per_ordered,<,100"];
		} else if (doc.docstatus == 1 && flt(doc.per_ordered, precision) < 100) {
			return [__("Partially ordered"), "yellow", "per_ordered,<,100"];
		} else if (doc.docstatus == 1 && flt(doc.per_ordered, precision) == 100) {
			if (
				doc.material_request_type == "Purchase" &&
				flt(doc.per_received, precision) < 100 &&
				flt(doc.per_received, precision) > 0
			) {
				return [__("Partially Received"), "yellow", "per_received,<,100"];
			} else if (doc.material_request_type == "Purchase" && flt(doc.per_received, precision) == 100) {
				return [__("Received"), "green", "per_received,=,100"];
			} else if (doc.material_request_type == "Purchase") {
				return [__("Ordered"), "green", "per_ordered,=,100"];
			} else if (doc.material_request_type == "Material Transfer") {
				return [__("Transferred"), "green", "per_ordered,=,100"];
			} else if (doc.material_request_type == "Material Issue") {
				return [__("Issued"), "green", "per_ordered,=,100"];
			} else if (doc.material_request_type == "Customer Provided") {
				return [__("Received"), "green", "per_ordered,=,100"];
			} else if (doc.material_request_type == "Manufacture") {
				return [__("Manufactured"), "green", "per_ordered,=,100"];
			}
		}
	},
	
	formatters: mergedFormatters,
	
	onload: function(listview) {
		console.log('[MR List] onload triggered', {
			has_filter_area: !!listview.filter_area,
			has_wrapper: !!(listview.filter_area && listview.filter_area.$wrapper),
			wrapper_length: listview.filter_area && listview.filter_area.$wrapper ? listview.filter_area.$wrapper.length : 0
		});
		
		// Call existing onload if it exists (from ERPNext or other apps)
		if (existingSettings.onload && typeof existingSettings.onload === 'function') {
			try {
				existingSettings.onload(listview);
			} catch (e) {
				console.error('[MR List] Error calling existing onload:', e);
			}
		}
		
		// Add custom button for Series Filter
		add_series_filter_button(listview);
		
		// Get allowed series options (same as in material_request.js)
		function get_allowed_series() {
			return [
				'MR-MN-.###.-.YY',
				'MR-FB-.###.-.YY',
				'MR-PR-.###.-.YY',
				'MR-RF-.###.-.YY',
			];
		}
		
		function convertSeriesFilterToDropdown() {
			console.log('[MR List] convertSeriesFilterToDropdown called');
			
			// Try to find filter area using multiple methods
			let filterWrapper = null;
			
			// Method 1: Use filter_area.$wrapper if available
			if (listview.filter_area && listview.filter_area.$wrapper) {
				filterWrapper = listview.filter_area.$wrapper;
				console.log('[MR List] Using filter_area.$wrapper');
			}
			// Method 2: Use standard_filters_wrapper
			else if (listview.filter_area && listview.filter_area.standard_filters_wrapper) {
				filterWrapper = $(listview.filter_area.standard_filters_wrapper);
				console.log('[MR List] Using filter_area.standard_filters_wrapper');
			}
			// Method 3: Find from page DOM
			else if (listview.page && listview.page.page_form) {
				filterWrapper = listview.page.page_form.find('.standard-filter-section, .filter-section');
				console.log('[MR List] Using page.page_form.find');
			}
			// Method 4: Find from document
			else {
				filterWrapper = $('.standard-filter-section, .filter-section');
				console.log('[MR List] Using document.find');
			}
			
			if (!filterWrapper || filterWrapper.length === 0) {
				console.error('[MR List] Filter wrapper not found. Available:', {
					has_filter_area: !!listview.filter_area,
					has_wrapper: !!(listview.filter_area && listview.filter_area.$wrapper),
					has_standard_filters: !!(listview.filter_area && listview.filter_area.standard_filters_wrapper),
					has_page: !!listview.page,
					has_page_form: !!(listview.page && listview.page.page_form)
				});
				return false;
			}
			
			console.log('[MR List] Filter wrapper found, length:', filterWrapper.length);
			console.log('[MR List] Filter wrapper HTML:', filterWrapper.html().substring(0, 500));
			
			// Try multiple selectors to find the naming_series filter field
			let seriesFilter = null;
			
			// Method 1: Find by data-fieldname attribute (both input and select)
			seriesFilter = filterWrapper.find('input[data-fieldname="naming_series"], select[data-fieldname="naming_series"]');
			console.log('[MR List] Method 1 - Found by data-fieldname:', seriesFilter.length);
			
			// Method 2: Find by label text "Series"
			if (seriesFilter.length === 0) {
				console.log('[MR List] Trying Method 2 - Find by label text "Series"');
				filterWrapper.find('.filter-row, .standard-filter, .filter-field, .form-group').each(function() {
					const $row = $(this);
					const label = $row.find('label').text().trim();
					console.log('[MR List] Checking row with label:', label);
					if (label === 'Series' || label.includes('Series')) {
						seriesFilter = $row.find('input[type="text"], input.form-control, input');
						console.log('[MR List] Found input in Series row:', seriesFilter.length);
						if (seriesFilter.length > 0) {
							return false; // break
						}
					}
				});
			}
			
			// Method 3: Find by field name in the filter area
			if (seriesFilter.length === 0) {
				console.log('[MR List] Trying Method 3 - Find by field name');
				filterWrapper.find('input').each(function() {
					const $input = $(this);
					const fieldname = $input.attr('data-fieldname') || $input.attr('name') || '';
					const id = $input.attr('id') || '';
					console.log('[MR List] Checking input - fieldname:', fieldname, 'id:', id);
					if (fieldname.includes('naming_series') || fieldname.includes('series') || id.includes('series')) {
						seriesFilter = $input;
						console.log('[MR List] Found input by fieldname/id:', seriesFilter.length);
						return false; // break
					}
				});
			}
			
			// Method 4: Find all inputs and check their parent labels
			if (seriesFilter.length === 0) {
				console.log('[MR List] Trying Method 4 - Find by parent label');
				filterWrapper.find('input').each(function() {
					const $input = $(this);
					const $parent = $input.closest('.filter-field, .form-group, .filter-row, .standard-filter');
					const label = $parent.find('label').text().trim();
					console.log('[MR List] Checking input with parent label:', label);
					if (label === 'Series' || label.includes('Series')) {
						seriesFilter = $input;
						console.log('[MR List] Found input by parent label:', seriesFilter.length);
						return false; // break
					}
				});
			}
			
			// Method 5: Find by looking at all filter fields in the standard filter section (both input and select)
			if (seriesFilter.length === 0) {
				console.log('[MR List] Trying Method 5 - Find in standard-filter-section');
				$('.standard-filter-section input, .standard-filter-section select').each(function() {
					const $field = $(this);
					const $parent = $field.closest('.filter-field, .form-group');
					const label = $parent.find('label').text().trim();
					const fieldname = $field.attr('data-fieldname') || $field.attr('name') || '';
					console.log('[MR List] Checking standard filter field with label:', label, 'fieldname:', fieldname);
					if ((label === 'Series' || label.includes('Series')) || fieldname === 'naming_series') {
						seriesFilter = $field;
						console.log('[MR List] Found field in standard-filter-section:', seriesFilter.length, 'type:', seriesFilter.is('select') ? 'select' : 'input');
						return false; // break
					}
				});
			}
			
			// Method 6: Direct search for select with naming_series in entire document
			if (seriesFilter.length === 0) {
				console.log('[MR List] Trying Method 6 - Direct document search for select');
				$('select[data-fieldname="naming_series"]').each(function() {
					const $select = $(this);
					const $parent = $select.closest('.form-group, .filter-field');
					const label = $parent.find('label').text().trim();
					if (label === 'Series' || label.includes('Series') || $select.attr('placeholder') === 'Series') {
						seriesFilter = $select;
						console.log('[MR List] Found select by direct search:', seriesFilter.length);
						return false; // break
					}
				});
			}
			
			console.log('[MR List] Final seriesFilter check:', {
				found: !!(seriesFilter && seriesFilter.length > 0),
				length: seriesFilter ? seriesFilter.length : 0,
				is_input: seriesFilter ? seriesFilter.is('input') : false,
				is_select: seriesFilter ? seriesFilter.is('select') : false,
				element: seriesFilter ? seriesFilter[0] : null
			});
			
			if (seriesFilter && seriesFilter.length > 0) {
				// Check if already converted (has our custom data attribute)
				if (seriesFilter.is('select') && seriesFilter.attr('data-custom-series-dropdown') === 'true') {
					console.log('[MR List] Dropdown already converted, skipping...');
					return true;
				}
				
				console.log('[MR List] Series filter found! Converting to dropdown...');
				// Convert input to select dropdown
				if (seriesFilter.is('input')) {
					console.log('[MR List] It is an input, converting to select');
					const $select = $('<select>').attr({
						'data-fieldname': 'naming_series',
						'name': 'naming_series',
						'class': seriesFilter.attr('class') || 'form-control input-sm',
						'style': seriesFilter.attr('style') || ''
					});
				
				// Add empty option
				$select.append($('<option>').val('').text(__('All Series')));
				
				// Add series options
				const allowedSeries = get_allowed_series();
				allowedSeries.forEach(function(series) {
					const prefix = series.split('.')[0]; // e.g., "MR-MN-"
					let label = prefix;
					if (prefix === 'MR-MN-') label = 'MR-MN-.###.-.YY';
					else if (prefix === 'MR-FB-') label = 'MR-FB-.###.-.YY';
					else if (prefix === 'MR-PR-') label = 'MR-PR-.###.-.YY';
					else if (prefix === 'MR-RF-') label = 'MR-RF-.###.-.YY';
					
					$select.append($('<option>').val(prefix).text(label));
				});
				
					// Mark as custom dropdown
					$select.attr('data-custom-series-dropdown', 'true');
					
					// Replace input with select
					seriesFilter.replaceWith($select);
					
					// Add change handler
					$select.on('change', function() {
					const selectedValue = $(this).val();
					if (selectedValue) {
						// Remove existing naming_series filter
						listview.filter_area.remove('naming_series');
						// Add new filter
						listview.filter_area.add([
							['Material Request', 'naming_series', 'like', selectedValue + '%']
						]);
					} else {
						// Remove filter if "All Series" is selected
						listview.filter_area.remove('naming_series');
						listview.refresh();
					}
				});
				
					console.log('[MR List] Converted Series filter to dropdown');
					return true;
				} else if (seriesFilter.is('select')) {
					// If it's already a select, update options with our custom ones
					console.log('[MR List] Found existing select, current options:', seriesFilter.find('option').length);
					
					// Store current value if any (before clearing)
					const currentValue = seriesFilter.val();
					console.log('[MR List] Current value before update:', currentValue);
					
					// Check if options already match our custom ones
					const firstOption = seriesFilter.find('option').first();
					const isAlreadyCustom = firstOption.text() === __('All Series') || 
					                        seriesFilter.attr('data-custom-series-dropdown') === 'true';
					
					if (isAlreadyCustom) {
						console.log('[MR List] Already has custom options, preserving value');
						// Just ensure the value is preserved
						if (currentValue) {
							const matchingOption = seriesFilter.find(`option[value="${currentValue}"]`);
							if (matchingOption.length > 0) {
								seriesFilter.val(currentValue);
							}
						}
						return true;
					}
					
					// Clear and add our options
					seriesFilter.empty();
					
					// Mark as custom dropdown
					seriesFilter.attr('data-custom-series-dropdown', 'true');
					
					// Add empty option for "All Series"
					seriesFilter.append($('<option>').val('').text(__('All Series')));
					
					// Add our custom series options
					const allowedSeries = get_allowed_series();
					allowedSeries.forEach(function(series) {
						const prefix = series.split('.')[0]; // e.g., "MR-MN-"
						let label = prefix;
						if (prefix === 'MR-MN-') label = 'MR-MN-.###.-.YY';
						else if (prefix === 'MR-FB-') label = 'MR-FB-.###.-.YY';
						else if (prefix === 'MR-PR-') label = 'MR-PR-.###.-.YY';
						else if (prefix === 'MR-RF-') label = 'MR-RF-.###.-.YY';
						
						seriesFilter.append($('<option>').val(prefix).text(label));
					});
					
					// Restore previous value if it matches one of our options
					if (currentValue) {
						const matchingOption = seriesFilter.find(`option[value="${currentValue}"]`);
						if (matchingOption.length > 0) {
							seriesFilter.val(currentValue);
							console.log('[MR List] Restored value:', currentValue);
						} else {
							console.log('[MR List] Previous value does not match our options, clearing');
							seriesFilter.val('');
						}
					}
					
					// Remove any existing change handlers and add new one
					seriesFilter.off('change').on('change', function() {
						const selectedValue = $(this).val();
						console.log('[MR List] ===== FILTER CHANGE START =====');
						console.log('[MR List] Selected value:', selectedValue);
						
						// Debug: Check what's available
						console.log('[MR List] Debug - listview.page:', !!listview.page);
						console.log('[MR List] Debug - listview.page.fields_dict:', !!(listview.page && listview.page.fields_dict));
						if (listview.page && listview.page.fields_dict) {
							console.log('[MR List] Debug - fields_dict keys:', Object.keys(listview.page.fields_dict));
							console.log('[MR List] Debug - naming_series in fields_dict:', !!(listview.page.fields_dict['naming_series']));
						}
						
						// Try multiple ways to find the control
						let namingSeriesControl = null;
						
						// Method 1: fields_dict
						if (listview.page && listview.page.fields_dict && listview.page.fields_dict['naming_series']) {
							namingSeriesControl = listview.page.fields_dict['naming_series'];
							console.log('[MR List] Found naming_series control in fields_dict (Method 1)');
						}
						
						// Method 2: Try to find control from the select element itself
						if (!namingSeriesControl) {
							const control = seriesFilter.data('frappe-control');
							if (control) {
								namingSeriesControl = control;
								console.log('[MR List] Found naming_series control from data attribute (Method 2)');
							}
						}
						
						// Method 3: Try to find in filter_area
						if (!namingSeriesControl && listview.filter_area && listview.filter_area.standard_filters) {
							const filter = listview.filter_area.standard_filters.find(f => f.fieldname === 'naming_series');
							if (filter && filter.control) {
								namingSeriesControl = filter.control;
								console.log('[MR List] Found naming_series control in filter_area.standard_filters (Method 3)');
							}
						}
						
						// Use filter_area.add() directly instead of trying to set control value
						// This is more reliable because it directly adds the filter condition
						if (selectedValue) {
							// Use 'name' fieldname (Frappe uses 'name' for ID field) and 'like' condition
							// Add % wildcard to the value for like condition
							const filter = ['Material Request', 'name', 'like', selectedValue + '%'];
							console.log('[MR List] Adding filter via filter_area.add:', filter);
							
							// Remove existing name filter first
							if (listview.filter_area && listview.filter_area.remove) {
								try {
									console.log('[MR List] Removing existing name filter...');
									listview.filter_area.remove('name');
									console.log('[MR List] ✓ Existing filter removed');
								} catch (e) {
									console.log('[MR List] No existing filter to remove (or error):', e);
								}
							}
							
							// Add the filter as a non-standard filter directly via filter_list
							// This prevents Frappe from converting 'like' to '=' for standard filters
							if (listview.filter_area && listview.filter_area.filter_list) {
								console.log('[MR List] Adding filter as non-standard filter via filter_list...');
								
								// Remove existing name filter from filter_list first
								if (listview.filter_area.filter_list && listview.filter_area.filter_list.get_filter) {
									const existingFilter = listview.filter_area.filter_list.get_filter('name');
									if (existingFilter) {
										console.log('[MR List] Removing existing name filter from filter_list...');
										try {
											existingFilter.remove();
										} catch (e) {
											console.log('[MR List] Error removing existing filter:', e);
										}
									}
								}
								
								// Add as non-standard filter (this preserves the 'like' condition)
								if (listview.filter_area.filter_list && listview.filter_area.filter_list.add_filters) {
									listview.filter_area.filter_list.add_filters([filter]).then(function() {
										console.log('[MR List] ✓ Filter added successfully as non-standard filter');
										
										// Update only our custom dropdown
										if (seriesFilter && seriesFilter.length > 0) {
											seriesFilter.val(selectedValue);
											console.log('[MR List] ✓ Custom dropdown value updated to:', selectedValue);
										}
										
										// Refresh the list view
										if (listview.refresh) {
											console.log('[MR List] Refreshing list view...');
											listview.refresh();
										}
									}).catch(function(e) {
										console.error('[MR List] ✗ Error adding filter via filter_list:', e);
									});
								} else {
									console.warn('[MR List] filter_list.add_filters not available, falling back to filter_area.add');
									// Fallback to filter_area.add
									if (listview.filter_area && listview.filter_area.add) {
										listview.filter_area.add([filter], true);
									}
								}
							} else if (listview.filter_area && listview.filter_area.add) {
								// Fallback: use filter_area.add
								console.log('[MR List] Adding filter via filter_area.add (fallback)...');
								listview.filter_area.add([filter], true).then(function() {
									console.log('[MR List] ✓ Filter added successfully via filter_area.add');
									
									// Update only our custom dropdown
									if (seriesFilter && seriesFilter.length > 0) {
										seriesFilter.val(selectedValue);
										console.log('[MR List] ✓ Custom dropdown value updated to:', selectedValue);
									}
									
									// Debug: Check if filter was actually applied
									setTimeout(function() {
										if (listview.filter_area && listview.filter_area.get) {
											const appliedFilters = listview.filter_area.get();
											console.log('[MR List] Applied filters after add:', appliedFilters);
											const nameFilter = appliedFilters.find(f => 
												(f[0] === 'Material Request' || f[0] === 'material_request' || !f[0]) && 
												f[1] === 'name'
											);
											if (nameFilter) {
												console.log('[MR List] ✓ name filter found in applied filters:', nameFilter);
											} else {
												console.warn('[MR List] ✗ name filter NOT found in applied filters');
												console.log('[MR List] All applied filters:', appliedFilters);
											}
											
											// Also check the listview's filters directly
											if (listview.get_filters_for_args) {
												const queryFilters = listview.get_filters_for_args();
												console.log('[MR List] Query filters (for args):', queryFilters);
												const nameInQuery = queryFilters.find(f => 
													(f[0] === 'Material Request' || f[0] === 'material_request' || !f[0]) && 
													f[1] === 'name'
												);
												if (nameInQuery) {
													console.log('[MR List] ✓ name filter found in query filters:', nameInQuery);
												} else {
													console.warn('[MR List] ✗ name filter NOT found in query filters');
												}
											}
										} else {
											console.warn('[MR List] filter_area.get() not available');
										}
									}, 500);
								}).catch(function(e) {
									console.error('[MR List] ✗ Error adding filter:', e);
								});
							} else {
								console.error('[MR List] ✗ filter_area.add not available');
							}
						} else {
							// Clear the filter
							console.log('[MR List] Clearing filter (All Series selected)');
							
							if (listview.filter_area && listview.filter_area.remove) {
								try {
									listview.filter_area.remove('name');
									console.log('[MR List] ✓ Filter removed successfully');
								} catch (e) {
									console.log('[MR List] No filter to remove (or error):', e);
								}
							}
							
							// Also clear the control's display value
							if (namingSeriesControl) {
								if (namingSeriesControl.set_value && typeof namingSeriesControl.set_value === 'function') {
									namingSeriesControl.set_value('').then(function() {
										console.log('[MR List] ✓ Control display value cleared');
									}).catch(function(e) {
										console.log('[MR List] Could not clear control display value:', e);
									});
								} else if (namingSeriesControl.$input) {
									namingSeriesControl.$input.val('');
									console.log('[MR List] ✓ Control display value cleared via $input');
								} else if (namingSeriesControl.input) {
									$(namingSeriesControl.input).val('');
									console.log('[MR List] ✓ Control display value cleared via input');
								}
							}
							
							// Refresh the list view
							if (listview.refresh) {
								listview.refresh();
							}
						}
						
						console.log('[MR List] ===== FILTER CHANGE END =====');
					});
					
					console.log('[MR List] Updated Series select dropdown with', allowedSeries.length, 'options');
					return true;
				}
			}
			
			console.log('[MR List] Series filter field not found');
			return false;
		}
		
		// Wait for filter area to be ready, then try to convert
		function waitForFilterAreaAndConvert() {
			const maxAttempts = 20;
			let attempts = 0;
			
			const checkInterval = setInterval(function() {
				attempts++;
				console.log(`[MR List] Attempt ${attempts}/${maxAttempts} - Checking for filter area...`);
				
				// Check if filter area is ready
				const hasFilterArea = listview.filter_area && (
					listview.filter_area.$wrapper ||
					listview.filter_area.standard_filters_wrapper ||
					(listview.page && listview.page.page_form && listview.page.page_form.find('.standard-filter-section').length > 0) ||
					$('.standard-filter-section').length > 0
				);
				
				if (hasFilterArea) {
					console.log('[MR List] Filter area found! Attempting conversion...');
					clearInterval(checkInterval);
					convertSeriesFilterToDropdown();
				} else if (attempts >= maxAttempts) {
					console.error('[MR List] Max attempts reached, filter area still not found');
					clearInterval(checkInterval);
					// Try one more time anyway
					convertSeriesFilterToDropdown();
				}
			}, 300);
		}
		
		// Start waiting for filter area
		console.log('[MR List] Starting to wait for filter area...');
		waitForFilterAreaAndConvert();
		
		// Also try after delays as backup
		setTimeout(function() {
			console.log('[MR List] Timeout 1 (1000ms) - Attempting conversion');
			convertSeriesFilterToDropdown();
		}, 1000);
		
		setTimeout(function() {
			console.log('[MR List] Timeout 2 (2000ms) - Attempting conversion');
			convertSeriesFilterToDropdown();
		}, 2000);
		
		setTimeout(function() {
			console.log('[MR List] Timeout 3 (4000ms) - Attempting conversion');
			convertSeriesFilterToDropdown();
		}, 4000);
		
		// Hook into filter area refresh to reapply when filters are reset
		// Use MutationObserver on document body to catch filter area creation
		console.log('[MR List] Setting up MutationObserver on document body');
		const observer = new MutationObserver(function(mutations) {
			let shouldCheck = false;
			mutations.forEach(function(mutation) {
				if (mutation.addedNodes.length > 0) {
					Array.from(mutation.addedNodes).forEach(function(node) {
						if (node.nodeType === 1) { // Element node
							const $node = $(node);
							if ($node.hasClass('standard-filter-section') || 
							    $node.hasClass('filter-section') ||
							    $node.find('.standard-filter-section, .filter-section').length > 0) {
								shouldCheck = true;
							}
						}
					});
				}
			});
			
			if (shouldCheck) {
				console.log('[MR List] MutationObserver detected filter area changes');
				setTimeout(function() {
					convertSeriesFilterToDropdown();
				}, 200);
			}
		});
		
		// Observe the page form or document body
		const observeTarget = (listview.page && listview.page.page_form && listview.page.page_form[0]) || document.body;
		observer.observe(observeTarget, {
			childList: true,
			subtree: true
		});
		console.log('[MR List] MutationObserver set up successfully');
		
		// Also hook into listview refresh
		const originalRefresh = listview.refresh;
		listview.refresh = function() {
			const result = originalRefresh.apply(this, arguments);
			setTimeout(function() {
				convertSeriesFilterToDropdown();
			}, 300);
			return result;
		};
	}
});

// Function to add custom Series Filter button
function add_series_filter_button(listview) {
	console.log('[MR List] ===== add_series_filter_button called =====');
	console.log('[MR List] listview:', listview);
	console.log('[MR List] listview.page:', listview.page);
	console.log('[MR List] listview.page.add_inner_button:', listview.page && listview.page.add_inner_button);
	
	// Get allowed series options
	function get_allowed_series() {
		const series = [
			'MR-MN-.###.-.YY',
			'MR-FB-.###.-.YY',
			'MR-PR-.###.-.YY',
			'MR-RF-.###.-.YY',
		];
		console.log('[MR List] get_allowed_series() returning:', series);
		return series;
	}
	
	// Use Frappe's proper method to add button
	if (listview.page && listview.page.add_inner_button) {
		console.log('[MR List] ✓ add_inner_button available, adding button immediately');
		try {
			listview.page.add_inner_button(__('Filter by Series'), function() {
				console.log('[MR List] Filter by Series button clicked!');
				const series = get_allowed_series();
				console.log('[MR List] Showing dialog with series:', series);
				show_series_filter_dialog(listview, series);
			});
			console.log('[MR List] ✓ Series filter button added successfully using add_inner_button');
		} catch (e) {
			console.error('[MR List] ✗ Error adding button with add_inner_button:', e);
		}
	} else {
		console.log('[MR List] ⚠ add_inner_button not available, waiting...');
		// Fallback: Wait for page to be ready
		setTimeout(function() {
			console.log('[MR List] Retry: Checking for add_inner_button after delay');
			console.log('[MR List] listview.page:', listview.page);
			console.log('[MR List] listview.page.add_inner_button:', listview.page && listview.page.add_inner_button);
			
			if (listview.page && listview.page.add_inner_button) {
				console.log('[MR List] ✓ add_inner_button now available, adding button');
				try {
					listview.page.add_inner_button(__('Filter by Series'), function() {
						console.log('[MR List] Filter by Series button clicked! (delayed)');
						const series = get_allowed_series();
						console.log('[MR List] Showing dialog with series:', series);
						show_series_filter_dialog(listview, series);
					});
					console.log('[MR List] ✓ Series filter button added successfully (delayed)');
				} catch (e) {
					console.error('[MR List] ✗ Error adding button (delayed):', e);
				}
			} else {
				console.error('[MR List] ✗ Could not add series filter button - add_inner_button still not available');
				console.log('[MR List] Trying manual button insertion...');
				// Last resort: try to find page actions manually
				setTimeout(function() {
					console.log('[MR List] Looking for page actions manually...');
					const pageActions = $('.page-actions, .list-page-actions, .page-header-actions');
					console.log('[MR List] Found page actions elements:', pageActions.length);
					
					if (pageActions.length > 0) {
						console.log('[MR List] ✓ Page actions found, creating button manually');
						const $btn = $(`
							<button class="btn btn-sm btn-secondary series-filter-btn" style="margin-left: 10px;">
								🔍 ${__('Filter by Series')}
							</button>
						`);
						$btn.on('click', function() {
							console.log('[MR List] Manual button clicked!');
							const series = get_allowed_series();
							console.log('[MR List] Showing dialog with series:', series);
							show_series_filter_dialog(listview, series);
						});
						pageActions.append($btn);
						console.log('[MR List] ✓ Series filter button added manually');
					} else {
						console.error('[MR List] ✗ No page actions found for manual insertion');
					}
				}, 1000);
			}
		}, 500);
	}
	console.log('[MR List] ===== add_series_filter_button finished =====');
}

// Function to show series filter dialog
function show_series_filter_dialog(listview, series_options) {
	console.log('[MR List] ===== show_series_filter_dialog called =====');
	console.log('[MR List] series_options:', series_options);
	console.log('[MR List] listview:', listview);
	console.log('[MR List] listview.filter_area:', listview.filter_area);
	
	// Get current filter value if any
	let current_filter = null;
	if (listview.filter_area && listview.filter_area.get) {
		console.log('[MR List] Getting current filters...');
		try {
			const filters = listview.filter_area.get();
			console.log('[MR List] Current filters:', filters);
			const name_filter = filters.find(f => 
				(f[0] === 'Material Request' || !f[0]) && 
				f[1] === 'name' && 
				f[2] === 'like'
			);
			console.log('[MR List] Found name filter:', name_filter);
			
			if (name_filter && name_filter[3]) {
				// Extract prefix from filter value (e.g., "MR-MN-001" -> "MR-MN-")
				const filter_value = name_filter[3];
				console.log('[MR List] Filter value:', filter_value);
				for (const series of series_options) {
					const prefix = series.split('.')[0]; // e.g., "MR-MN-"
					if (filter_value.startsWith(prefix)) {
						current_filter = prefix;
						console.log('[MR List] Matched current filter to prefix:', current_filter);
						break;
					}
				}
			}
		} catch (e) {
			console.error('[MR List] Error getting current filters:', e);
		}
	} else {
		console.log('[MR List] No filter_area.get method available');
	}
	
	console.log('[MR List] Current filter (prefix):', current_filter);
	
	// Format options for Select field (Frappe expects string format with labels)
	// Format: "Label1\nLabel2" where each line is an option
	const select_options = [
		__('All Series'),
		...series_options
	].join('\n');
	
	console.log('[MR List] Select options string:', select_options);
	
	// Create mapping for values (prefix) to labels (full series)
	const series_map = {};
	series_options.forEach(s => {
		const prefix = s.split('.')[0]; // e.g., "MR-MN-"
		series_map[prefix] = s;
	});
	console.log('[MR List] Series map:', series_map);
	
	const default_value = current_filter ? series_map[current_filter] || '' : '';
	console.log('[MR List] Default value for dialog:', default_value);
	
	// Create dialog
	console.log('[MR List] Creating dialog...');
	const dialog = new frappe.ui.Dialog({
		title: __('Filter by Series'),
		fields: [
			{
				fieldname: 'series',
				fieldtype: 'Select',
				label: __('Select Series'),
				options: select_options,
				default: default_value,
				reqd: 0
			}
		],
		primary_action_label: __('Apply Filter'),
		primary_action: function(values) {
			console.log('[MR List] ===== Dialog primary_action called =====');
			console.log('[MR List] Dialog values:', values);
			
			let selected_series = values.series;
			console.log('[MR List] Selected series (raw):', selected_series);
			
			// Convert full series format to prefix if needed (e.g., "MR-MN-.###.-.YY" -> "MR-MN-")
			if (selected_series && selected_series.includes('.')) {
				selected_series = selected_series.split('.')[0];
				console.log('[MR List] Converted to prefix:', selected_series);
			}
			
			// Remove existing name filter
			if (listview.filter_area && listview.filter_area.remove) {
				console.log('[MR List] Removing existing name filter...');
				try {
					listview.filter_area.remove('name');
					console.log('[MR List] ✓ Existing filter removed');
				} catch (e) {
					console.log('[MR List] No existing filter to remove or error:', e);
				}
			} else {
				console.log('[MR List] No filter_area.remove method available');
			}
			
			// Apply new filter if series is selected
			if (selected_series && selected_series !== __('All Series')) {
				console.log('[MR List] Applying filter for series:', selected_series);
				// Add filter using 'like' condition to match names starting with the series prefix
				const filter = ['Material Request', 'name', 'like', selected_series + '%'];
				console.log('[MR List] Filter to apply:', filter);
				
				if (listview.filter_area && listview.filter_area.add) {
					console.log('[MR List] Using filter_area.add()...');
					listview.filter_area.add([filter]).then(function() {
						console.log('[MR List] ✓ Filter added successfully');
						frappe.show_alert({
							message: __('Filter applied: {0}', [selected_series]),
							indicator: 'green'
						}, 3);
						dialog.hide();
					}).catch(function(e) {
						console.error('[MR List] ✗ Error applying filter:', e);
						frappe.show_alert({
							message: __('Error applying filter'),
							indicator: 'red'
						}, 3);
					});
				} else {
					console.log('[MR List] filter_area.add not available, trying filter_list...');
					// Fallback: use filter_list
					if (listview.filter_area && listview.filter_area.filter_list && listview.filter_area.filter_list.add_filters) {
						console.log('[MR List] Using filter_list.add_filters()...');
						listview.filter_area.filter_list.add_filters([filter]).then(function() {
							console.log('[MR List] ✓ Filter added via filter_list');
							frappe.show_alert({
								message: __('Filter applied: {0}', [selected_series]),
								indicator: 'green'
							}, 3);
							dialog.hide();
						}).catch(function(e) {
							console.error('[MR List] ✗ Error adding filter via filter_list:', e);
							frappe.show_alert({
								message: __('Error applying filter'),
								indicator: 'red'
							}, 3);
						});
					} else {
						console.error('[MR List] ✗ No filter method available');
						frappe.show_alert({
							message: __('Unable to apply filter'),
							indicator: 'red'
						}, 3);
					}
				}
			} else {
				console.log('[MR List] Clearing filter (All Series selected or empty)');
				// Clear filter
				if (listview.filter_area && listview.filter_area.remove) {
					try {
						listview.filter_area.remove('name');
						console.log('[MR List] ✓ Filter removed');
					} catch (e) {
						console.log('[MR List] No filter to remove or error:', e);
					}
				}
				frappe.show_alert({
					message: __('Filter cleared'),
					indicator: 'blue'
				}, 3);
				dialog.hide();
				if (listview.refresh) {
					console.log('[MR List] Refreshing listview...');
					listview.refresh();
				}
			}
			console.log('[MR List] ===== Dialog primary_action finished =====');
		}
	});
	
	console.log('[MR List] Showing dialog...');
	dialog.show();
	console.log('[MR List] ===== show_series_filter_dialog finished =====');
}