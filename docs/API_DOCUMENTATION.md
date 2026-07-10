# API Documentation — Rathayatra Management System

This document outlines the API endpoints, request payloads, response payloads, authentication requirements, and security scopes.

---

## 1. Authentication Scopes

Every API route validates authentication using one of the following methods:
- **Admin Scope**: Verified via the client request's Bearer token (`Authorization: Bearer <supabase_jwt>`). Checked against the `admins` table.
- **Operator Scope**: Verified via the HTTP-only `operator-session` JWT cookie.

---

## 2. Visitor Management APIs

### GET `/api/visitor/search?q=<query>`
Searches for attendees by name, phone, or registration number.
- **Auth**: Admin or Operator
- **Operator Scoping**: If called by an operator, searches only contacts assigned to the operator.
- **Query Params**:
  - `q` (string, required): Registration ID (`REG-YYYY-000001`), phone prefix, or full name fragment.
- **Response (`200 OK`)**:
  ```json
  {
    "registrations": [
      {
        "id": "uuid-string",
        "registration_no": "REG-2026-000001",
        "full_name": "Srinivas Rao",
        "phone": "9876543210",
        "age": 28,
        "gender": "Male",
        "occupation": "Working",
        "area_of_stay": "Jayanagar",
        "company_college": "Google Inc",
        "interested_to_volunteer": true,
        "interested_to_dinner": true,
        "created_at": "2026-07-10T08:00:00Z",
        "volunteer_slot_time": "9 AM - 1 PM",
        "assigned_operator": {
          "id": "op-uuid",
          "name": "Operator A"
        },
        "visit": null
      }
    ]
  }
  ```

### POST `/api/visitor/check-in`
Checks in a visitor.
- **Auth**: Admin or Operator
- **Payload**:
  ```json
  {
    "registration_id": "uuid-string",
    "remarks": "Entry gate 2, manual check-in"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Visitor Checked In Successfully",
    "visit": {
      "id": "visit-uuid",
      "registration_no": "REG-2026-000001",
      "full_name": "Srinivas Rao",
      "checked_in_by": "Operator A",
      "visited_at": "2026-07-10T14:30:00Z"
    }
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Contact is not assigned to the operator.
  - `409 Conflict`: Visitor has already checked in.

### GET `/api/visitor/logs?limit=<limit>`
Retrieves the real-time visitor check-in logs.
- **Auth**: Admin or Operator
- **Query Params**:
  - `limit` (integer, optional, default: 50).
- **Response (`200 OK`)**:
  ```json
  {
    "logs": [
      {
        "id": "visit-uuid",
        "visited_at": "2026-07-10T14:30:00Z",
        "visit_method": "MANUAL_SEARCH",
        "registration_no": "REG-2026-000001",
        "full_name": "Srinivas Rao",
        "phone": "9876543210",
        "checked_in_by": "Operator A",
        "status": "Visited"
      }
    ]
  }
  ```

### GET `/api/visitor/stats`
Aggregates real-time attendance statistics.
- **Auth**: Admin or Operator
- **Response (`200 OK`)**:
  ```json
  {
    "stats": {
      "registered": 524,
      "visited": 204,
      "remaining": 320,
      "volunteer_visited": 45,
      "dinner_count": 182,
      "todays_visits": 204
    }
  }
  ```

---

## 3. Assignment & Operator APIs

### GET `/api/assignments/my?page=<page>&limit=<limit>&search=<search>&status=<status>`
Lists assigned contacts for the logged-in operator.
- **Auth**: Operator
- **Response (`200 OK`)**: Returns paginated active assignments.

### PATCH `/api/assignments/[id]`
Updates calling status and operator notes on an assignment.
- **Auth**: Operator (checks assignment ownership)
- **Payload**:
  ```json
  {
    "status": "Coming",
    "remarks": "Confirming attendance with 2 guests"
  }
  ```
- **Response (`200 OK`)**: Returns updated assignment.
