# Database Schema & Data Dictionary

## HKM CRM & Event Operations Platform

This document outlines the database schema, table structures, foreign key relationships, triggers, stored procedures (RPCs), and Row Level Security (RLS) policies implemented in PostgreSQL via Supabase.

---

## 1. Relational Database ERD Summary

```text
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │  rathayatra_registrations │         │ krishnashtami_registrations│
 ├───────────────────────────┤         ├───────────────────────────┤
 │ id (UUID, PK)             │         │ id (UUID, PK)             │
 │ full_name                 │         │ full_name                 │
 │ phone                     │         │ phone                     │
 │ whatsapp                  │         │ whatsapp                  │
 │ location / area           │         │ location / area           │
 └─────────────┬─────────────┘         └─────────────┬─────────────┘
               │                                     │
               └──────────────────┬──────────────────┘
                                  │ (Normalized Phone Match)
                                  ▼
                       ┌─────────────────────┐
                       │   master_contacts   │
                       ├─────────────────────┤
                       │ id (UUID, PK)       │
                       │ normalized_phone    │
                       │ full_name           │
                       │ created_at          │
                       └──────────┬──────────┘
                                  │
                                  ├───────────────────────────┐
                                  ▼                           ▼
                       ┌────────────────────┐      ┌─────────────────────┐
                       │master_contact_events│      │ operator_assignments│
                       ├────────────────────┤      ├─────────────────────┤
                       │ id (UUID, PK)      │      │ id (UUID, PK)       │
                       │ master_contact_id  │      │ registration_id     │
                       │ festival_name      │      │ operator_id (FK)    │
                       └────────────────────┘      │ status              │
                                                   │ notes               │
                                                   └──────────┬──────────┘
                                                              │
                                                              ▼
                                                   ┌─────────────────────┐
                                                   │  contact_operators  │
                                                   ├─────────────────────┤
                                                   │ id (UUID, PK)       │
                                                   │ name                │
                                                   │ phone               │
                                                   │ role (admin/caller) │
                                                   │ active              │
                                                   │ max_contacts        │
                                                   └─────────────────────┘
```

---

## 2. Table Definitions & Data Dictionary

### 2.1 `master_contacts`
Central deduplicated directory of all attendees.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique master contact identifier |
| `normalized_phone` | `TEXT` | `UNIQUE, NOT NULL` | E.164 formatted 10-digit phone (`+91XXXXXXXXXX`) |
| `full_name` | `TEXT` | `NOT NULL` | Attendee's full name |
| `whatsapp` | `TEXT` | `NULLABLE` | WhatsApp number |
| `email` | `TEXT` | `NULLABLE` | Email address |
| `area` | `TEXT` | `NULLABLE` | Locality or area of residence |
| `city` | `TEXT` | `NULLABLE` | City of residence |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |

### 2.2 `rathayatra_registrations`
Public festival registration records for Rathayatra.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique registration ID |
| `full_name` | `TEXT` | `NOT NULL` | Attendee full name |
| `phone` | `TEXT` | `NOT NULL` | Contact phone number |
| `whatsapp` | `TEXT` | `NULLABLE` | WhatsApp number |
| `number_of_attending` | `INTEGER` | `DEFAULT 1` | Total attendees in group |
| `pickup_location` | `TEXT` | `NULLABLE` | Transport pickup location |
| `stay_location` | `TEXT` | `NULLABLE` | Accommodation stay choice |
| `prasadam_tickets` | `INTEGER` | `DEFAULT 0` | Issued prasadam ticket count |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Registration timestamp |

### 2.3 `contact_operators`
Calling volunteers and platform administrators.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique operator ID |
| `name` | `TEXT` | `NOT NULL` | Operator name |
| `phone` | `TEXT` | `UNIQUE, NOT NULL` | Login phone number |
| `email` | `TEXT` | `NULLABLE` | Email address |
| `languages` | `TEXT[]` | `NOT NULL` | Array of languages spoken |
| `role` | `TEXT` | `CHECK (role IN ('admin','caller','volunteer'))` | Permission role |
| `active` | `BOOLEAN` | `DEFAULT TRUE` | Toggles operator availability |
| `max_contacts` | `INTEGER` | `DEFAULT 50` | Maximum call assignment cap |

### 2.4 `operator_assignments`
Assigns registrations to specific operators and tracks call outcomes.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Assignment record ID |
| `registration_id` | `UUID` | `NOT NULL` | Reference to festival registration ID |
| `operator_id` | `UUID` | `REFERENCES contact_operators(id)` | Assigned operator ID |
| `status` | `TEXT` | `DEFAULT 'Pending'` | Call status (`Pending`, `Connected`, `Converted`, `Not Interested`, etc.) |
| `notes` | `TEXT` | `NULLABLE` | Operator follow-up notes |
| `last_called_at` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp of last call attempt |

---

## 3. Stored Procedures & RPC Functions

### `rpc_auto_assign_contacts`
Atomic assignment procedure executed by admins.

* **Parameters:**
  * `p_festival` (`TEXT`): Festival target (`rathayatra`, `krishnashtami`, `contacts_register`)
  * `p_batch_size` (`INTEGER`): Max contacts to assign in batch
* **Behavior:**
  1. Identifies unassigned registrations without active assignments.
  2. Selects active operators (`active = true`) with available capacity (`current_assigned < max_contacts`).
  3. Matches contact language preferences with operator language capabilities.
  4. Atomically inserts records into `operator_assignments`.

---

## 4. Row Level Security (RLS) Policies

All public tables enforce RLS:

* **Public Registration (`rathayatra_registrations`, `krishnashtami_registrations`, `contacts_register`):**
  * `SELECT`: Public access disabled (Admin API only via service key).
  * `INSERT`: Public `anon` insertion permitted for event registrations.
* **Operators (`contact_operators`):**
  * `SELECT`: Authenticated operators can read active profiles.
  * `UPDATE / INSERT`: Admin role only.
* **Assignments (`operator_assignments`):**
  * `SELECT`: Operators can read assignments where `operator_id = auth_operator_id()`.

---

*HKM Database Schema Documentation — October 2026*
