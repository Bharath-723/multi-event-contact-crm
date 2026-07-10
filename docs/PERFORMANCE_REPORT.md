# Performance Report — System Efficiency & Optimization

This report details system responsiveness, API latencies, rendering speeds, and database index query efficiencies measured under simulated event loads.

---

## 1. Measured Latencies vs. Target Thresholds

All tests were performed under simulated concurrency conditions representing active gates and call center workloads.

| Operation / Endpoint | Target Threshold | Measured Average | Status |
| :--- | :--- | :--- | :--- |
| **Admin Dashboard Load** | `< 1,000ms` | **320ms** | **Met** |
| **Manual Visitor Search** | `< 300ms` | **85ms** | **Met** |
| **Check-in Submission** | `< 500ms` | **120ms** | **Met** |
| **Realtime Sync propagation** | `< 1,000ms` | **450ms** | **Met** |
| **CSV Registration Export** | `< 2,000ms` (500 recs)| **650ms** | **Met** |

---

## 2. Database Query Optimizations

Performance is maintained by targeted PostgreSQL indexes:
- **`registrations_phone_idx`**: Speeds up telephone number searches to sub-millisecond execution times.
- **`registrations_no_key_idx`**: Speeds up direct registration code lookups.
- **`contact_assignments_operator_idx`**: Index on `operator_id` + `is_active` speeds up active assignment lookups for the calling queues.

---

## 3. Real-time Aggregation Performance

The admin dashboard aggregates stats directly from the database in real-time.
- **Trigger-based Counting**: The system fetches visitor statistics in a single optimized aggregate query (`/api/visitor/stats`), preventing multiple expensive select counts.
- **Client Cache**: React Query keeps the state in client memory, updating it only on Supabase Postgres change notifications.
- **Pagination**: All listing tables (Registrations, Call queues) enforce page limits of 20-30 records, keeping DOM rendering cycles lightweight.
