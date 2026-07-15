# Contributing to AetherIQ

First off, thank you for considering contributing to AetherIQ! It's people like you that make AetherIQ a powerful tool for smart cities and urban health. 

This document outlines the process for contributing to the project, coding guidelines, and how to get your environment set up.

## Code of Conduct

By participating in this project, you are expected to uphold a welcoming, respectful, and inclusive environment for everyone. Please maintain professional and constructive communication in issues, pull requests, and discussions.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please create an issue on GitHub. Before creating a new issue, please check if the bug has already been reported. Include the following in your bug report:
- A clear and descriptive title.
- Steps to reproduce the behavior.
- Expected behavior vs actual behavior.
- Any relevant logs, screenshots, or environment details.

### Suggesting Enhancements

Enhancement suggestions are highly encouraged! Please open an issue and detail the following:
- A clear and descriptive title.
- A detailed description of the proposed feature.
- The use case or problem this enhancement solves.

### Pull Requests

1. **Fork the Repository:** Fork the project and clone it locally.
2. **Create a Branch:** Create a new branch for your feature or bugfix (`git checkout -b feature/your-feature-name` or `git checkout -b fix/your-bugfix`).
3. **Commit Your Changes:** Make sure your commit messages are descriptive and follow standard conventions (e.g., `feat: added new analytics dashboard`, `fix: corrected AQI calculation bug`).
4. **Push to the Branch:** Push your changes to your fork (`git push origin feature/your-feature-name`).
5. **Open a Pull Request:** Submit a PR against the `main` branch of the original repository. Ensure your PR description clearly explains the changes.

## Development Guidelines

### General Architecture
AetherIQ is split into three main components:
- `platform/frontend`: React (Vite) interface.
- `platform/backend`: Django REST APIs for core data.
- `platform/ai_service`: FastAPI service for machine learning (Forecasting, Simulation).

### Styling & UI
- We use custom CSS with CSS variables for theming (`platform/frontend/src/index.css`). 
- Maintain the professional, dark-theme aesthetic without using emojis in the code (use `lucide-react` icons).
- Ensure components are responsive and accessible.

### Backend & AI
- Follow PEP 8 guidelines for Python code.
- Write docstrings for new functions, classes, and modules.
- If adding new AI models, ensure they are integrated smoothly via the FastAPI service and return structured JSON responses.

### Testing
- Before submitting a PR, ensure that the application compiles and runs locally without errors.
- Run frontend checks, Django management commands, and FastAPI endpoints to verify full system functionality.

## Getting Help

If you need any help with the setup or have questions about the codebase, please open an issue with the `question` label, or reach out to the project maintainers.

Thank you for contributing to AetherIQ!
