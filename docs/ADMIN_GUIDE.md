# Admin Operations Guide — Rathayatra Management System

This guide outlines the features and operational tasks available to system administrators in the Admin Dashboard.

---

## 1. Login & Dashboard Access

1. Open your browser and navigate to `/admin`.
2. Enter your authorized administrator credentials (email and password).
3. Upon validation against the database, you will be redirected to `/admin/dashboard`.

---

## 2. Admin Dashboard Overview

The admin dashboard aggregates real-time indicators of the event:
- **Attendance Strip**: View real-time aggregates of registered attendees, checked-in guests, remaining guests, checked-in volunteers, dinner counts, and today's visits.
- **Recent Registrations**: Displays the last 10 entries added to the database.
- **Recent Check-ins**: Lists the last 5 check-in logs in real-time, detailing the registrant name, ID, gate check-in time, and which operator/admin cleared them.
- **Volunteer Allocations**: Details volunteer slot capacity allocations.

---

## 3. Provisioning Operators & Managing Capacity

Navigate to the **Operators** navigation link from the left sidebar layout:
- **View Operators**: Lists all active provisioning accounts, their current assignment load, and maximum capacity.
- **Add Operator**: Select the "New Operator" action button. Fill in display name, unique email, contact number, password, and assignment capacity (default is 50).
- **Edit / Deactivate**: Update capacity limits or toggle active status. If deactivated, they will immediately lose access on their next API query.

---

## 4. Contact Assignment Engine

Manage contact lists and call queue assignments from the **Contact Operators** view:
- **Auto Assign Existing Contacts**: Click this to automatically distribute unassigned registrations to operators who have remaining slot capacity. The button deactivates and displays a spinner during execution.
- **Dry-Run Analysis**: Displays a capacity checklist summary before executing assignments (total unassigned, active operator capacity, warning if operator capacity is insufficient).
- **Manual Assignment**: Click on any registration to manually associate it with an operator.

---

## 5. Visitor Check-In Center

Click on the **Visitor Check-In** layout button:
- **Manual Lookup**: Type the Registration ID (e.g. `REG-2026-000005`), Phone Number, or Full Name.
- **Double Check-In Protection**: If already checked in, it shows a visual badge with check-in timestamp and operator notes, and disables the check-in button.
- **Approve Entry**: Review demographic details, enter check-in remarks (optional), and click "Approve Visit".

---

## 6. Exporting Data

Navigate to the **Registrations** list:
- Search or filter registrations by volunteer status, occupation, slot, or donor flags.
- Click **Export CSV** to download a CSV spreadsheet containing all columns, including generated Registration Numbers and calling states.
