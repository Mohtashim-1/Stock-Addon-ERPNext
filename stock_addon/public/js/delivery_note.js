frappe.ui.form.on("Delivery Note", {
    refresh: function(frm) {
        console.log("🔍 DEBUG: Delivery Note refresh triggered");
        console.log("🔍 DEBUG: Has System Manager role:", frappe.user.has_role("System Manager"));
        console.log(" DEBUG: Is Administrator:", frappe.session.user === "Administrator");
        console.log("🔍 DEBUG: Current user:", frappe.session.user);
        
        // Check if the current user has System Manager or Administrator role
        if (!frappe.user.has_role("System Manager") && frappe.session.user !== "Administrator") {
            console.log("🔍 DEBUG: Condition met - user does not have System Manager or Administrator role");
            
            // Debug: Check what buttons exist before removal
            console.log("🔍 DEBUG: Buttons before removal:");
            console.log("🔍 DEBUG: Inner toolbar HTML:", frm.page.inner_toolbar.html());
            console.log("🔍 DEBUG: All buttons in inner toolbar:", frm.page.inner_toolbar.find("button").map(function() { return $(this).text().trim(); }).get());
            
            // Hide the "View" button immediately
            console.log("🔍 DEBUG: Attempting to remove 'View' button immediately");
            frm.page.remove_inner_button("View");
            
            // Debug: Check what buttons exist after immediate removal
            console.log("🔍 DEBUG: Buttons after immediate removal:");
            console.log("🔍 DEBUG: Inner toolbar HTML after removal:", frm.page.inner_toolbar.html());
            console.log("🔍 DEBUG: All buttons in inner toolbar after removal:", frm.page.inner_toolbar.find("button").map(function() { return $(this).text().trim(); }).get());
            
            // Also try to remove it after a short delay in case it gets added later
            setTimeout(() => {
                console.log("🔍 DEBUG: Attempting to remove 'View' button after 100ms delay");
                frm.page.remove_inner_button("View");
                
                // Debug: Check what buttons exist after delayed removal
                console.log("🔍 DEBUG: Buttons after delayed removal:");
                console.log("🔍 DEBUG: Inner toolbar HTML after delayed removal:", frm.page.inner_toolbar.html());
                console.log(" DEBUG: All buttons in inner toolbar after delayed removal:", frm.page.inner_toolbar.find("button").map(function() { return $(this).text().trim(); }).get());
            }, 100);
            
            // Try multiple times with different delays
            setTimeout(() => {
                console.log("🔍 DEBUG: Attempting to remove 'View' button after 500ms delay");
                frm.page.remove_inner_button("View");
            }, 500);
            
            setTimeout(() => {
                console.log(" DEBUG: Attempting to remove 'View' button after 1000ms delay");
                frm.page.remove_inner_button("View");
            }, 1000);
            
        } else {
            console.log("🔍 DEBUG: Condition NOT met - user has System Manager role or is Administrator");
        }
    }
});
