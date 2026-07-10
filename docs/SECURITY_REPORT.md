# Security Audit & Risk Assessment Report

This report documents the security mechanisms, session policies, input validation measures, and access control boundaries implemented in the Rathayatra Management System.

---

## 1. Authentication & Session Security

The application segregates administrative access from caller operators.

### Admin Authentication Boundary
- Handled through **Supabase Auth** via standard email/password exchange.
- **Unauthorized Bypass Prevention**: Client layout routes double-validate the user's Supabase UID against the `admins` table. If the UID is not registered in the database as an authorized administrator, the layout signs the user out and redirects them to the login screen.

### Operator Session Verification
- Authenticated via custom **JWT tokens** stored in a secure cookie (`operator-session`).
- Cookie Security Flags:
  - **`HttpOnly`**: Protects the token from client-side JavaScript access, mitigating Cross-Site Scripting (XSS) token-stealing attacks.
  - **`SameSite=Strict`**: Blocks token transmission in cross-site requests, mitigating Cross-Site Request Forgery (CSRF) attacks.
  - **`Secure`**: Enforces HTTPS transport in production.

---

## 2. Authorization & Scoped Operator Boundaries

Security enforcement is performed server-side for all operator APIs:

1. **Assigned Contact Limitation**: Operators are restricted from reading other operators' contacts.
   - Endpoint: `GET /api/assignments/my`
   - Security Control: Queries are hard-scoped to the `operator_id` extracted from the cryptographically verified JWT cookie.
2. **Assignment Update Constraints**: Operators cannot modify assignments that do not belong to them.
   - Endpoint: `PATCH /api/assignments/[id]`
   - Security Control: The route checks ownership prior to updating call status or notes.
3. **Check-In Scoping**: Operators cannot check in visitors who are not assigned to them.
   - Endpoint: `POST /api/visitor/check-in`
   - Security Control: Verification logic queries `contact_assignments` to check the `operator_id` ownership before check-in execution.
4. **Admin Panel Access Isolation**: Operators do not have administrative database credentials and cannot access `/admin/dashboard`, `/admin/operators`, or `/admin/registrations`.

---

## 3. Vulnerability Mitigation

- **SQL Injection (SQLi) Protection**: The system queries Supabase via the PostgREST API client, which uses parameterized queries. SQL statements are prepared, preventing code injection.
- **XSS Protection**: React escapes dynamically rendered variables by default. In addition, the application sanitizes custom values, and the `HttpOnly` session cookie blocks session theft.
- **Real-Time Subscription Isolation**: Channels are checked for token validity, preventing unauthorized listeners from monitoring database changes.
