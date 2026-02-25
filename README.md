# School Management System API (Elysia + Axion Template)

Backend Developer Technical Challenge implementation using the `qantra-io/axion` structure and manager/middleware architecture, with the HTTP layer migrated to **Elysia JS**.

## 1. Why Elysia JS For This Project

Elysia was selected for this assessment for practical backend reasons:

1. **High-performance request handling** with minimal overhead, which helps when adding RBAC checks, validation, and rate limiting on every endpoint.
2. **Clear route definitions** that make REST resources (`/schools`, `/classrooms`, `/students`) easy to maintain and review.
3. **Node adapter support** allowed migration from the original Express-based server while keeping the existing Axion manager/middleware architecture.
4. **Strong fit for growth**: the structure can be expanded to OpenAPI, tracing, and additional plugins without changing domain modules.

## 2. Implemented Requirements

- RESTful API implemented in JavaScript
- Role-based access control (RBAC)
- JWT authentication
- Redis-backed persistence with automatic in-memory fallback for restricted local environments
- Full CRUD for schools, classrooms, students
- Student transfer capability
- Input validation and standardized error responses
- API rate limiting and security headers
- Test suite with passing results
- Setup and deployment instructions

## 3. Architecture (Preserved Template Pattern)

This project follows a modular layered architecture

- `loaders/ManagersLoader.js`: dependency wiring and module registration
- `managers/entities/*`: domain logic (auth, schools, classrooms, students)
- `mws/*.mw.js`: authentication and authorization middleware
- `managers/api/Api.manager.js`: middleware stack execution + response orchestration
- `managers/http/UserServer.manager.js`: Elysia HTTP server and REST routes

## 4. Roles & Permissions

- `superadmin`
  - Full access to all schools/classrooms/students
  - Can create school administrators
- `school_admin`
  - Limited to assigned school resources
  - Can manage classrooms and students in their school only

## 5. Authentication Flow

1. Login using `POST /api/auth/login`
2. Receive JWT token
3. Send token as `Authorization: Bearer <token>`
4. Middleware chain:
   - `__authToken` validates JWT + active user
   - `__requireSuperAdmin` / `__requireSchoolAdminOrSuper` enforce role-level access

## 6. REST Endpoints

### API Documentation

- `GET /docs` (auto-generated Swagger UI)

### Auth

- `POST /api/auth/login`
- `GET /api/auth/profile`
- `POST /api/auth/school-admins` (superadmin)
- `GET /api/auth/users` (superadmin)

### Schools

- `POST /api/schools` (superadmin)
- `GET /api/schools` (superadmin sees all, school admin sees own)
- `GET /api/schools/:schoolId`
- `PATCH /api/schools/:schoolId` (superadmin)
- `DELETE /api/schools/:schoolId` (superadmin)

### Classrooms

- `POST /api/classrooms`
- `GET /api/classrooms`
- `GET /api/classrooms/:classroomId`
- `PATCH /api/classrooms/:classroomId`
- `DELETE /api/classrooms/:classroomId`

### Students

- `POST /api/students`
- `GET /api/students`
- `GET /api/students/:studentId`
- `PATCH /api/students/:studentId`
- `DELETE /api/students/:studentId`
- `POST /api/students/:studentId/transfer`

## 7. Request/Response Format

### Success

```json
{
  "ok": true,
  "data": {},
  "errors": [],
  "message": ""
}
```

### Error

```json
{
  "ok": false,
  "data": {},
  "errors": ["validation error"],
  "message": ""
}
```

## 8. HTTP Status Codes

- `200` OK
- `201` Created
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `405` Method Not Allowed
- `409` Conflict
- `422` Validation Error
- `429` Too Many Requests
- `500` Internal Server Error

## 9. Security Measures

- JWT authentication
- RBAC middleware checks
- Rate limiting (`RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS`)
- Security headers (`x-content-type-options`, `x-frame-options`, `referrer-policy`, CORS policy)
- Password hashing using `bcrypt`

## 10. Database Schema Design

Persistence uses Redis keys/sets (or in-memory fallback for restricted local execution).

For the complete schema and keyspace diagrams, see [DATABASE_DESIGN.md](./DATABASE_DESIGN.md).

## 11. Setup Instructions

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Update required secrets in `.env`:

- `LONG_TOKEN_SECRET`
- `SHORT_TOKEN_SECRET`

## 12. Run

```bash
npm start
```

Default port: `5111`

## 13. Tests

Run tests:

```bash
npm test
```

Current result:

- 1 integration suite
- 1 passed, 0 failed

## 14. Deployment Instructions

1. Provision Node.js runtime (recommended Node 20+ for production)
2. Set environment variables from `.env.example`
3. Configure Redis for persistent storage
4. Install deps and start:

```bash
npm install
npm start
```

5. Expose port `USER_PORT` via your hosting platform

## 15. Submission Placeholders

- Repository URL: `<your-public-repo-url>`
- Deployed API URL: `<your-deployed-api-url>`

## 16. Assumptions

- `superadmin` account is bootstrapped from environment variables.
- If Redis is not reachable, the service uses an in-memory fallback so reviewers can still run flows.
- School administrators are restricted to their assigned school's classrooms and students.
