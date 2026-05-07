# TrackU

A modern productivity and workflow management platform built to help users organize tasks, manage recurring workflows, plan schedules, and streamline productivity through an intuitive Kanban and calendar driven experience.

## Live Demo

[https://tracku-app.vercel.app/](https://tracku-app.vercel.app/)

Alternate Url:
[https://track-u-kappa.vercel.app/](https://track-u-kappa.vercel.app/)


## Overview

TrackU is a full stack inspired productivity platform designed with a modern frontend architecture and scalable state management patterns. The application combines Kanban style task management, recurring task scheduling, calendar planning, and responsive workflow organization into a unified experience.

The project focuses heavily on:

* Clean component architecture
* Reusable frontend systems
* Scalable state handling
* Modern React development patterns
* Real world deployment workflows
* Production ready environment management
* Responsive and intuitive UI interactions

## Features

### Task Management

* Create, edit, and delete tasks
* Organize workflows using Kanban boards
* Drag and drop task movement across columns
* Task prioritization and categorization
* Dynamic task updates with optimized rendering

### Recurring Workflow Engine

* Create recurring tasks
* Automate repetitive workflows
* Track recurring schedules efficiently
* Maintain long term productivity routines

### Calendar Planning

* Calendar based task visualization
* Schedule and manage workflow timelines
* Organized planning interface for daily tracking
* Time aware task management system

### Productivity Dashboard

* Unified productivity overview
* Multiple workflow views
* Fast and responsive interactions
* Clean modern interface

### Authentication and Backend Integration

* Supabase powered backend integration
* Secure authentication flows
* Environment variable driven configuration
* Scalable cloud backend architecture

## Tech Stack

### Frontend

* React
* Vite
* Tailwind CSS
* React Router
* TanStack React Query
* dnd-kit

### Backend and Services

* Supabase

### Deployment

* Vercel

## Project Structure

```bash
src/
├── components/
├── hooks/
├── lib/
├── pages/
├── integrations/
├── utils/
├── App.jsx
└── main.jsx
```

## Architecture Highlights

### Component Based Architecture

TrackU follows a modular component driven architecture to ensure scalability, maintainability, and reusable UI systems.

### State Management

The application uses React Query for optimized asynchronous state handling, caching, and backend synchronization.

### Modern Drag and Drop System

TrackU uses dnd-kit to provide smooth and scalable drag and drop functionality for task workflows.

### Environment Based Configuration

Sensitive credentials and runtime configurations are managed securely through environment variables.

## Environment Variables

Create a `.env` file in the root directory.

Example:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Installation and Local Setup

### Clone the Repository

```bash
git clone git@github.com:Udit-Rohilla/TrackU.git
```

### Navigate Into the Project

```bash
cd TrackU
```

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

The application will run locally on:

```bash
http://localhost:5173
```

## Production Deployment

TrackU is deployed using Vercel.

### Production Workflow

* Push code to GitHub
* Automatic deployment triggered through Vercel
* Environment variables managed securely through Vercel dashboard
* Continuous deployment enabled for production updates

## Screenshots

Add screenshots here:

```text
/screenshots/dashboard.png
/screenshots/board-view.png
/screenshots/calendar-view.png
/screenshots/recurring-tasks.png
```

## Future Improvements

Planned enhancements include:

* Real time collaboration
* Notifications and reminders
* Advanced analytics dashboard
* AI powered productivity recommendations
* Workspace and team support
* Offline support
* Keyboard shortcuts
* Dark mode improvements
* Activity tracking

## Engineering Focus

This project was built with strong emphasis on:

* Scalable frontend architecture
* Production oriented engineering practices
* Clean UI organization
* Reusable component systems
* Optimized asynchronous data handling
* Responsive design patterns
* Secure environment management
* Real world deployment workflows

## Why This Project Stands Out

TrackU is not a basic CRUD project or tutorial clone. The platform demonstrates:

* Complex frontend architecture
* Multi feature workflow systems
* Advanced UI interactions
* Real world deployment practices
* Product oriented engineering
* Modern React ecosystem usage

## Author

Udit Rohilla

* GitHub: [https://github.com/Udit-Rohilla](https://github.com/Udit-Rohilla)
* LinkedIn: [https://linkedin.com/in/udit-rohilla](https://linkedin.com/in/udit-rohilla)

## License

This project is licensed under the MIT License.
