# Nested Comments System

A production-ready full-stack nested comments application built with **Next.js**, **Node.js**, **Express**, **MongoDB**, and **Socket.IO**.

It supports unlimited threaded discussions, real-time synchronization, optimistic UI updates, and cursor-based pagination.

---

## Features

- JWT Authentication
- Unlimited Nested Comments
- Real-time Updates with Socket.IO
- Like / Unlike Comments
- Edit & Delete Comments
- Full-text Search
- Cursor-based Pagination
- Optimistic UI
- Responsive Design

---

## Tech Stack

### Frontend

- Next.js 14
- TypeScript
- Tailwind CSS
- Redux Toolkit
- Axios
- React Hook Form
- Zod
- Socket.IO Client

### Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Socket.IO
- Express Validator
- Helmet
- Express Rate Limit

---

## Project Structure

```text
backend/
frontend/
README.md
```

---

## Installation

### Clone the repository

```bash
git clone https://github.com/DevDevansh12/nested-comments-system.git
cd nested-comments-system
```

### Install dependencies

```bash
# Backend
npm install

# Frontend
cd frontend
npm install
```

### Configure environment variables

Create the following files:

### Run the application

Backend

```bash
npm run dev
```

Frontend

```bash
cd frontend
npm run dev
```

---

## API Endpoints

### Authentication

| Method | Endpoint |
|--------|----------|
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/login` |
| GET | `/api/v1/auth/me` |

### Comments

| Method | Endpoint |
|--------|----------|
| GET | `/api/v1/comments` |
| POST | `/api/v1/comments` |
| POST | `/api/v1/comments/:id/reply` |
| PATCH | `/api/v1/comments/:id` |
| DELETE | `/api/v1/comments/:id` |
| POST | `/api/v1/comments/:id/like` |

---

## Future Improvements

- Refresh Token Support
- Email Verification
- Admin Dashboard
- Emoji Reactions
- Docker Deployment

---

## Author

**Devansh Variya**
