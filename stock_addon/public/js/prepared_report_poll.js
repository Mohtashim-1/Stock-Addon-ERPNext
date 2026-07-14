/**
 * Prepared reports (e.g. Stock Balance) notify completion via socket.io
 * ("report_generated"). When socket.io is Unauthorized/offline, the UI never
 * refreshes until a manual reload. Poll Prepared Report status as a fallback.
 */
(function () {
	const POLL_MS = 2000;
	const MAX_TRIES = 180; // ~6 minutes

	function get_status(prepared_name) {
		return frappe
			.db.get_value("Prepared Report", prepared_name, "status")
			.then((r) => (r && r.message && r.message.status) || null);
	}

	function stop_polling(report) {
		if (report._prepared_poll_timer) {
			clearInterval(report._prepared_poll_timer);
			report._prepared_poll_timer = null;
		}
	}

	function start_polling(report, prepared_name) {
		stop_polling(report);
		let tries = 0;

		report._prepared_poll_timer = setInterval(() => {
			tries += 1;
			get_status(prepared_name)
				.then((status) => {
					if (status === "Completed") {
						stop_polling(report);
						if (report.prepared_report_doc_name !== prepared_name) {
							return;
						}
						report.prepared_report_name = prepared_name;
						report.toggle_primary_button_disabled(false);
						frappe.show_alert({
							message: __("Report ready"),
							indicator: "green",
						});
						report.refresh();
					} else if (status === "Error" || tries >= MAX_TRIES) {
						stop_polling(report);
						report.toggle_primary_button_disabled(false);
						if (status === "Error") {
							frappe.show_alert({
								message: __("Report generation failed. Open Prepared Report for details."),
								indicator: "red",
							});
						}
					}
				})
				.catch(() => {
					if (tries >= MAX_TRIES) {
						stop_polling(report);
						report.toggle_primary_button_disabled(false);
					}
				});
		}, POLL_MS);
	}

	function patch_query_report() {
		if (!frappe.views || !frappe.views.QueryReport) {
			return false;
		}
		const proto = frappe.views.QueryReport.prototype;
		if (proto._prepared_report_poll_patched) {
			return true;
		}
		proto._prepared_report_poll_patched = true;

		const original = proto.generate_background_report;
		proto.generate_background_report = function () {
			const me = this;
			const result = original.apply(this, arguments);
			if (result && typeof result.then === "function") {
				result.then(() => {
					if (me.prepared_report_doc_name) {
						start_polling(me, me.prepared_report_doc_name);
					}
				});
			}
			return result;
		};

		return true;
	}

	function start() {
		if (patch_query_report()) {
			return;
		}
		if (window.jQuery) {
			$(document).on("app_ready", patch_query_report);
		}
		setTimeout(start, 300);
	}

	start();
})();
